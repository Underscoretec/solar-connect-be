import config from '../../config';
import logger from '../logger';
import Conversation from './model';
import Customer from '../customers/model';
import Attachment from '../attachments/model';
import { callGemini } from '../../lib/llm';
import { sendConversationLinkEmail, sendThankYouEmail } from '../../lib/mail';
import { normalizeEmail, isValidEmail, isValidPhone } from '../../lib/helpers';
import { IConversation, IMessage } from '../interfaces';
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

// ==================== CONVERSATION CREATION ====================

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
        }
    });

    await conversation.save();
    logger.info(`Conversation created: ${conversation._id}`);

    try {
        const jsonResponse = await callGemini([], 'Yes, I\'m interested');
        const assistantMessage: IMessage = {
            role: 'assistant',
            text: jsonResponse.message || '',
            payload: jsonResponse,
            questionId: jsonResponse.questionId || null,
            createdAt: new Date()
        };

        conversation.messages.push(assistantMessage);
        conversation.messageCount = 1;
        await conversation.save();

        logger.info(`Initial LLM response added to conversation ${conversation._id}`);
    } catch (error: any) {
        logger.warn(`Failed to generate initial LLM response: ${error.message}`);
    }

    return conversation;
}

// ==================== MESSAGE SENDING ====================

export async function sendMessageWithBusinessLogic(
    conversationId: string,
    userMessageText: string,
    attachmentIds?: string[]
): Promise<{
    conversation: IConversation;
    metadata: {
        emailConfirmed?: boolean;
        isExistingCustomer?: boolean;
        completed?: boolean;
        customerData?: any;
    }
}> {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
        throw new Error('Conversation not found');
    }

    const metadata: any = {};

    // Normalize attachmentIds - ensure it's always an array
    const normalizedAttachmentIds = attachmentIds && attachmentIds.length > 0
        ? Array.from(new Set(attachmentIds))
        : [];

    // 1. Prepare and save user message
    const userMessage = createUserMessage(userMessageText, normalizedAttachmentIds);
    conversation.messages.push(userMessage);
    conversation.messageCount = (conversation.messageCount || 0) + 1;
    await conversation.save();

    // 2. Get LLM response
    const llmMessage = prepareLLMMessage(userMessageText, normalizedAttachmentIds);
    const llmResponse = await getLLMResponse(conversation, llmMessage, conversationId);

    // 3. Save assistant message
    const assistantMessage = createAssistantMessage(llmResponse);
    conversation.messages.push(assistantMessage);
    conversation.messageCount = (conversation.messageCount || 0) + 1;
    await conversation.save();

    // 4. Handle business logic based on LLM response
    if (llmResponse?.action === 'store_answer') {
        await handleStoreAnswer(
            conversation,
            llmResponse,
            userMessage,
            normalizedAttachmentIds,
            metadata
        );
    }

    if (llmResponse?.action === 'complete') {
        await handleCompletion(conversation, llmResponse, normalizedAttachmentIds, metadata);
    }

    // 5. Populate and return
    await conversation.populate('messages.attachments');
    await conversation.populate('customerId');

    return { conversation, metadata };
}

// ==================== HELPER FUNCTIONS ====================

function createUserMessage(text: string, attachmentIds: string[]): IMessage {
    return {
        role: 'user',
        text,
        attachments: attachmentIds.map(id => id as any),
        createdAt: new Date()
    };
}

function prepareLLMMessage(userMessageText: string, attachmentIds: string[]): string {
    if (attachmentIds.length === 0) {
        return userMessageText;
    }

    const idList = attachmentIds.join(', ');
    return userMessageText
        ? `${userMessageText} [Attachment IDs: ${idList}]`
        : `[Attachment IDs: ${idList}]`;
}

async function getLLMResponse(
    conversation: IConversation,
    llmMessage: string,
    conversationId: string
): Promise<any> {
    try {
        return await callGemini(conversation.messages, llmMessage);
    } catch (error: any) {
        logger.error(`Failed to call LLM for conversation ${conversationId}: ${error.message}`);
        const isRateLimit = error.message?.includes('429') ||
            error.message?.includes('Too Many Requests') ||
            error.message?.includes('Resource exhausted');

        return {
            message: isRateLimit
                ? "I'm experiencing high demand right now. Please try again in a moment."
                : "I'm having trouble processing your request. Please try again.",
            action: null,
            uiHint: null
        };
    }
}

function createAssistantMessage(llmResponse: any): IMessage {
    return {
        role: 'assistant',
        text: llmResponse.message || '',
        payload: llmResponse,
        questionId: llmResponse?.questionId || null,
        createdAt: new Date()
    };
}

// ==================== BUSINESS LOGIC HANDLERS ====================

