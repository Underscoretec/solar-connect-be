// src/controllers/conversationsController.ts
import config from '../../config';
import logger from '../logger';
import Conversation from './model';
import Attachment from '../attachments/model';
import { sendConversationLinkEmail, sendThankYouEmail } from '../../lib/mail';
import { normalizeEmail, isValidEmail } from '../../lib/helpers';
import { IConversation, IMessage } from '../interfaces';
import { callFormLlm, LlmTurnInput, LlmTurnOutput } from './openAiHanlder';
import { FORM_JSON2 } from '../../prompts/formJson';
import { getNextQuestion } from './flowManager';
import { buildProfileTree } from './buildProfileTree';
import Customer from '../customers/model';

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

/** Store collected answer with proper order path */
async function storeCollectedAnswer(
    conversation: IConversation,
    questionId: string,
    answer: any,
    nextOrder: string | null = null
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

    const newItem = {
        id: existingIndex >= 0
            ? conversation.meta.collectedProfile[existingIndex].id
            : `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        order: nextOrder || undefined,
        questionId: questionId,
        value: answer
    };

    if (existingIndex >= 0) {
        conversation.meta.collectedProfile[existingIndex] = newItem;
    } else {
        conversation.meta.collectedProfile.push(newItem);
    }

    // Mark the nested field as modified so Mongoose will save it
    conversation.markModified('meta');
    conversation.markModified('meta.collectedProfile');

    logger.info(`Stored answer for ${questionId}: ${JSON.stringify(answer).substring(0, 100)}`);
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

    // Get first question
    const next = getNextQuestion(FORM_JSON2 as any, []);
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
            attachmentsMeta: []
        };
        const out = await callFormLlm(llmIn);

        const assistantMessage = createAssistantMessage(
            out.assistantText || nextField.context || 'Hello! Let me collect some information from you.',
            {
                action: 'ask_question',
                questionId: nextField.questionId,
                assistantText: out.assistantText,
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
    attachments: AttachmentObject[] = []
): Promise<{ conversation: IConversation; metadata: any }> {
    const conversation = await Conversation.findById(conversationId).populate('messages.attachments');
    if (!conversation) throw new Error('Conversation not found');

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
    if (awaitingConfirmation) {
        // User is replying to confirmation
        const userText = typeof userMessageText === 'string' ? userMessageText : JSON.stringify(userMessageText);

        if (userText.toLowerCase().includes('confirm') || userText.toLowerCase().includes('submit') ||
            userText.toLowerCase().includes('yes') || userText.toLowerCase().includes('looks good')) {
            // User confirmed
            conversation.status = 'closed';

            const organizedProfile = buildProfileTree(collectedProfile);
            const userName = organizedProfile.full_name?.value || 'there';
            const userEmail = organizedProfile.email?.value;

            if (userEmail && isValidEmail(normalizeEmail(userEmail))) {
                try {
                    if (!conversation.meta.thankYouEmailSent) {
                        await sendThankYouEmail(
                            normalizeEmail(userEmail),
                            userName,
                            organizedProfile
                        );
                        conversation.meta.thankYouEmailSent = true;
                        metadata.thankYouEmailSent = true;
                    }
                } catch (err: any) {
                    logger.warn('Failed to send thank-you email: ' + String(err));
                }
            }

            const confirmMsg = createAssistantMessage(
                `Thank you ${userName}! I've collected all the necessary information. Our team will review your details and reach out within 24 hours with a customized solar solution.`,
                {
                    action: 'complete',
                    questionId: null,
                    assistantText: `Thank you ${userName}! I've collected all the necessary information. Our team will review your details and reach out within 24 hours with a customized solar solution.`,
                    answer: null,
                    validation: null,
                    updateFields: []
                }
            );
            conversation.messages.push(confirmMsg);
            conversation.messageCount = (conversation.messageCount || 0) + 1;
            metadata.completed = true;
            metadata.organizedProfile = organizedProfile;
            await conversation.save();
            return { conversation, metadata };
        } else {
            // User wants to update or unclear - treat as normal message
            // Continue to normal flow below
        }
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

    let parseOutput: LlmTurnOutput | null = null;
    try {
        const parseInput: LlmTurnInput = {
            field: currentField,
            collectedProfile: collectedProfile,
            lastUserMessage: typeof userMessageText === 'string' ? userMessageText : JSON.stringify(userMessageText),
            attachmentsMeta
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
                assistantText: "I'm having trouble understanding that. Could you please rephrase your answer?",
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
                assistantText: parseOutput.assistantText,
                answer: null,
                validation: parseOutput.validation,
                updateFields: []
            },
            parseOutput.questionId || ''
        );
        conversation.messages.push(clarifyMsg);
        conversation.messageCount = (conversation.messageCount || 0) + 1;
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
                assistantText: parseOutput.assistantText,
                answer: null,
                validation: null,
                updateFields: parseOutput.updateFields || []
            },
            parseOutput.questionId || ''
        );
        conversation.messages.push(updateMsg);
        conversation.messageCount = (conversation.messageCount || 0) + 1;
        // Future: handle update logic here
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
                assistantText: parseOutput.assistantText,
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

        // Recompute next question
        const nextQuestionResult = getNextQuestion(FORM_JSON2 as any, collectedProfile);
        const nextField = nextQuestionResult.nextField;

        if (nextField) {
            // Ask the previous question
            const askInput: LlmTurnInput = {
                field: nextField,
                collectedProfile: collectedProfile,
                lastUserMessage: null,
                attachmentsMeta: []
            };
            const askOutput = await callFormLlm(askInput);

            const askMsg = createAssistantMessage(
                askOutput.assistantText || nextField.context || 'Could you provide this information?',
                {
                    action: 'ask_question',
                    questionId: nextField.questionId,
                    assistantText: askOutput.assistantText || nextField.context || 'Could you provide this information?',
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
            await storeCollectedAnswer(conversation, qId, ans, currentNextOrder);

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
                assistantText: parseOutput.assistantText || "Got it, thanks!",
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
                metadata.customerCreated = true;
            }
        }

        // ========== STEP F: Update Conversation Meta ==========
        conversation.meta.collectedProfile = collectedProfile;
        conversation.markModified('meta');
        conversation.markModified('meta.collectedProfile');

        // ========== STEP G: Email Detection ==========
        if (qId === 'email' && ans && !conversation.meta.conversationEmailSent) {
            try {
                const normalized = normalizeEmail(String(ans));
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
                    metadata.emailSent = true;
                    logger.info(`Sent conversation link to ${normalized}`);
                }
            } catch (err: any) {
                logger.warn('Failed to send conversation link email: ' + String(err));
            }
        }

        // ========== STEP H: Ask the Next Question ==========
        const nextQuestionResult = getNextQuestion(FORM_JSON2 as any, collectedProfile);
        const nextField = nextQuestionResult.nextField;

        logger.info(`Next question: ${nextField?.questionId || 'none'}, isComplete: ${nextQuestionResult.isComplete}`);

        // If no next field, send final confirmation
        if (!nextField || nextQuestionResult.isComplete) {
            // Stop calling LLM - send final confirmation message
            const organizedProfile = buildProfileTree(collectedProfile);
            const userName = organizedProfile.full_name?.value || '';

            const confirmMsg = createAssistantMessage(
                `Perfect${userName ? ', ' + userName : ''}! I've collected all your information. Please review the details shown below and click 'Submit' to confirm or 'I want to update my info' if you need to make any changes.`,
                {
                    action: null,
                    questionId: null,
                    assistantText: `Perfect${userName ? ', ' + userName : ''}! I've collected all your information. Please review the details shown below and click 'Submit' to confirm or 'I want to update my info' if you need to make any changes.`,
                    answer: null,
                    validation: null,
                    updateFields: [],
                    awaitingConfirmation: true,
                    organizedProfile: organizedProfile,
                    completionMessage: nextQuestionResult.completionMessage
                }
            );
            conversation.messages.push(confirmMsg);
            conversation.messageCount = (conversation.messageCount || 0) + 1;
            metadata.awaitingConfirmation = true;
            metadata.organizedProfile = organizedProfile;
            await conversation.save();
            return { conversation, metadata };
        }

        // Ask the next question
        const askInput: LlmTurnInput = {
            field: nextField,
            collectedProfile: collectedProfile,
            lastUserMessage: null,
            attachmentsMeta: []
        };
        const askOutput = await callFormLlm(askInput);

        const askText = askOutput.assistantText ||
            nextField?.context ||
            nextField?.placeholder ||
            'Could you provide this information?';

        const askMsg = createAssistantMessage(
            askText,
            {
                action: 'ask_question',
                questionId: nextField.questionId,
                assistantText: askText,
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