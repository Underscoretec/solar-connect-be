/**
 * LLM service for generating email templates
 */

import OpenAI from "openai";
import logger from "../services/logger";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface EmailGenerationInput {
  customerName?: string;
  customerEmail?: string;
  customerProfile?: Record<string, any>;
  prompt: string;
  context?: string;
}

export interface EmailGenerationOutput {
  subject: string;
  content: string;
}

/**
 * Generate email template using OpenAI
 */
export async function generateEmailTemplate(
  input: EmailGenerationInput
): Promise<EmailGenerationOutput> {
  try {
    const systemPrompt = `You are an expert email writer for SolarConnect, a solar energy company. 
Your task is to generate professional, personalized emails to customers based on the given context and prompt.

Guidelines:
- Be professional, friendly, and concise
- Personalize the email using customer information when available
- Use proper email formatting with greetings and sign-offs
- Keep the tone conversational yet professional
- Focus on the customer's needs and provide value
- Always end with "Best regards, [Your Name] - SolarConnect Team"

Output your response as a JSON object with two fields:
{
  "subject": "Email subject line",
  "content": "Full email body with HTML formatting if needed"
}`;

    const userContext = `
Customer Information:
${input.customerName ? `- Name: ${input.customerName}` : ''}
${input.customerEmail ? `- Email: ${input.customerEmail}` : ''}
${input.customerProfile ? `- Profile: ${JSON.stringify(input.customerProfile, null, 2)}` : ''}

${input.context ? `Additional Context: ${input.context}` : ''}

User's Prompt: ${input.prompt}

Generate a professional email based on the above information and prompt.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContext }
      ],
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const raw = response?.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error("LLM returned empty content");
    }

    let parsed: EmailGenerationOutput;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Failed to parse LLM JSON response: ${raw}`);
    }

    // Validate output
    if (!parsed.subject || !parsed.content) {
      throw new Error("LLM response missing required fields (subject or content)");
    }

    logger.info(`Generated email template with subject: ${parsed.subject}`);
    return parsed;
  } catch (error: any) {
    logger.error(`Email template generation failed: ${error.message}`);
    throw new Error(`Failed to generate email template: ${error.message}`);
  }
}

