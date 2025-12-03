/**
 * Email service for sending conversation links and notifications
 */

import logger from '../services/logger';

// Dynamic import for nodemailer to avoid TypeScript issues
const nodemailer = require('nodemailer');

// SMTP configuration from environment variables
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
    secure: SMTP_PORT === 465, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};

/**
 * Send conversation link email to continue conversation
 * @param toEmail - Recipient email address
 * @param conversationLink - Direct link to conversation with conversationId
 * @param customerName - Optional customer name for personalization
 */
export async function sendConversationLinkEmail(
  toEmail: string,
  conversationLink: string,
  customerName?: string
): Promise<void> {
  try {
    logger.info(`📧 Attempting to send email to: ${toEmail}`);
    logger.info(`SMTP Config - Host: ${SMTP_HOST}, Port: ${SMTP_PORT}, User: ${SMTP_USER ? '✓ Configured' : '✗ Not set'}`);

    if (!SMTP_USER || !SMTP_PASS) {
      const errorMsg = 'SMTP credentials not configured. Please set SMTP_USER and SMTP_PASS environment variables.';
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    const transporter = createTransporter();

    const greeting = customerName ? `Hi ${customerName}` : 'Hi there';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #f4f4f4;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: #ffffff;
            padding: 30px;
            border: 1px solid #e0e0e0;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #4CAF50;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            padding: 20px;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>SolarConnect - Continue Your Conversation</h2>
          </div>
          <div class="content">
            <p>${greeting},</p>
            <p>Thank you for starting your solar onboarding journey with us!</p>
            <p>We've saved your progress. You can continue your conversation anytime by clicking the button below:</p>
            <div style="text-align: center;">
              <a href="${conversationLink}" class="button">Continue Conversation</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #4CAF50;">${conversationLink}</p>
            <p>You can bookmark this link and return to it whenever you'd like to continue.</p>
            <p>If you have any questions, feel free to reply to this email.</p>
            <p>Best regards,<br>The SolarConnect Team</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} SolarConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"SolarConnect" <${EMAIL_FROM}>`,
      to: toEmail,
      subject: 'Continue Your Solar Onboarding Conversation',
      html: htmlContent,
      text: `${greeting},\n\nThank you for starting your solar onboarding journey with us!\n\nYou can continue your conversation by visiting this link:\n${conversationLink}\n\nBest regards,\nThe SolarConnect Team`,
    };

    logger.info('📨 Sending email via SMTP...');
    const info = await transporter.sendMail(mailOptions);
    logger.info(`✅ Email sent successfully! Message ID: ${info.messageId}`);
    logger.info(`📬 Recipient: ${toEmail}`);
  } catch (error: any) {
    logger.error(`❌ Email sending failed to ${toEmail}`);
    logger.error(`Error message: ${error.message}`);
    logger.error(`Error code: ${error.code || 'N/A'}`);

    // Provide helpful error messages
    if (error.code === 'EAUTH') {
      logger.error('Authentication failed. Please check SMTP_USER and SMTP_PASS credentials.');
    } else if (error.code === 'ECONNECTION') {
      logger.error('Connection failed. Please check SMTP_HOST and SMTP_PORT settings.');
    } else if (error.code === 'ETIMEDOUT') {
      logger.error('Connection timed out. Please check your network and SMTP server settings.');
    }

    throw new Error(`Email sending failed: ${error.message}`);
  }
}

/**
 * Send thank you email with collected customer data
 * @param toEmail - Recipient email address
 * @param customerName - Customer name for personalization
 * @param customerData - Collected customer data to include in email
 */
export async function sendThankYouEmail(
  toEmail: string,
  customerName?: string,
  customerData?: any
): Promise<void> {
  try {
    logger.info(`📧 Attempting to send thank you email to: ${toEmail}`);

    if (!SMTP_USER || !SMTP_PASS) {
      const errorMsg = 'SMTP credentials not configured. Please set SMTP_USER and SMTP_PASS environment variables.';
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    const transporter = createTransporter();
    const greeting = customerName ? `Hi ${customerName}` : 'Hi there';

    // Format customer data for display
    let dataSummary = '';
    if (customerData) {
      const dataItems: string[] = [];

      if (customerData.name) dataItems.push(`<strong>Name:</strong> ${customerData.name}`);
      if (customerData.email) dataItems.push(`<strong>Email:</strong> ${customerData.email}`);
      if (customerData.phone) dataItems.push(`<strong>Phone:</strong> ${customerData.phone}`);

      if (customerData.address) {
        const addr = customerData.address;
        const addressParts: string[] = [];
        if (addr.address_line) addressParts.push(addr.address_line);
        if (addr.pin_code) addressParts.push(addr.pin_code);
        if (addr.address_country) addressParts.push(addr.address_country);
        if (addressParts.length > 0) {
          dataItems.push(`<strong>Address:</strong> ${addressParts.join(', ')}`);
        }
      }

      if (customerData.meta) {
        Object.keys(customerData.meta).forEach(key => {
          if (key !== 'createdFromConversation' && customerData.meta[key]) {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            dataItems.push(`<strong>${label}:</strong> ${customerData.meta[key]}`);
          }
        });
      }

      if (dataItems.length > 0) {
        dataSummary = `
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Your Submitted Information:</h3>
            <ul style="list-style: none; padding: 0;">
              ${dataItems.map(item => `<li style="margin: 10px 0;">${item}</li>`).join('')}
            </ul>
          </div>
        `;
      }
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #4CAF50;
            color: #ffffff;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: #ffffff;
            padding: 30px;
            border: 1px solid #e0e0e0;
          }
          .footer {
            text-align: center;
            padding: 20px;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Thank You for Your Interest!</h2>
          </div>
          <div class="content">
            <p>${greeting},</p>
            <p>Thank you for completing your solar onboarding form with SolarConnect!</p>
            <p>We've received all your information and our team will review it shortly. We'll get back to you soon with the next steps.</p>
            ${dataSummary}
            <p>If you have any questions or need to make changes to your information, please don't hesitate to contact us.</p>
            <p>Best regards,<br>The SolarConnect Team</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} SolarConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"SolarConnect" <${EMAIL_FROM}>`,
      to: toEmail,
      subject: 'Thank You - Your Solar Onboarding is Complete',
      html: htmlContent,
      text: `${greeting},\n\nThank you for completing your solar onboarding form with SolarConnect!\n\nWe've received all your information and our team will review it shortly. We'll get back to you soon with the next steps.\n\nBest regards,\nThe SolarConnect Team`,
    };

    logger.info('📨 Sending thank you email via SMTP...');
    const info = await transporter.sendMail(mailOptions);
    logger.info(`✅ Thank you email sent successfully! Message ID: ${info.messageId}`);
    logger.info(`📬 Recipient: ${toEmail}`);
  } catch (error: any) {
    logger.error(`❌ Thank you email sending failed to ${toEmail}`);
    logger.error(`Error message: ${error.message}`);
    throw new Error(`Thank you email sending failed: ${error.message}`);
  }
}


