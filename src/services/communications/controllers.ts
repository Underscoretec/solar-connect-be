import Communication from './model';
import Customer from '../customers/model';
import { ICommunication } from '../interfaces';
import logger from '../logger';
import { generateEmailTemplate, EmailGenerationInput } from '../../lib/emailLlm';
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@solarconnect.com';

/**
 * Create nodemailer transporter
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};

/**
 * Generate email template using LLM
 */
export async function generateEmail(
  customerId: string,
  prompt: string,
  context?: string
): Promise<{ subject: string; content: string }> {
  try {
    // Fetch customer details
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const input: EmailGenerationInput = {
      customerName: customer.fullName || undefined,
      customerEmail: customer.email || undefined,
      customerProfile: customer.profile || undefined,
      prompt,
      context
    };

    const result = await generateEmailTemplate(input);
    logger.info(`Generated email for customer ${customerId}: ${result.subject}`);

    return result;
  } catch (error: any) {
    logger.error(`Failed to generate email: ${error.message}`);
    throw error;
  }
}

/**
 * Send email to customer
 */
export async function sendEmailToCustomer(
  customerId: string,
  subject: string,
  content: string,
  sentById: string
): Promise<ICommunication> {
  try {
    // Fetch customer details
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    if (!customer.email) {
      throw new Error('Customer email not found');
    }

    // Create communication record
    const communication = new Communication({
      customerId,
      type: 'email',
      subject,
      content,
      status: 'pending',
      sentBy: sentById,
      metadata: {
        customerEmail: customer.email,
        customerName: customer.fullName
      }
    });

    await communication.save();

    // Check SMTP configuration
    if (!SMTP_USER || !SMTP_PASS) {
      communication.status = 'failed';
      communication.errorMessage = 'SMTP credentials not configured';
      await communication.save();
      throw new Error('SMTP credentials not configured');
    }

    try {
      // Send email
      const transporter = createTransporter();

      const mailOptions = {
        from: `"SolarConnect" <${EMAIL_FROM}>`,
        to: customer.email,
        subject,
        html: content,
        text: content.replace(/<[^>]*>/g, '') // Strip HTML for text version
      };

      const info = await transporter.sendMail(mailOptions);

      // Update communication status
      communication.status = 'sent';
      communication.sentAt = new Date();
      communication.metadata = {
        ...communication.metadata,
        messageId: info.messageId,
        response: info.response
      };
      await communication.save();

      logger.info(`Email sent successfully to ${customer.email}, messageId: ${info.messageId}`);

      return communication;
    } catch (emailError: any) {
      // Update communication with error
      communication.status = 'failed';
      communication.errorMessage = emailError.message;
      await communication.save();

      logger.error(`Failed to send email: ${emailError.message}`);
      throw emailError;
    }
  } catch (error: any) {
    logger.error(`sendEmailToCustomer failed: ${error.message}`);
    throw error;
  }
}

/**
 * Get communication history for a customer
 */
export async function getCustomerCommunications(
  customerId: string,
  params?: {
    type?: 'email' | 'whatsapp' | 'telegram';
    status?: 'draft' | 'sent' | 'failed' | 'pending';
    page?: number;
    limit?: number;
  }
): Promise<{ communications: ICommunication[]; total: number }> {
  try {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const skip = (page - 1) * limit;

    const query: any = { customerId };
    if (params?.type) query.type = params.type;
    if (params?.status) query.status = params.status;

    const communications = await Communication.find(query)
      .populate('sentBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Communication.countDocuments(query);

    return { communications, total };
  } catch (error: any) {
    logger.error(`Failed to fetch communications: ${error.message}`);
    throw error;
  }
}

/**
 * Get communication by ID
 */
export async function getCommunicationById(
  communicationId: string
): Promise<ICommunication | null> {
  try {
    return await Communication.findById(communicationId)
      .populate('customerId', 'fullName email profile')
      .populate('sentBy', 'name email');
  } catch (error: any) {
    logger.error(`Failed to fetch communication: ${error.message}`);
    throw error;
  }
}

/**
 * Update communication
 */
export async function updateCommunication(
  communicationId: string,
  updates: Partial<ICommunication>
): Promise<ICommunication | null> {
  try {
    return await Communication.findByIdAndUpdate(
      communicationId,
      updates,
      { new: true }
    );
  } catch (error: any) {
    logger.error(`Failed to update communication: ${error.message}`);
    throw error;
  }
}

/**
 * Delete communication
 */
export async function deleteCommunication(
  communicationId: string
): Promise<boolean> {
  try {
    const result = await Communication.findByIdAndDelete(communicationId);
    return !!result;
  } catch (error: any) {
    logger.error(`Failed to delete communication: ${error.message}`);
    throw error;
  }
}

/**
 * Get communication stats for admin dashboard
 */
export async function getCommunicationStats(): Promise<{
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  recent: number;
}> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [total, byType, byStatus, recent] = await Promise.all([
      Communication.countDocuments(),
      Communication.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      Communication.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Communication.countDocuments({ createdAt: { $gte: sevenDaysAgo } })
    ]);

    const byTypeMap: Record<string, number> = {};
    byType.forEach((item: any) => {
      byTypeMap[item._id] = item.count;
    });

    const byStatusMap: Record<string, number> = {};
    byStatus.forEach((item: any) => {
      byStatusMap[item._id] = item.count;
    });

    return {
      total,
      byType: byTypeMap,
      byStatus: byStatusMap,
      recent
    };
  } catch (error: any) {
    logger.error(`Failed to fetch communication stats: ${error.message}`);
    throw error;
  }
}

