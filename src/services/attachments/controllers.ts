import Attachment from './model';
import Conversation from '../conversations/model';
import Customer from '../customers/model';
import logger from '../logger';
import { IAttachment, AttachmentType } from '../interfaces';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import mongoose from 'mongoose';

interface UploadFileParams {
    file: Buffer;
    filename: string;
    mimeType: string;
    conversationId?: string;
    customerId?: string;
    type: AttachmentType;
    messageId?: string; // ID of the message this attachment belongs to
}

export async function uploadFile(params: UploadFileParams): Promise<IAttachment> {
    // Generate unique filename
    const fileExtension = path.extname(params.filename);
    const uniqueFilename = `${randomBytes(16).toString('hex')}${fileExtension}`;

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    try {
        await mkdir(uploadsDir, { recursive: true });
    } catch (error: any) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }

    // Save file to disk
    const filePath = path.join(uploadsDir, uniqueFilename);
    await writeFile(filePath, params.file);

    // Create URL
    const url = `/uploads/${uniqueFilename}`;

    // Create attachment record (only fields that exist in model)
    const attachment = new Attachment({
        url: url,
        key: uniqueFilename,
        filename: params.filename,
        type: params.type,
        mimeType: params.mimeType,
        size: params.file.length
    });

    await attachment.save();

    // Link attachment to message if conversationId and messageId provided
    if (params.conversationId && params.messageId) {
        const conversation = await Conversation.findById(params.conversationId);
        if (conversation) {
            const message = conversation.messages.find(
                msg => msg._id?.toString() === params.messageId
            );
            if (message) {
                if (!message.attachments) {
                    message.attachments = [];
                }
                message.attachments.push(attachment._id);

                // Update conversation file stats
                conversation.fileStats = {
                    totalUploads: (conversation.fileStats?.totalUploads || 0) + 1,
                    uploadedTypes: [...(conversation.fileStats?.uploadedTypes || []), params.type]
                };
                await conversation.save();
            }
        }
    } else if (params.conversationId) {
        // If only conversationId provided, update file stats
        const conversation = await Conversation.findById(params.conversationId);
        if (conversation) {
            conversation.fileStats = {
                totalUploads: (conversation.fileStats?.totalUploads || 0) + 1,
                uploadedTypes: [...(conversation.fileStats?.uploadedTypes || []), params.type]
            };
            await conversation.save();
        }
    }

    // Link attachment to customer if customerId provided or if conversation has customerId
    let customerIdToUse = params.customerId;
    if (!customerIdToUse && params.conversationId) {
        const conversation = await Conversation.findById(params.conversationId).select('customerId');
        if (conversation && conversation.customerId) {
            customerIdToUse = conversation.customerId.toString();
        }
    }

    if (customerIdToUse) {
        try {
            // Use atomic $addToSet to avoid version conflicts when multiple files upload concurrently
            const attachmentIdObj = mongoose.Types.ObjectId.isValid(attachment._id)
                ? new mongoose.Types.ObjectId(attachment._id)
                : attachment._id;

            const result = await Customer.findByIdAndUpdate(
                customerIdToUse,
                {
                    $addToSet: {
                        attachments: attachmentIdObj
                    }
                },
                { new: true }
            );

            if (result) {
                logger.info(`Linked attachment ${attachment._id} to customer ${customerIdToUse} using atomic operation`);
            } else {
                logger.warn(`Customer ${customerIdToUse} not found for attachment linking`);
            }
        } catch (error: any) {
            // Fallback: try with find and atomic update if first attempt fails
            logger.warn(`Atomic attachment linking failed, trying fallback: ${error.message}`);
            try {
                const attachmentIdObj = mongoose.Types.ObjectId.isValid(attachment._id)
                    ? new mongoose.Types.ObjectId(attachment._id)
                    : attachment._id;

                const fallbackResult = await Customer.findByIdAndUpdate(
                    customerIdToUse,
                    {
                        $addToSet: {
                            attachments: attachmentIdObj
                        }
                    },
                    { new: true }
                );

                if (fallbackResult) {
                    logger.info(`Linked attachment ${attachment._id} to customer ${customerIdToUse} using atomic fallback`);
                } else {
                    logger.warn(`Customer ${customerIdToUse} not found for fallback attachment linking`);
                }
            } catch (fallbackError: any) {
                logger.error(`Failed to link attachment ${attachment._id} to customer ${customerIdToUse}: ${fallbackError.message}`);
                // Don't throw - attachment upload should succeed even if customer linking fails
            }
        }
    }

    logger.info(`Attachment uploaded: ${attachment._id}`);
    return attachment;
}

export async function uploadMultipleFiles(
    files: Array<{ file: Buffer; filename: string; mimeType: string }>,
    params: Omit<UploadFileParams, 'file' | 'filename' | 'mimeType'>
): Promise<IAttachment[]> {
    const uploads = await Promise.all(
        files.map(file =>
            uploadFile({
                ...file,
                conversationId: params.conversationId,
                customerId: params.customerId,
                type: params.type,
                messageId: params.messageId
            })
        )
    );

    return uploads;
}

export async function getAttachmentsByConversation(
    conversationId: string
): Promise<IAttachment[]> {
    // Find conversation and extract all attachment IDs from messages
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
        return [];
    }

    // Collect all unique attachment IDs from all messages
    const attachmentIds: any[] = [];
    conversation.messages.forEach(message => {
        if (message.attachments && Array.isArray(message.attachments)) {
            message.attachments.forEach(attId => {
                // Handle both ObjectId and populated object
                const id = attId && typeof attId === 'object' && '_id' in attId
                    ? attId._id
                    : attId;
                if (id && !attachmentIds.some(existing => existing.toString() === id.toString())) {
                    attachmentIds.push(id);
                }
            });
        }
    });

    // Fetch all attachments
    if (attachmentIds.length === 0) {
        return [];
    }

    return await Attachment.find({ _id: { $in: attachmentIds } });
}

export async function getAttachmentsByCustomer(
    customerId: string
): Promise<IAttachment[]> {
    // Find customer and get their attachments array
    const customer = await Customer.findById(customerId);

    if (!customer || !customer.attachments || customer.attachments.length === 0) {
        return [];
    }

    return await Attachment.find({ _id: { $in: customer.attachments } });
}

export async function getAttachmentById(
    attachmentId: string
): Promise<IAttachment | null> {
    return await Attachment.findById(attachmentId);
}

