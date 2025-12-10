import config from '../../config';
import logger from '../logger';
import Conversation from './model';
import Customer from '../customers/model';
import { callGemini } from '../../lib/llm';
import { sendConversationLinkEmail, sendThankYouEmail } from '../../lib/mail';
import { normalizeEmail, isValidEmail } from '../../lib/helpers';
import { IConversation, IMessage } from '../interfaces';
import mongoose from 'mongoose';
import * as flowManager from './flow-manager';
import { FORM_JSON2 } from '../../prompts/formJson';

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

    // Don't add initial message here - let LLM generate it when first message is sent
    // The frontend will send "Yes, I'm interested" or similar to trigger LLM response

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
        emailSent?: boolean;
        isExistingCustomer?: boolean;
        completed?: boolean;
        customerData?: any;
        awaitingConfirmation?: boolean;
    }
}> {
    const conversation = await Conversation.findById(conversationId)
        .populate('customerId')
        .populate('messages.attachments');

    if (!conversation) {
        throw new Error('Conversation not found');
    }

    const metadata: any = {};
    const normalizedAttachmentIds = attachmentIds?.length
        ? Array.from(new Set(attachmentIds))
        : [];

    // 1. Save user message with attachments
    const userMessage = createUserMessage(userMessageText, normalizedAttachmentIds);
    conversation.messages.push(userMessage);
    conversation.messageCount = (conversation.messageCount || 0) + 1;
    await conversation.save();


    // 2. Prepare LLM context
    const llmMessage = prepareLLMMessage(userMessageText, normalizedAttachmentIds);
    const existingCustomerContext = conversation.customerId
        ? await getCustomerContext(conversation.customerId._id || conversation.customerId)
        : null;

    // 3. Get LLM response
    const llmResponse = await getLLMResponse(
        conversation,
        llmMessage,
        conversationId,
        existingCustomerContext
    );

    // 4. Save assistant message
    const assistantMessage = createAssistantMessage(llmResponse);
    conversation.messages.push(assistantMessage);
    conversation.messageCount = (conversation.messageCount || 0) + 1;

    // 5. Process based on action type
    if (llmResponse?.action === 'store_answer' && llmResponse.storedQuestionId) {
        await processStoreAnswer(
            conversation,
            llmResponse,
            normalizedAttachmentIds,
            metadata
        );
    }

    // 6. Check if awaiting confirmation
    if (llmResponse?.action === 'request_confirmation') {
        metadata.awaitingConfirmation = true;
        logger.info(`Conversation ${conversationId} awaiting user confirmation`);
    }

    if (llmResponse?.action === 'complete' && llmResponse.completed) {
        await processCompletion(
            conversation,
            metadata
        );
    }

    await conversation.save();

    // 7. Populate and return
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

async function getCustomerContext(customerId: any): Promise<string | null> {
    try {
        const customer = await Customer.findById(customerId)
            .populate('attachments')
            .lean();

        if (!customer) return null;

        return `\n\n[EXISTING CUSTOMER CONTEXT]\nThe user is a returning customer. Their current profile data:\n${JSON.stringify(customer.profile || {}, null, 2)}\n\nThey have ${customer.attachments?.length || 0} attachment(s) on file.\n\nIMPORTANT: Allow them to update any existing field or add new information. When they provide updated values, store them normally using store_answer.\n[END EXISTING CUSTOMER CONTEXT]\n`;
    } catch (error) {
        logger.error(`Failed to fetch customer context: ${error}`);
        return null;
    }
}

async function getLLMResponse(
    conversation: IConversation,
    llmMessage: string,
    conversationId: string,
    customerContext?: string | null
): Promise<any> {
    try {
        const enhancedMessage = customerContext
            ? `${llmMessage}${customerContext}`
            : llmMessage;

        return await callGemini(conversation.messages, enhancedMessage);
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

// ==================== COLLECT ALL ANSWERS ====================

function collectAllAnswersFromMessages(messages: IMessage[]): Record<string, any> {
    const collectedData: Record<string, any> = {};

    messages.forEach(msg => {
        if (msg.role === 'assistant' &&
            msg.payload?.action === 'store_answer' &&
            msg.payload.storedQuestionId &&
            msg.payload.value !== null &&
            msg.payload.value !== undefined) {

            collectedData[msg.payload.storedQuestionId] = {
                value: msg.payload.value,
                type: msg.payload.uiHint?.type || 'text'
            };
        }
    });

    return collectedData;
}


// ==================== CORE PROCESSING ====================

async function processStoreAnswer(
    conversation: IConversation,
    llmResponse: any,
    attachmentIds: string[],
    metadata: any
): Promise<void> {
    const { storedQuestionId, value, uiHint } = llmResponse;

    if (!storedQuestionId || value === null || value === undefined) {
        return;
    }

    const fieldType = uiHint?.type || 'text';

    // Special handling for email field - this triggers customer creation/lookup
    if (storedQuestionId === 'email') {
        const normalizedEmail = normalizeEmail(value);

        if (!isValidEmail(normalizedEmail)) {
            logger.warn(`Invalid email format: ${value}`);
            return;
        }

        try {
            // Collect ALL answers from conversation history
            const allCollectedAnswers = collectAllAnswersFromMessages(conversation.messages);

            // Find or create customer
            let customer = await Customer.findOne({ 'profile.email': normalizedEmail });

            if (customer) {
                // Existing customer - update with all collected data
                metadata.isExistingCustomer = true;

                const profileUpdates = buildProfileFromAnswers(allCollectedAnswers);
                const attachmentIdsToAdd = extractAttachmentIdsFromAnswers(allCollectedAnswers);

                // Update customer with all collected data
                const updateData: any = {
                    $set: {
                        profile: { ...customer.profile, ...profileUpdates },
                        'meta.lastUpdated': new Date(),
                        'meta.lastConversation': conversation._id.toString()
                    }
                };

                // Add attachments if any
                if (attachmentIdsToAdd.length > 0) {
                    const validIds = attachmentIdsToAdd
                        .filter(id => mongoose.Types.ObjectId.isValid(id))
                        .map(id => new mongoose.Types.ObjectId(id));

                    if (validIds.length > 0) {
                        updateData.$addToSet = {
                            attachments: { $each: validIds }
                        };
                    }
                }

                customer = await Customer.findByIdAndUpdate(
                    customer._id,
                    updateData,
                    { new: true, runValidators: true }
                );

                // Link to conversation
                conversation.customerId = customer?._id;

                logger.info(`Updated existing customer ${customer?._id} with all collected data`);
            } else {
                // New customer - create with all collected data
                const profileData = buildProfileFromAnswers(allCollectedAnswers);
                const attachmentIdsToAdd = extractAttachmentIdsFromAnswers(allCollectedAnswers);

                const validIds = attachmentIdsToAdd
                    .filter(id => mongoose.Types.ObjectId.isValid(id))
                    .map(id => new mongoose.Types.ObjectId(id));

                customer = new Customer({
                    profile: profileData,
                    attachments: validIds,
                    meta: {
                        createdFromConversation: conversation._id.toString(),
                        createdAt: new Date()
                    }
                });

                await customer.save();

                conversation.customerId = customer._id;
                metadata.isExistingCustomer = false;

                logger.info(`Created new customer ${customer._id} with all collected data`);

                // Send conversation link email
                await sendEmailSafe(
                    sendConversationLinkEmail,
                    normalizedEmail,
                    `${FRONTEND_URL}/chat?conversationId=${conversation._id}`,
                    customer.profile?.full_name || 'there'
                );

                metadata.emailSent = true;
            }
        } catch (error: any) {
            logger.error(`Failed to process email and create/update customer: ${error.message}`);
            return;
        }
    } else {
        // Non-email field - update customer if customer exists
        if (conversation.customerId) {
            try {
                // Check if this is a file field
                if (fieldType === 'files') {
                    // For file fields, only update attachments array, NOT profile
                    const fileIds = extractAttachmentIdsFromValue(value);

                    if (fileIds.length > 0) {
                        const validIds = fileIds
                            .filter(id => mongoose.Types.ObjectId.isValid(id))
                            .map(id => new mongoose.Types.ObjectId(id));

                        if (validIds.length > 0) {
                            await Customer.findByIdAndUpdate(
                                conversation.customerId,
                                {
                                    $addToSet: {
                                        attachments: { $each: validIds }
                                    },
                                    $set: {
                                        'meta.lastUpdated': new Date(),
                                        'meta.lastConversation': conversation._id.toString()
                                    }
                                },
                                { new: true, runValidators: true }
                            );

                            logger.info(`Added ${validIds.length} attachments for field ${storedQuestionId}`);
                        }
                    }
                } else {
                    // For non-file fields, update profile
                    const updateData: any = {
                        $set: {
                            [`profile.${storedQuestionId}`]: value,
                            'meta.lastUpdated': new Date(),
                            'meta.lastConversation': conversation._id.toString()
                        }
                    };

                    await Customer.findByIdAndUpdate(
                        conversation.customerId,
                        updateData,
                        { new: true, runValidators: true }
                    );

                    logger.info(`Updated customer ${conversation.customerId} field: ${storedQuestionId}`);
                }
            } catch (error: any) {
                logger.error(`Failed to update customer field ${storedQuestionId}: ${error.message}`);
            }
        } else {
            // No customer yet - this is expected before email is collected
            logger.debug(`Field ${storedQuestionId} collected but no customer yet (email not collected)`);
        }
    }
}

async function processCompletion(
    conversation: IConversation,
    metadata: any
): Promise<void> {
    // Ensure customer exists before closing
    if (!conversation.customerId) {
        // Try to create customer from collected data
        const allCollectedAnswers = collectAllAnswersFromMessages(conversation.messages);
        const email = allCollectedAnswers.email?.value;

        if (email && isValidEmail(normalizeEmail(email))) {
            try {
                const normalizedEmail = normalizeEmail(email);
                let customer = await Customer.findOne({ 'profile.email': normalizedEmail });

                if (!customer) {
                    const profileData = buildProfileFromAnswers(allCollectedAnswers);
                    const attachmentIdsToAdd = extractAttachmentIdsFromAnswers(allCollectedAnswers);

                    const validIds = attachmentIdsToAdd
                        .filter(id => mongoose.Types.ObjectId.isValid(id))
                        .map(id => new mongoose.Types.ObjectId(id));

                    customer = new Customer({
                        profile: profileData,
                        attachments: validIds,
                        meta: {
                            createdFromConversation: conversation._id.toString(),
                            createdAt: new Date()
                        }
                    });

                    await customer.save();
                    conversation.customerId = customer._id;

                    logger.info(`Created customer ${customer._id} on completion`);
                }
            } catch (error: any) {
                logger.error(`Failed to create customer on completion: ${error.message}`);
            }
        }
    }

    // Close conversation
    conversation.status = 'closed';

    // Send thank you email
    if (conversation.customerId) {
        try {
            const customer = await Customer.findById(conversation.customerId)
                .populate('attachments')
                .lean();

            const email = customer?.profile?.email;
            if (email) {
                await sendEmailSafe(
                    sendThankYouEmail,
                    email,
                    customer.profile?.full_name || 'there',
                    customer
                );
            }

            metadata.completed = true;
            metadata.customerData = customer;

            logger.info(`Conversation ${conversation._id} completed successfully`);
        } catch (error: any) {
            logger.error(`Failed to process completion: ${error.message}`);
        }
    }
}

// ==================== BUILD PROFILE FROM ANSWERS ====================

function buildProfileFromAnswers(answers: Record<string, any>): Record<string, any> {
    const profile: Record<string, any> = {};

    Object.entries(answers).forEach(([questionId, data]) => {
        const { value, type } = data;

        if (value === null || value === undefined) return;

        // Skip file fields - they go to attachments array ONLY
        if (type === 'files') {
            return;
        }

        // Store the value
        profile[questionId] = value;
    });

    return profile;
}

function extractAttachmentIdsFromAnswers(answers: Record<string, any>): string[] {
    const allIds: string[] = [];

    Object.entries(answers).forEach(([_, data]) => {
        const { value, type } = data;

        if (type === 'files') {
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

    return [];
}

// ==================== UTILITIES ====================

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

    // Count lead stages from customer profiles directly
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
            else if (leadStage === 'existing_customer' || leadStage === 'returning_customer') leadStages.existingCustomers++;
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