async function handleStoreAnswer(
    conversation: IConversation,
    llmResponse: any,
    userMessage: IMessage,
    attachmentIds: string[],
    metadata: any
): Promise<void> {
    const { storedQuestionId, value, uiHint } = llmResponse;

    if (!storedQuestionId || value === null || value === undefined) {
        return;
    }

    const fieldType = uiHint?.type || 'text';
    const collectedAnswers = collectAnswers(conversation.messages);

    try {
        const { customer, isNew } = await updateOrCreateCustomer(
            conversation._id.toString(),
            collectedAnswers
        );

        // Link customer to conversation
        if (!conversation.customerId) {
            conversation.customerId = customer._id;
            await conversation.save();
        }

        // Handle attachments for upload fields
        if (isUploadField(fieldType, storedQuestionId) && attachmentIds.length > 0) {
            await linkAttachmentsToCustomer(customer._id.toString(), attachmentIds);
            logger.info(`Linked ${attachmentIds.length} attachment(s) to customer ${customer._id}`);
        }

        // Send email if email was collected
        if (storedQuestionId === 'email' && value) {
            metadata.emailConfirmed = true;
            metadata.isExistingCustomer = !isNew;
            await sendEmailSafe(
                sendConversationLinkEmail,
                value,
                `${FRONTEND_URL}/chat?conversationId=${conversation._id}`,
                customer.profile?.full_name || 'there'
            );
        }
    } catch (error: any) {
        logger.error(`Failed to update customer: ${error.message}`);
        storePendingData(conversation, storedQuestionId, value, fieldType);
        await conversation.save();
    }
}

async function handleCompletion(
    conversation: IConversation,
    llmResponse: any,
    attachmentIds: string[],
    metadata: any
): Promise<void> {
    // Store the final field if present
    if (llmResponse.storedQuestionId && llmResponse.value !== null && llmResponse.value !== undefined) {
        const fieldType = llmResponse.uiHint?.type || 'text';
        const collectedAnswers = collectAnswers(conversation.messages);

        try {
            const { customer } = await updateOrCreateCustomer(
                conversation._id.toString(),
                collectedAnswers
            );

            if (!conversation.customerId) {
                conversation.customerId = customer._id;
            }

            // Link final attachments if this was an upload field
            if (isUploadField(fieldType, llmResponse.storedQuestionId) && attachmentIds.length > 0) {
                await linkAttachmentsToCustomer(customer._id.toString(), attachmentIds);
                logger.info(`Linked final ${attachmentIds.length} attachment(s) on completion`);
            }
        } catch (error: any) {
            logger.error(`Failed to store final field on completion: ${error.message}`);
        }
    }

    // Ensure customer exists
    if (!conversation.customerId) {
        const collectedAnswers = collectAnswers(conversation.messages);
        const email = findEmailInAnswers(collectedAnswers);

        if (email) {
            try {
                const { customer } = await updateOrCreateCustomer(
                    conversation._id.toString(),
                    collectedAnswers
                );
                conversation.customerId = customer._id;
            } catch (error: any) {
                logger.error(`Failed to create customer on completion: ${error.message}`);
            }
        }
    }

    // Close conversation
    conversation.status = 'closed';
    await conversation.save();

    // Get customer data and send thank you email
    if (conversation.customerId) {
        try {
            const customerData = await Customer.findById(conversation.customerId)
                .populate('attachments')
                .select('-__v')
                .lean();

            const email = customerData?.profile?.email;
            if (email) {
                await sendEmailSafe(
                    sendThankYouEmail,
                    email,
                    customerData.profile?.full_name || 'there',
                    customerData
                );
            }

            metadata.completed = true;
            metadata.customerData = customerData;
            logger.info(`Conversation ${conversation._id} completed successfully`);
        } catch (error: any) {
            logger.error(`Failed to fetch customer data: ${error.message}`);
        }
    }
}

// ==================== CUSTOMER MANAGEMENT ====================

function collectAnswers(messages: IMessage[]): Record<string, { value: any; type: string }> {
    const answers: Record<string, { value: any; type: string }> = {};

    messages.forEach(msg => {
        if (msg.payload?.action === 'store_answer' &&
            msg.payload.storedQuestionId &&
            msg.payload.value !== null &&
            msg.payload.value !== undefined) {
            answers[msg.payload.storedQuestionId] = {
                value: msg.payload.value,
                type: msg.payload.uiHint?.type || 'text'
            };
        }
    });

    return answers;
}

function findEmailInAnswers(answers: Record<string, { value: any; type: string }>): string | null {
    // Direct email field
    if (answers.email?.value) {
        return answers.email.value;
    }

    // Search in form groups
    for (const key in answers) {
        const answer = answers[key];
        if (answer.type === 'form' && answer.value?.email) {
            return answer.value.email;
        }
    }

    return null;
}

async function updateOrCreateCustomer(
    conversationId: string,
    allAnswers: Record<string, { value: any; type: string }>
): Promise<{ customer: any; isNew: boolean }> {
    const email = findEmailInAnswers(allAnswers);

    if (!email) {
        throw new Error('Cannot create/update customer without email');
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
        throw new Error('Invalid email format');
    }

    let customer = await Customer.findOne({ 'profile.email': normalizedEmail });

    if (customer) {
        // Update existing customer
        const profileUpdates = buildProfileUpdates(allAnswers);
        customer = await Customer.findByIdAndUpdate(
            customer._id,
            {
                $set: {
                    profile: profileUpdates,
                    'meta.lastUpdated': new Date(),
                    'meta.lastConversation': conversationId
                }
            },
            { new: true, runValidators: true }
        );
        logger.info(`Updated existing customer ${customer?._id}`);
        return { customer, isNew: false };
    }

    // Create new customer
    customer = await createNewCustomer(allAnswers, conversationId);
    return { customer, isNew: true };
}

