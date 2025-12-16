import config from '../../config';
import logger from '../logger';
import Conversation from './model';
import { sendConversationLinkEmail, sendThankYouEmail } from '../../lib/mail';
import { normalizeEmail, isValidEmail } from '../../lib/helpers';
import { IConversation, IMessage } from '../interfaces';
import { callFormLlm, LlmTurnInput, LlmTurnOutput } from './llm';
import { FORM_JSON2 } from '../../prompts/formJson';
import { getNextQuestion, removeAnswerWithChildren } from './flowManager';
import { buildProfileTree } from './buildProfileTree';
import Customer from '../customers/model';
import { getActiveFormConfigField } from '../formConfig/controllers';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

interface CreateConversationParams {
    sessionId?: string;
    visitorFingerprint?: string;
    ip?: string;
    userAgent?: string;
    formConfigId?: string;
    initialUserResponse?: string;
}

// ========= Utilities =========

interface AttachmentObject {
    _id: string;
    url: string;
    filename: string;
    type: string;
    mimeType: string;
    size: number;
}

function createUserMessage(text: string, attachmentIds: string[]): IMessage {
    return {
        role: 'user',
        text,
        attachments: (attachmentIds || []).map(id => id as any),
        createdAt: new Date()
    };
}

function createAssistantMessage(text: string, payload: any, questionId?: string): IMessage {
    return {
        role: 'assistant',
        text,
        payload,
        questionId: questionId || (payload?.questionId ?? null),
        createdAt: new Date()
    };
}

/** Transform flat array of attachments into nested structure grouped by type */
function transformAttachmentsToNestedStructure(
    attachments: AttachmentObject[],
    currentNextOrder: string | null
): Record<string, any> {
    if (!attachments || attachments.length === 0) return {};

    const nested: Record<string, any> = {};

    attachments.forEach((attachment, index) => {
        const fieldId = attachment.type;
        const orderPath = currentNextOrder ? `${currentNextOrder}:${index + 1}` : `${index + 1}`;

        nested[fieldId] = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            order: orderPath,
            questionId: fieldId,
            value: {
                name: attachment.filename,
                url: attachment.url
            }
        };
    });

    return nested;
}

/** Extract and format last 3 messages for LLM context */
function getLast3Messages(messages: IMessage[]): Array<{ role: "user" | "assistant" | "system"; text: string }> {
    const last3 = messages.slice(-3);
    return last3.map(msg => ({
        role: msg.role,
        text: msg.text || ''
    }));
}

