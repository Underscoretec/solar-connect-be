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
import Customer from '../customers/model';
import mongoose from 'mongoose';

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

async function loadAttachmentsMeta(ids: string[] = []) {
    if (!ids || ids.length === 0) return [];
    const docs = await Attachment.find({ _id: { $in: ids } }).lean();
    return docs.map(d => ({
        id: d._id.toString(),
        type: d.type,
        mimeType: d.mimeType,
        size: d.size
    }));
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

/** Convert collectedProfile array to object format for LLM */
function collectedProfileArrayToObject(collectedProfile: any[]): Record<string, any> {
    if (!Array.isArray(collectedProfile)) return {};
    const obj: Record<string, any> = {};

    for (const item of collectedProfile) {
        if (item && item.questionId) {
            obj[item.questionId] = item.value;
        }
    }
    return obj;
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

/** Create or update customer when email is received */
async function createOrUpdateCustomer(
    collectedProfile: any[],
    conversationId: string
): Promise<string | null> {
    const profileObj = collectedProfileArrayToObject(collectedProfile);
    const email = profileObj.email;

    if (!email || !isValidEmail(normalizeEmail(email))) {
        return null;
    }

    const normalizedEmail = normalizeEmail(email);

    try {
        // Find existing customer by email
        let customer = await Customer.findOne({ 'profile.email': normalizedEmail });

        if (customer) {
            // Update existing customer with new data
            customer.profile = {
                ...customer.profile,
                ...profileObj,
                email: normalizedEmail,
                leadStage: customer.profile?.leadStage || 'returning_customer'
            };
            customer.meta = {
                ...customer.meta,
                lastConversationId: conversationId,
                lastUpdated: new Date()
            };
            await customer.save();
            logger.info(`Updated existing customer: ${customer._id}`);
        } else {
            // Create new customer
            customer = new Customer({
                profile: {
                    ...profileObj,
                    email: normalizedEmail,
                    leadStage: 'new_prospect'
                },
                meta: {
                    firstConversationId: conversationId,
                    createdAt: new Date()
                }
            });
            await customer.save();
            logger.info(`Created new customer: ${customer._id}`);
        }

        return customer._id.toString();
    } catch (err: any) {
        logger.error('Failed to create/update customer: ' + String(err));
        return null;
    }
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
            mode: 'ask',
            field: nextField,
            collectedData: {},
            lastUserMessage: null,
            attachmentsMeta: []
        };
        const out = await callFormLlm(llmIn);

        const assistantMessage = createAssistantMessage(
            out.assistantText || nextField.context || 'Hello! Let me collect some information from you.',
            {
                llmMode: 'ask',
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

    // Save user message
    const userMessage = createUserMessage(
        typeof userMessageText === 'string' ? userMessageText : JSON.stringify(userMessageText),
        attachmentIds
    );
    conversation.messages.push(userMessage);
    conversation.messageCount = (conversation.messageCount || 0) + 1;

    // Prepare attachments metadata for LLM (legacy format for compatibility)
    const attachmentsMeta = normalizedAttachments.map(a => ({
        id: a._id,
        type: a.type,
        mimeType: a.mimeType,
        size: a.size
    }));

    // Ensure meta.collectedProfile exists
    if (!conversation.meta) conversation.meta = {};
    if (!conversation.meta.collectedProfile) conversation.meta.collectedProfile = [];

    let collectedProfile = Array.isArray(conversation.meta.collectedProfile)
        ? conversation.meta.collectedProfile
        : [];

    // Get current question context (what was just asked)
    const allAssistantMessages = [...conversation.messages]
        .filter(m => m.role === 'assistant')
        .reverse();
    const lastAskMessage = allAssistantMessages.find(m => m.payload?.llmMode === 'ask') as IMessage | undefined;
    const currentQuestionId = lastAskMessage?.questionId || null;
    const currentNextOrder = lastAskMessage?.payload?.nextOrder || null;
    const currentField = lastAskMessage?.payload?.field || null;

    // Convert collected profile to object for LLM context
    const collectedDataObj = collectedProfileArrayToObject(collectedProfile);

    logger.info(`Processing message for question: ${currentQuestionId}, collectedSoFar: ${Object.keys(collectedDataObj).join(', ')}`);

    // STEP 1: Parse user's response
    let parseOutput: LlmTurnOutput | null = null;
    try {
        const parseInput: LlmTurnInput = {
            mode: 'parse',
            field: currentField,
            collectedData: collectedDataObj,
            lastUserMessage: typeof userMessageText === 'string' ? userMessageText : JSON.stringify(userMessageText),
            attachmentsMeta
        };
        parseOutput = await callFormLlm(parseInput);
        logger.info(`Parse output: ${JSON.stringify(parseOutput).substring(0, 200)}`);
    } catch (err: any) {
        logger.error('LLM parse failed: ' + String(err));
        const errorMsg = createAssistantMessage(
            "I'm having trouble understanding that. Could you please rephrase your answer?",
            { llmMode: 'error' },
            currentQuestionId || ''
        );
        conversation.messages.push(errorMsg);
        conversation.messageCount = (conversation.messageCount || 0) + 1;
        await conversation.save();
        return { conversation, metadata };
    }

    // STEP 2: Handle validation errors (but NOT if it's valid with answer)
    if (parseOutput.validation && !parseOutput.validation.isValid) {
        const errorText = parseOutput.assistantText ||
            `I couldn't validate that answer. ${parseOutput.validation.errors?.join(', ') || 'Please try again.'}`;

        const errorMsg = createAssistantMessage(
            errorText,
            {
                llmMode: 'validation_error',
                errors: parseOutput.validation.errors,
                field: currentField
            },
            currentQuestionId || ''
        );
        conversation.messages.push(errorMsg);
        conversation.messageCount = (conversation.messageCount || 0) + 1;
        await conversation.save();
        return { conversation, metadata };
    }

    // STEP 3: Determine if we should store the answer
    const shouldStore = parseOutput.action === 'store_answer' ||
        (parseOutput.validation?.isValid && parseOutput.answer !== undefined && parseOutput.answer !== null);

    logger.info(`Should store answer: ${shouldStore}, action: ${parseOutput.action}, isValid: ${parseOutput.validation?.isValid}, answer: ${parseOutput.answer}`);

    // STEP 4: Save the assistant's acknowledgment (BEFORE storing to avoid re-asking)
    const ackText = parseOutput.assistantText || "Got it, thanks!";
    const ackMsg = createAssistantMessage(
        ackText,
        {
            llmMode: 'parse',
            parseResult: parseOutput
        },
        parseOutput.questionId || currentQuestionId || ''
    );
    conversation.messages.push(ackMsg);
    conversation.messageCount = (conversation.messageCount || 0) + 1;

    // STEP 5: Store the valid answer if we should
    if (shouldStore) {
        const qId = parseOutput.questionId || currentQuestionId;
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

            // SPECIAL: Handle email - create/update customer and send link
            if (qId === 'email') {
                try {
                    const customerId = await createOrUpdateCustomer(collectedProfile, conversation._id.toString());
                    if (customerId) {
                        conversation.customerId = customerId as any;
                        metadata.customerCreated = true;
                    }

                    const normalized = normalizeEmail(String(ans));
                    if (isValidEmail(normalized)) {
                        await sendConversationLinkEmail(
                            normalized,
                            `${FRONTEND_URL}/chat?conversationId=${conversation._id}`
                        );
                        metadata.emailSent = true;
                        logger.info(`Sent conversation link to ${normalized}`);
                    }
                } catch (err: any) {
                    logger.warn('Failed to process email: ' + String(err));
                }
            }
        }
    }

    // STEP 6: Handle completion/confirmation requests
    if (parseOutput.action === 'request_confirmation') {
        metadata.awaitingConfirmation = true;
        await conversation.save();
        return { conversation, metadata };
    }

    if (parseOutput.action === 'complete') {
        conversation.status = 'closed';
        const finalCollectedObj = collectedProfileArrayToObject(collectedProfile);
        const email = finalCollectedObj.email;

        if (email && isValidEmail(normalizeEmail(email))) {
            try {
                await sendThankYouEmail(
                    normalizeEmail(email),
                    finalCollectedObj.full_name || 'there',
                    finalCollectedObj
                );
                metadata.completed = true;
            } catch (err: any) {
                logger.warn('Failed to send thank-you email: ' + String(err));
            }
        }
        await conversation.save();
        return { conversation, metadata };
    }

    // STEP 7: Get next question (using updated collected profile)
    const nextQuestionResult = getNextQuestion(FORM_JSON2 as any, collectedProfile);
    const nextField = nextQuestionResult.nextField;

    logger.info(`Next question: ${nextField?.questionId || 'none'}, isComplete: ${nextQuestionResult.isComplete}`);

    // If no next field, ask for confirmation
    if (!nextField || nextQuestionResult.isComplete) {
        try {
            const finalCollectedObj = collectedProfileArrayToObject(collectedProfile);
            const confirmIn: LlmTurnInput = {
                mode: 'confirm_summary',
                field: null,
                collectedData: finalCollectedObj,
                lastUserMessage: null,
                attachmentsMeta: []
            };
            const confirmOut = await callFormLlm(confirmIn);

            const confirmMsg = createAssistantMessage(
                confirmOut.assistantText || "I've collected all the information. Please review and confirm.",
                {
                    llmMode: 'confirm_summary',
                    summary: finalCollectedObj
                }
            );
            conversation.messages.push(confirmMsg);
            conversation.messageCount = (conversation.messageCount || 0) + 1;
            metadata.awaitingConfirmation = true;
        } catch (err: any) {
            logger.error('LLM confirm_summary failed: ' + String(err));
            const fallbackMsg = createAssistantMessage(
                "I've collected everything. Do you want to review or confirm?",
                { llmMode: 'confirm_summary' }
            );
            conversation.messages.push(fallbackMsg);
            conversation.messageCount = (conversation.messageCount || 0) + 1;
        }
        await conversation.save();
        return { conversation, metadata };
    }

    // STEP 8: Ask the next question
    let askOutput: LlmTurnOutput | null = null;
    try {
        const updatedCollectedObj = collectedProfileArrayToObject(collectedProfile);
        const askInput: LlmTurnInput = {
            mode: 'ask',
            field: nextField,
            collectedData: updatedCollectedObj,
            lastUserMessage: null,
            attachmentsMeta: []
        };
        askOutput = await callFormLlm(askInput);
    } catch (err: any) {
        logger.error('LLM ask failed: ' + String(err));
    }

    const askText = askOutput?.assistantText ||
        nextField?.context ||
        nextField?.placeholder ||
        'Could you provide this information?';

    const askMsg = createAssistantMessage(
        askText,
        {
            llmMode: 'ask',
            field: nextField,
            orderPath: nextQuestionResult.orderPath,
            nextOrder: nextQuestionResult.nextOrder
        },
        nextField.questionId
    );
    conversation.messages.push(askMsg);
    conversation.messageCount = (conversation.messageCount || 0) + 1;

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