async function createNewCustomer(
    answers: Record<string, { value: any; type: string }>,
    conversationId: string
): Promise<any> {
    const profile = buildProfileUpdates(answers);

    // Extract all attachment IDs from answers
    const attachmentIds = extractAllAttachmentIds(answers);

    const customerData = {
        profile,
        attachments: attachmentIds.map(id =>
            mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
        ),
        meta: {
            createdFromConversation: conversationId,
            createdAt: new Date()
        }
    };

    const customer = new Customer(customerData);
    await customer.save();

    logger.info(`Created new customer ${customer._id} with ${attachmentIds.length} attachment(s)`);

    return customer;
}

function buildProfileUpdates(answers: Record<string, { value: any; type: string }>): Record<string, any> {
    const profile: Record<string, any> = {};

    Object.entries(answers).forEach(([questionId, answer]) => {
        const { value, type } = answer;

        if (value === null || value === undefined) return;

        // Skip upload fields - they go to attachments array
        if (isUploadField(type, questionId)) {
            return;
        }

        // Store based on type
        switch (type) {
            case 'text':
            case 'number':
            case 'choice':
                profile[questionId] = value;
                break;

            case 'form':
                // Nested object for form groups
                profile[questionId] = value;
                break;

            default:
                // Unknown type - store as-is
                profile[questionId] = value;
                break;
        }
    });

    return profile;
}

function isUploadField(type: string, questionId: string): boolean {
    return type === 'file' ||
        type === 'files' ||
        questionId === 'attachments' ||
        questionId === 'panel_photo' ||
        questionId.includes('photo') ||
        questionId.includes('photos') ||
        questionId.includes('upload') ||
        questionId.includes('attachment') ||
        questionId.includes('document');
}

function extractAllAttachmentIds(answers: Record<string, { value: any; type: string }>): string[] {
    const allIds: string[] = [];

    Object.entries(answers).forEach(([questionId, answer]) => {
        const { value, type } = answer;

        if (isUploadField(type, questionId)) {
            const ids = extractAttachmentIdsFromValue(value);
            allIds.push(...ids);
        }
    });

    return Array.from(new Set(allIds)); // Deduplicate
}

function extractAttachmentIdsFromValue(value: any): string[] {
    if (!value) return [];

    // Single string ID
    if (typeof value === 'string') {
        return mongoose.Types.ObjectId.isValid(value) ? [value] : [];
    }

    // Array of IDs
    if (Array.isArray(value)) {
        return value
            .map((item: any) => {
                if (typeof item === 'string' && mongoose.Types.ObjectId.isValid(item)) {
                    return item;
                }
                if (item?._id && mongoose.Types.ObjectId.isValid(item._id)) {
                    return item._id.toString();
                }
                if (item?.id && mongoose.Types.ObjectId.isValid(item.id)) {
                    return item.id.toString();
                }
                return null;
            })
            .filter(Boolean) as string[];
    }

    // Object (shouldn't happen for file fields, but handle gracefully)
    if (typeof value === 'object') {
        const ids: string[] = [];
        Object.values(value).forEach((v: any) => {
            ids.push(...extractAttachmentIdsFromValue(v));
        });
        return ids;
    }

    return [];
}

// ==================== ATTACHMENT HANDLING ====================

async function linkAttachmentsToCustomer(customerId: string, attachmentIds: string[]): Promise<void> {
    if (attachmentIds.length === 0) return;

    try {
        // Validate and convert to ObjectIds
        const objectIds = attachmentIds
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        if (objectIds.length === 0) {
            logger.warn('No valid attachment IDs to link');
            return;
        }

        // Update customer with attachments (atomic operation)
        await Customer.findByIdAndUpdate(
            customerId,
            { $addToSet: { attachments: { $each: objectIds } } },
            { new: true }
        );

        logger.info(`Successfully linked ${objectIds.length} attachment(s) to customer ${customerId}`);
    } catch (error: any) {
        logger.error(`Failed to link attachments to customer ${customerId}: ${error.message}`);
        throw error;
    }
}

// ==================== EMAIL HANDLING ====================

async function sendEmailSafe(emailFn: Function, ...args: any[]): Promise<void> {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        logger.warn('SMTP not configured - email not sent');
        return;
    }

    try {
        await emailFn(...args);
        logger.info('Email sent successfully');
    } catch (error: any) {
        logger.error(`Failed to send email: ${error.message}`);
    }
}

// ==================== UTILITIES ====================

function storePendingData(
    conversation: IConversation,
    storedQuestionId: string,
    value: any,
    type: string
): void {
    if (!conversation.meta) {
        conversation.meta = {};
    }
    if (!conversation.meta.pendingCustomerData) {
        conversation.meta.pendingCustomerData = {};
    }
    conversation.meta.pendingCustomerData[storedQuestionId] = { value, type };
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