/** Store collected answer with proper order path */
async function storeCollectedAnswer(
    conversation: IConversation,
    questionId: string,
    answer: any,
    nextOrder: string | null = null,
    fieldType?: string
) {
    if (!conversation.meta) conversation.meta = {};
    if (!conversation.meta.collectedProfile) conversation.meta.collectedProfile = [];
    if (!Array.isArray(conversation.meta.collectedProfile)) {
        conversation.meta.collectedProfile = [];
    }

    // Check if this questionId already exists
    const existingIndex = conversation.meta.collectedProfile.findIndex(
        (item: any) => item && item.questionId === questionId
    );

    // Determine the final value to store
    let finalValue = answer;

    // For form type fields, merge objects instead of replacing
    if (existingIndex >= 0 && fieldType === 'form') {
        const existingValue = conversation.meta.collectedProfile[existingIndex].value;

        // Check if both existing value and new answer are plain objects (not arrays, not null)
        const isExistingObject = existingValue &&
            typeof existingValue === 'object' &&
            !Array.isArray(existingValue) &&
            existingValue.constructor === Object;

        const isNewAnswerObject = answer &&
            typeof answer === 'object' &&
            !Array.isArray(answer) &&
            answer.constructor === Object;

        // Merge objects if both are plain objects
        if (isExistingObject && isNewAnswerObject) {
            finalValue = {
                ...existingValue,
                ...answer
            };
            logger.info(`Merged form field values for ${questionId}. Existing keys: ${Object.keys(existingValue).join(', ')}, New keys: ${Object.keys(answer).join(', ')}`);
        }
    }

    const newItem = {
        id: existingIndex >= 0
            ? conversation.meta.collectedProfile[existingIndex].id
            : `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        order: nextOrder || undefined,
        questionId: questionId,
        value: finalValue
    };

    if (existingIndex >= 0) {
        conversation.meta.collectedProfile[existingIndex] = newItem;
    } else {
        conversation.meta.collectedProfile.push(newItem);
    }

    // Mark the nested field as modified so Mongoose will save it
    conversation.markModified('meta');
    conversation.markModified('meta.collectedProfile');

    logger.info(`Stored answer for ${questionId}: ${JSON.stringify(finalValue).substring(0, 100)}`);
}

// ========== Main Functions ==========

export async function createConversation(params: CreateConversationParams): Promise<IConversation> {
    const conversation = new Conversation({
        sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        visitorFingerprint: params.visitorFingerprint,
        ip: params.ip,
        userAgent: params.userAgent,
        status: 'open',
        messages: [],
        messageCount: 0,
        fileStats: {
            totalUploads: 0,
            uploadedTypes: []
        },
        meta: {
            collectedProfile: []
        }
    });

    await conversation.save();
    logger.info(`Conversation created: ${conversation._id}`);

    const formJson = await getActiveFormConfigField('formJson');
    // Get first question
    const next = getNextQuestion(formJson as any, []);
    const nextField = next.nextField || null;

    if (!nextField) {
        throw new Error('No first question found in form definition');
    }

    // Ask LLM to produce the first question
    try {
        const llmIn: LlmTurnInput = {
            field: nextField,
            collectedProfile: [],
            lastUserMessage: null,
            attachmentsMeta: [],
            last3Messages: []
        };
        const out = await callFormLlm(llmIn);

        const assistantMessage = createAssistantMessage(
            out.assistantText || nextField.context || 'Hello! Let me collect some information from you.',
            {
                action: 'ask_question',
                questionId: nextField.questionId,
                answer: null,
                validation: null,
                updateFields: [],
                field: nextField,
                orderPath: next.orderPath,
                nextOrder: next.nextOrder
            },
            nextField.questionId
        );

        conversation.messages.push(assistantMessage);
        conversation.messageCount = 1;
        await conversation.save();
    } catch (err: any) {
        logger.error('Failed to get initial question from LLM: ' + String(err));
        throw err;
    }

    return conversation;
}

export async function sendMessageWithBusinessLogic(
    conversationId: string,
    userMessageText: string | null,
    attachments: AttachmentObject[] = [],
    isConformed: boolean = false
): Promise<{ conversation: IConversation; metadata: any }> {
    const conversation = await Conversation.findById(conversationId).populate('messages.attachments');
    if (!conversation) throw new Error('Conversation not found');

    const formJson = await getActiveFormConfigField('formJson');

    const metadata: any = {};
    const normalizedAttachments = attachments || [];
    const attachmentIds = normalizedAttachments.map(a => a._id);

    // Ensure meta.collectedProfile exists
    if (!conversation.meta) conversation.meta = {};
    if (!conversation.meta.collectedProfile) conversation.meta.collectedProfile = [];

    let collectedProfile = Array.isArray(conversation.meta.collectedProfile)
        ? conversation.meta.collectedProfile
        : [];

    // Check if we're in confirmation stage
    const allAssistantMessages = [...conversation.messages]
        .filter(m => m.role === 'assistant')
        .reverse();
    const lastMessage = allAssistantMessages[0];
    const awaitingConfirmation = lastMessage?.payload?.awaitingConfirmation === true;

    // ========== STEP A: Save User Message ==========
    if (userMessageText !== null) {
        const userMessage = createUserMessage(
            typeof userMessageText === 'string' ? userMessageText : JSON.stringify(userMessageText),
            attachmentIds
        );
        conversation.messages.push(userMessage);
        conversation.messageCount = (conversation.messageCount || 0) + 1;
    }

    // ========== Handle Confirmation Stage ==========
    if (awaitingConfirmation && isConformed) {
        // User confirmed
        conversation.status = 'closed';
        metadata.isCompleted = true;
        const customer = await Customer.findById(conversation.customerId);

        const organizedProfile = customer?.profile;
        const userName = customer?.fullName || 'there';
        const userEmail = customer?.email;

        if (userEmail) {
            try {
                if (conversation.meta.statusChanged) {
                    //send update email
                    await sendThankYouEmail(
                        normalizeEmail(userEmail),
                        userName,
                        organizedProfile
                    );
                } else {
                    //send first time email
                    await sendThankYouEmail(
                        normalizeEmail(userEmail),
                        userName,
                        organizedProfile
                    );
                }
            } catch (err: any) {
                logger.warn('Failed to send thank-you email: ' + String(err));
            }
        }

        const completionMessage = await callFormLlm({
            field: null,
            collectedProfile: collectedProfile,
            lastUserMessage: null,
            attachmentsMeta: [],
            completionMessage: formJson.completion.message || "generate a completion message for the conversation",
            last3Messages: getLast3Messages(conversation.messages)
        });

        const completionText = completionMessage.assistantText;

        const confirmMsg = createAssistantMessage(
            completionText,
            {
                action: 'complete',
                questionId: null,
                answer: null,
                validation: null,
                updateFields: []
            }
        );
        conversation.messages.push(confirmMsg);
        conversation.messageCount = (conversation.messageCount || 0) + 1;
        await conversation.save();
        return { conversation, metadata };
    }

    // ========== STEP B: Call LLM for Parsing ==========
    // Get current question context
    const lastAskMessage = allAssistantMessages.find(m => m.payload?.action === 'ask_question') as IMessage | undefined;
    const currentField = lastAskMessage?.payload?.field || null;
    const currentNextOrder = lastAskMessage?.payload?.nextOrder || null;

    // Prepare attachments metadata for LLM
    const attachmentsMeta = normalizedAttachments.map(a => ({
        id: a._id,
        type: a.type,
        mimeType: a.mimeType,
        size: a.size
    }));

    // Extract last 3 messages for LLM context
    const last3Messages = getLast3Messages(conversation.messages);

    let parseOutput: LlmTurnOutput | null = null;
    try {
        const parseInput: LlmTurnInput = {
            field: currentField,
            collectedProfile: collectedProfile,
            lastUserMessage: typeof userMessageText === 'string' ? userMessageText : JSON.stringify(userMessageText),
            attachmentsMeta,
            last3Messages
        };
        parseOutput = await callFormLlm(parseInput);
        logger.info(`Parse output: ${JSON.stringify(parseOutput).substring(0, 200)}`);
    } catch (err: any) {
        logger.error('LLM parse failed: ' + String(err));
        const errorMsg = createAssistantMessage(
            "I'm having trouble understanding that. Could you please rephrase your answer?",
            {
                action: 'clarify',
                questionId: currentField?.questionId || null,
                answer: null,
                validation: { isValid: false, errors: ['parse_error'], normalized: null },
                updateFields: []
            },
            currentField?.questionId || ''
        );
        conversation.messages.push(errorMsg);
        conversation.messageCount = (conversation.messageCount || 0) + 1;
        await conversation.save();
        return { conversation, metadata };
    }

    // ========== STEP C: Handle Different Actions ==========

    // Action: clarify
    if (parseOutput.action === 'clarify') {
        const clarifyMsg = createAssistantMessage(
            parseOutput.assistantText,
            {
                action: 'clarify',
                questionId: parseOutput.questionId,
                answer: null,
                validation: parseOutput.validation,
                updateFields: [],
                field: parseOutput?.repeatQuestion ? lastAskMessage?.payload?.field : null,
                orderPath: parseOutput?.repeatQuestion ? lastAskMessage?.payload?.orderPath : null,
                nextOrder: parseOutput?.repeatQuestion ? lastAskMessage?.payload?.nextOrder : null
            },
            parseOutput.questionId || ''
        );
        conversation.messages.push(clarifyMsg);
        conversation.messageCount = (conversation.messageCount || 0) + 1;

        // If conversation status is 'closed', change to 'open' (reopened)
        if (conversation.status === 'closed') {
            conversation.status = 'open';
            conversation.meta.statusChanged = true;
        }

        await conversation.save();
        return { conversation, metadata };
    }

    // Action: update_answer
    if (parseOutput.action === 'update_answer') {
        const updateMsg = createAssistantMessage(
            parseOutput.assistantText,
            {
                action: 'update_answer',
                questionId: parseOutput.questionId,
                answer: null,
                validation: null,
                updateFields: parseOutput.updateFields || []
            },
            parseOutput.questionId || ''
        );
        conversation.messages.push(updateMsg);
        conversation.messageCount = (conversation.messageCount || 0) + 1;

        // Handle update logic: remove the answer and its children
        if (parseOutput.updateFields && parseOutput.updateFields.length > 0) {
            const updateField = parseOutput.updateFields[0]; // Get first field to update
            const targetId = updateField.id;
            const targetQuestionId = updateField.questionId;

            // Remove answer with children using removeAnswerWithChildren
            const updatedCollectedProfile = removeAnswerWithChildren(
                collectedProfile,
                targetId,
                targetQuestionId
            );

            // Update conversation's collectedProfile
            conversation.meta.collectedProfile = updatedCollectedProfile;
            conversation.markModified('meta');
            conversation.markModified('meta.collectedProfile');

            // Refresh collected profile
            collectedProfile = updatedCollectedProfile;

            // If conversation status is 'closed', change to 'open' (reopened)
            if (conversation.status === 'closed') {
                conversation.status = 'open';
                conversation.meta.statusChanged = true;
            }


            // Rebuild customer profile and update
            const tree = buildProfileTree(collectedProfile);
            if (conversation.customerId) {
                try {
                    const customer = await Customer.findById(conversation.customerId);
                    if (customer) {
                        customer.profile = {
                            ...customer.profile,
                            ...tree
                        };
                        customer.meta = {
                            ...customer.meta,
                            lastUpdated: new Date()
                        };
                        await customer.save();
                    }
                } catch (err: any) {
                    logger.warn('Failed to update customer on update_answer: ' + String(err));
                }
            }

            // Find next question
            const nextQuestionResult = getNextQuestion(formJson as any, collectedProfile);
            const nextField = nextQuestionResult.nextField;

            if (nextField) {
                // Ask the next question
                const askInput: LlmTurnInput = {
                    field: nextField,
                    collectedProfile: collectedProfile,
                    lastUserMessage: null,
                    attachmentsMeta: [],
                    last3Messages: getLast3Messages(conversation.messages)
                };
                const askOutput = await callFormLlm(askInput);

                const askMsg = createAssistantMessage(
                    askOutput.assistantText || nextField.context || 'Could you provide this information?',
                    {
                        action: 'ask_question',
                        questionId: nextField.questionId,
                        answer: null,
                        validation: null,
                        updateFields: [],
                        field: nextField,
                        orderPath: nextQuestionResult.orderPath,
                        nextOrder: nextQuestionResult.nextOrder
                    },
                    nextField.questionId
                );
                conversation.messages.push(askMsg);
                conversation.messageCount = (conversation.messageCount || 0) + 1;
            }
        }

        await conversation.save();
        return { conversation, metadata };
    }

    // Action: go_back
    if (parseOutput.action === 'go_back') {
        const goBackMsg = createAssistantMessage(
            parseOutput.assistantText,
            {
                action: 'go_back',
                questionId: null,
                answer: null,
                validation: null,
                updateFields: []
            }
        );
        conversation.messages.push(goBackMsg);
        conversation.messageCount = (conversation.messageCount || 0) + 1;

        // Remove last entry from collectedProfile
        if (collectedProfile.length > 0) {
            collectedProfile.pop();
            conversation.meta.collectedProfile = collectedProfile;
            conversation.markModified('meta');
            conversation.markModified('meta.collectedProfile');
        }

        // If conversation status is 'closed', change to 'open' (reopened)
        if (conversation.status === 'closed') {
            conversation.status = 'open';
            conversation.meta.statusChanged = true;
        }

        // Recompute next question
        const nextQuestionResult = getNextQuestion(formJson as any, collectedProfile);
        const nextField = nextQuestionResult.nextField;

        if (nextField) {
            // Ask the previous question
            const askInput: LlmTurnInput = {
                field: nextField,
                collectedProfile: collectedProfile,
                lastUserMessage: null,
                attachmentsMeta: [],
                last3Messages: getLast3Messages(conversation.messages)
            };
            const askOutput = await callFormLlm(askInput);

            const askMsg = createAssistantMessage(
                askOutput.assistantText || nextField.context || 'Could you provide this information?',
                {
                    action: 'ask_question',
                    questionId: nextField.questionId,
                    answer: null,
                    validation: null,
                    updateFields: [],
                    field: nextField,
                    orderPath: nextQuestionResult.orderPath,
                    nextOrder: nextQuestionResult.nextOrder
                },
                nextField.questionId
            );
            conversation.messages.push(askMsg);
            conversation.messageCount = (conversation.messageCount || 0) + 1;
        }

        // Rebuild customer profile and update
        const tree = buildProfileTree(collectedProfile);
        if (conversation.customerId) {
            try {
                const customer = await Customer.findById(conversation.customerId);
                if (customer) {
                    customer.profile = {
                        ...customer.profile,
                        ...tree
                    };
                    customer.meta = {
                        ...customer.meta,
                        lastUpdated: new Date()
                    };
                    await customer.save();
                }
            } catch (err: any) {
                logger.warn('Failed to update customer on go_back: ' + String(err));
            }
        }

        await conversation.save();
        return { conversation, metadata };
    }

    // Action: store_answer
    if (parseOutput.action === 'store_answer') {
        // ========== STEP C: Store the Answer ==========
        const qId = parseOutput.questionId;
        let ans = parseOutput.answer ?? parseOutput.validation?.normalized ?? null;

        // SPECIAL: Transform file attachments into nested structure
        if (normalizedAttachments.length > 0 && currentField?.type === 'files') {
            ans = transformAttachmentsToNestedStructure(normalizedAttachments, currentNextOrder);
            logger.info(`Transformed ${normalizedAttachments.length} attachments into nested structure for ${qId}`);
        }

        if (qId && ans !== null && ans !== undefined) {
            await storeCollectedAnswer(conversation, qId, ans, currentNextOrder, currentField?.type);

            // Refresh collected profile
            collectedProfile = Array.isArray(conversation.meta.collectedProfile)
                ? conversation.meta.collectedProfile
                : [];

            logger.info(`Stored answer for ${qId}. Total collected: ${collectedProfile.length}`);
        }

        // Save assistant acknowledgment
        const ackMsg = createAssistantMessage(
            parseOutput.assistantText || "Got it, thanks!",
            {
                action: 'store_answer',
                questionId: parseOutput.questionId,
                answer: ans,
                validation: parseOutput.validation,
                updateFields: []
            },
            parseOutput.questionId || ''
        );
        conversation.messages.push(ackMsg);
        conversation.messageCount = (conversation.messageCount || 0) + 1;

        // ========== STEP D: Build Customer Profile ==========
        const tree = buildProfileTree(collectedProfile);

        // ========== STEP E: Create or Update Customer ==========
        if (conversation.customerId) {
            // Update existing customer
            try {
                const customer = await Customer.findById(conversation.customerId);
                if (customer) {
                    customer.profile = {
                        ...customer.profile,
                        ...tree
                    };
                    customer.meta = {
                        ...customer.meta,
                        lastConversationId: conversation._id.toString(),
                        lastUpdated: new Date()
                    };
                    await customer.save();
                    logger.info(`Updated existing customer: ${customer._id}`);
                }
            } catch (err: any) {
                logger.warn('Failed to update customer: ' + String(err));
            }
        } else {

            // Create new customer
            const customer = new Customer({
                profile: {
                    ...tree,
                    leadStage: 'new_prospect'
                },
                meta: {
                    firstConversationId: conversationId,
                    createdAt: new Date()
                }
            });
            await customer.save();
            logger.info(`Created new customer: ${customer._id}`);
            if (customer) {
                conversation.customerId = customer._id as any;
            }
        }


        // If conversation status is 'closed', change to 'open' (reopened)
        if (conversation.status === 'closed') {
            conversation.status = 'open';
            conversation.meta.statusChanged = true;
        }

        // ========== STEP F: Update Conversation Meta ==========
        conversation.meta.collectedProfile = collectedProfile;
        conversation.markModified('meta');
        conversation.markModified('meta.collectedProfile');

        const emailFromLlm = parseOutput.emailFound ? String(parseOutput.emailFound).trim() : '';
        const nameFromLlm = parseOutput.nameFound ? String(parseOutput.nameFound).trim() : '';

        // ========== STEP G: Email Detection ==========
        if (emailFromLlm && !conversation.meta.conversationEmailSent) {
            try {
                const normalized = normalizeEmail(emailFromLlm);
                if (isValidEmail(normalized)) {
                    const customer = await Customer.findById(conversation.customerId);
                    if (customer) {
                        customer.email = normalized;
                        await customer.save();
                        logger.info(`Updated customer email: ${customer._id}`);
                    }
                    await sendConversationLinkEmail(
                        normalized,
                        `${FRONTEND_URL}/chat?conversationId=${conversation._id}`
                    );
                    conversation.meta.conversationEmailSent = true;
                    metadata.conversationEmailSent = true;
                    logger.info(`Sent conversation link to ${normalized}`);
                }
            } catch (err: any) {
                logger.warn('Failed to send conversation link email: ' + String(err));
            }
        }

        // ========== STEP G.1: Full Name Detection ==========
        if (nameFromLlm) {
            try {
                const customer = await Customer.findById(conversation.customerId);
                if (customer) {
                    customer.fullName = nameFromLlm;
                    await customer.save();
                    logger.info(`Updated customer full name: ${customer._id}`);
                }
            } catch (err: any) {
                logger.warn('Failed to update customer full name: ' + String(err));
            }
        }

        // ========== STEP H: Ask the Next Question ==========
        const nextQuestionResult = getNextQuestion(formJson as any, collectedProfile);
        const nextField = nextQuestionResult.nextField;

        logger.info(`Next question: ${nextField?.questionId || 'none'}, isComplete: ${nextQuestionResult.isComplete}`);

        // If no next field, send final confirmation
        if (!nextField || nextQuestionResult.isComplete) {
            // Stop calling LLM - send final confirmation message
            const customer = await Customer.findById(conversation.customerId);
            const userName = customer?.fullName || '';
            const customerProfile = customer?.profile;

            const confirmMsg = createAssistantMessage(
                `Perfect${userName ? ', ' + userName : ''}! I've collected all your information. Please review the details shown below and click 'Submit' to confirm or 'I want to update my info' if you need to make any changes.`,
                {
                    action: null,
                    questionId: null,
                    answer: null,
                    validation: null,
                    updateFields: [],
                    awaitingConfirmation: true,
                    organizedProfile: customerProfile,
                    completionMessage: nextQuestionResult.completionMessage
                }
            );
            conversation.messages.push(confirmMsg);
            conversation.messageCount = (conversation.messageCount || 0) + 1;
            await conversation.save();
            return { conversation, metadata };
        }

        // Ask the next question
        const askInput: LlmTurnInput = {
            field: nextField,
            collectedProfile: collectedProfile,
            lastUserMessage: null,
            attachmentsMeta: [],
            last3Messages: getLast3Messages(conversation.messages)
        };
        const askOutput = await callFormLlm(askInput);

        const askText = askOutput.assistantText || 'Could you provide this information?';

        const askMsg = createAssistantMessage(
            askText,
            {
                action: 'ask_question',
                questionId: nextField.questionId,
                answer: null,
                validation: null,
                updateFields: [],
                field: nextField,
                orderPath: nextQuestionResult.orderPath,
                nextOrder: nextQuestionResult.nextOrder
            },
            nextField.questionId
        );
        conversation.messages.push(askMsg);
        conversation.messageCount = (conversation.messageCount || 0) + 1;
    }

    // Update file stats
    if (normalizedAttachments.length > 0) {
        if (!conversation.fileStats) {
            (conversation as any).fileStats = { totalUploads: 0, uploadedTypes: [] };
        }
        conversation.fileStats!.totalUploads = (conversation.fileStats!.totalUploads || 0) + normalizedAttachments.length;
        const types = attachmentsMeta.map(a => a.type).filter(Boolean);
        conversation.fileStats!.uploadedTypes = Array.from(
            new Set([...(conversation.fileStats!.uploadedTypes || []), ...types])
        );
    }

    await conversation.save();
    await conversation.populate('messages.attachments');

    return { conversation, metadata };
}

