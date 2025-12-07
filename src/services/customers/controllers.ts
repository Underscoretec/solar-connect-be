import Customer from './model';
import Conversation from '../conversations/model';
import logger from '../logger';
import { ICustomer } from '../interfaces';
import config from '../../config';

interface CreateOrUpdateCustomerParams {
    name?: string;
    email?: string;
    phone?: string;
    address?: Record<string, any>;
    attachments?: any[];
    meta?: Record<string, any>;
    conversationId?: string;
}

export async function createOrUpdateCustomer(
    params: CreateOrUpdateCustomerParams
): Promise<ICustomer> {
    // Try to find existing customer by email or phone
    let customer = null;

    if (params.email) {
        customer = await Customer.findOne({
            'profile.email': params.email.toLowerCase().trim()
        });
    }

    if (!customer && params.phone) {
        customer = await Customer.findOne({
            'profile.phone': params.phone.trim()
        });
    }

    if (customer) {
        // Update existing customer
        const profileUpdates: Record<string, any> = { ...(customer.profile || {}) };

        if (params.name) profileUpdates.name = params.name;
        if (params.email) profileUpdates.email = params.email.toLowerCase().trim();
        if (params.phone) profileUpdates.phone = params.phone.trim();
        if (params.address) profileUpdates.address = params.address;

        customer.profile = profileUpdates;

        // Update attachments
        if (params.attachments) {
            customer.attachments = params.attachments;
        }

        // Update meta fields
        if (params.meta) {
            customer.meta = {
                ...customer.meta,
                ...params.meta
            };
        }

        await customer.save();
        logger.info(`Customer updated: ${customer._id}`);
    } else {
        // Create new customer
        const profile: Record<string, any> = {};
        if (params.name) profile.name = params.name || 'Unknown';
        if (params.email) profile.email = params.email.toLowerCase().trim();
        if (params.phone) profile.phone = params.phone.trim();
        if (params.address) profile.address = params.address;

        customer = new Customer({
            profile: Object.keys(profile).length > 0 ? profile : null,
            attachments: params.attachments || [],
            meta: {
                ...params.meta,
                createdFromConversation: params.conversationId
            }
        });

        await customer.save();
        logger.info(`Customer created: ${customer._id}`);
    }

    // Link customer to conversation if provided
    if (params.conversationId && customer._id) {
        await Conversation.findByIdAndUpdate(
            params.conversationId,
            { customerId: customer._id },
            { new: true }
        );
    }

    return customer;
}

export async function getCustomerById(customerId: string): Promise<ICustomer | null> {
    return await Customer.findById(customerId)
        .populate('attachments');
}

export async function updateCustomerProfile(
    customerId: string,
    profile: Record<string, any>
): Promise<ICustomer | null> {
    // Handle the new structure: separate address, attachments, and meta
    const updateData: any = {};

    // Extract address and attachments separately
    const profileFields: Record<string, any> = {};
    const metaFields: Record<string, any> = {};

    Object.keys(profile).forEach(key => {
        if (key === 'attachments') {
            updateData.attachments = profile.attachments;
        } else if (key === 'address' || key === 'name' || key === 'email' || key === 'phone') {
            // These go into profile
            profileFields[key] = profile[key];
        } else {
            // Other fields go into meta
            metaFields[key] = profile[key];
        }
    });

    if (Object.keys(profileFields).length > 0) {
        // Merge with existing profile
        const customer = await Customer.findById(customerId);
        updateData.profile = {
            ...(customer?.profile || {}),
            ...profileFields
        };
    }

    if (Object.keys(metaFields).length > 0) {
        updateData.meta = metaFields;
    }

    return await Customer.findByIdAndUpdate(
        customerId,
        {
            $set: updateData
        },
        { new: true }
    );
}

export async function extractCustomerDataFromMessage(
    message: string,
    existingData: Record<string, any> = {}
): Promise<Record<string, any>> {
    const extracted: Record<string, any> = { ...existingData };

    // Extract email
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emailMatch = message.match(emailRegex);
    if (emailMatch && !extracted.email) {
        extracted.email = emailMatch[0];
    }

    // Extract phone (Indian and international formats)
    const phoneRegex = /(\+91[\s-]?)?[6-9]\d{9}|\b\d{10}\b/g;
    const phoneMatch = message.match(phoneRegex);
    if (phoneMatch && !extracted.phone) {
        extracted.phone = phoneMatch[0].replace(/\s|-/g, '');
    }

    // Extract ZIP code (5-7 digits)
    const zipRegex = /\b\d{5,7}\b/g;
    const zipMatch = message.match(zipRegex);
    if (zipMatch && !extracted.zipCode) {
        extracted.zipCode = zipMatch[0];
    }

    // Try to extract name (if message starts with "I am" or "My name is")
    const namePatterns = [
        /(?:my name is|i am|i'm|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
        /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    ];

    for (const pattern of namePatterns) {
        const nameMatch = message.match(pattern);
        if (nameMatch && !extracted.name) {
            extracted.name = nameMatch[1];
            break;
        }
    }

    return extracted;
}

export async function getCustomersList(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
}): Promise<{ customers: ICustomer[]; total: number }> {
    const page = params.page || 1;
    const limit = params.limit || config.defaultDataPerPage;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (params.search) {
        query.$or = [
            { 'profile.name': { $regex: params.search, $options: 'i' } },
            { 'profile.email': { $regex: params.search, $options: 'i' } },
            { 'profile.phone': { $regex: params.search, $options: 'i' } }
        ];
    }

    const customers = await Customer.find(query)
        .populate('attachments')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const total = await Customer.countDocuments(query);

    return { customers, total };
}