// ==================== QUERY FUNCTIONS ====================

export async function getConversationById(conversationId: string): Promise<IConversation | null> {
    return await Conversation.findById(conversationId)
        .populate('customerId')
        .populate('messages.attachments');
}

export async function updateConversationCustomer(
    conversationId: string,
    customerId: string
): Promise<IConversation | null> {
    return await Conversation.findByIdAndUpdate(
        conversationId,
        { customerId },
        { new: true }
    );
}

export async function updateConversationStatus(
    conversationId: string,
    status: 'open' | 'closed' | 'followup'
): Promise<IConversation | null> {
    return await Conversation.findByIdAndUpdate(
        conversationId,
        { status },
        { new: true }
    );
}

export async function getConversationsList(params: {
    page?: number;
    limit?: number;
    status?: string;
    customerId?: string;
}): Promise<{ conversations: IConversation[]; total: number }> {
    const page = params.page || 1;
    const limit = params.limit || config.defaultDataPerPage;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (params.status) query.status = params.status;
    if (params.customerId) query.customerId = params.customerId;

    const conversations = await Conversation.find(query)
        .populate('customerId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const total = await Conversation.countDocuments(query);

    return { conversations, total };
}

export async function getDashboardStats(): Promise<{
    totalConversations: number;
    openConversations: number;
    totalCustomers: number;
    recentConversations: number;
    leadStages: {
        newProspects: number;
        marketingQualified: number;
        salesQualified: number;
        existingCustomers: number;
    };
}> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
        totalConversations,
        openConversations,
        totalCustomers,
        recentConversations
    ] = await Promise.all([
        Conversation.countDocuments(),
        Conversation.countDocuments({ status: 'open' }),
        Customer.countDocuments(),
        Conversation.countDocuments({ createdAt: { $gte: sevenDaysAgo } })
    ]);

    const customers = await Customer.find({ 'profile.leadStage': { $exists: true } })
        .select('profile.leadStage profile.lead_stage')
        .lean();

    const leadStages = {
        newProspects: 0,
        marketingQualified: 0,
        salesQualified: 0,
        existingCustomers: 0,
    };

    customers.forEach((customer: any) => {
        if (customer.profile) {
            const leadStage = customer.profile.leadStage || customer.profile.lead_stage;
            if (leadStage === 'new_prospect') leadStages.newProspects++;
            else if (leadStage === 'marketing_qualified') leadStages.marketingQualified++;
            else if (leadStage === 'sales_qualified') leadStages.salesQualified++;
            else if (leadStage === 'existing_customer' || leadStage === 'returning_customer') {
                leadStages.existingCustomers++;
            }
        }
    });

    return {
        totalConversations,
        openConversations,
        totalCustomers,
        recentConversations,
        leadStages
    };
}


