import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { FORM_JSON, FORM_JSON2 } from "../prompts/formJson";
import { SYSTEM_PROMPT_FINAL } from "../prompts/systemPrompt";
import config from "../config";
import logger from "../services/logger";
import { parseGeminiOutput } from "./helpers";

// export async function callGemini(
//   historyMessages: any[],
//   userMessage: string
// ): Promise<string> {

//   const systemPrompt = SYSTEM_PROMPT;
//   const formJson = FORM_JSON;

//   try {
//     const genAI = new GoogleGenerativeAI(config.geminiApiKey);
//     const model = genAI.getGenerativeModel({
//       model: config.geminiModel,
//       systemInstruction: systemPrompt
//     });

//     const contents: any[] = [];

//     // Inject form config at the start
//     contents.push({
//       role: 'user',
//       parts: [{
//         text: `[FORM CONFIGURATION]\n${JSON.stringify(formJson, null, 2)}\n\nFollow this configuration strictly for data collection.`
//       }]
//     });

//     contents.push({
//       role: 'model',
//       parts: [{
//         text: 'Understood. I will follow the form configuration precisely and return responses in the specified JSON format.'
//       }]
//     });

//     // Add conversation history
//     historyMessages.forEach(msg => {
//       if (msg.role === 'user' || msg.role === 'assistant') {
//         contents.push({
//           role: msg.role === 'user' ? 'user' : 'model',
//           parts: [{ text: msg.text || '' }]
//         });
//       }
//     });

//     // Add current user message
//     contents.push({
//       role: 'user',
//       parts: [{ text: userMessage }]
//     });

//     const chat = model.startChat({
//       history: contents.slice(0, -1),
//       generationConfig: {
//         temperature: 0,
//         topK: 1,
//         topP: 1,
//         maxOutputTokens: 2048,
//       }
//     });

//     const result = await chat.sendMessage(userMessage);
//     const response = result.response;
//     const text = response.text();

//     logger.info(`✅ Gemini response generated (${text.length} chars)`);

//     return text;
//   } catch (error: any) {
//     const logger = require('../services/logger').default;
//     logger.error(`❌ Gemini API call failed: ${error.message}`);
//     throw new Error(`Failed to call Gemini API: ${error.message}`);
//   }
// }

export async function callGemini(
  historyMessages: any[],
  userMessage: string
): Promise<any> {
  const logger = require('../services/logger').default;

  const systemPrompt = SYSTEM_PROMPT_FINAL;
  const formJson = FORM_JSON2;

  try {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);

    // Create model with deterministic generation defaults as a safety net
    const model = genAI.getGenerativeModel({
      model: config.geminiModel,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0,
        topK: 1,
        topP: 1
      }
    });

    const contents: any[] = [];

    // Inject form config at the start (kept as a user/system preface)
    contents.push({
      role: 'user',
      parts: [{
        text: `[FORM CONFIGURATION]\n${JSON.stringify(formJson, null, 2)}\n\nFollow this configuration strictly for data collection.`
      }]
    });

    // Confirm model behavior (short assistant seed)
    contents.push({
      role: 'model',
      parts: [{
        text: 'Understood. I will follow the form configuration precisely and return responses in the specified JSON format.'
      }]
    });

    // Add conversation history (only user/assistant turns)
    historyMessages.forEach(msg => {
      if (msg.role === 'user' || msg.role === 'assistant') {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text || '' }]
        });
      }
    });

    // Append the current user message as the final user part (we will pass it via sendMessage)
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    // Start chat using history excluding the last user message (we will send that with sendMessage)
    const chat = model.startChat({
      history: contents.slice(0, -1),
      generationConfig: {
        temperature: 0,
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048,
        responseMimeType: "application/json"
      }
    });

    // Send current user message (this produces the assistant reply)
    const result = await chat.sendMessage(userMessage);
    const response = result.response;
    const text = response.text();

    // Validate JSON-only output
    const parsedText = parseGeminiOutput(text);
    console.log(parsedText, "parsedText");

    logger.info(`✅ Gemini response generated (${text.length} chars)`);

    // Return the raw assistant text (which should be a valid JSON string)
    return parsedText;
  } catch (error: any) {
    const logger = require('../services/logger').default;
    logger.error(`❌ Gemini API call failed: ${error.message}`, { stack: error.stack });
    throw new Error(`Failed to call Gemini API: ${error.message}`);
  }
}


/**
 * Call OpenAI LLM with conversation history
 * Returns response in the same format as Gemini
 */
// export async function callOpenAI(
//   historyMessages: any[],
//   userMessage: string
// ): Promise<string> {
//   const systemPrompt = SYSTEM_PROMPT;
//   const formJson = FORM_JSON;

//   try {
//     // Check if OpenAI API key is configured
//     const openaiApiKey = process.env.OPENAI_API_KEY;
//     if (!openaiApiKey) {
//       throw new Error('OPENAI_API_KEY not configured in environment variables');
//     }

//     const openai = new OpenAI({
//       apiKey: openaiApiKey,
//     });

//     const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

//     // Add system message with form configuration
//     messages.push({
//       role: 'system',
//       content: `${systemPrompt}\n\n[FORM CONFIGURATION]\n${JSON.stringify(formJson, null, 2)}\n\nFollow this configuration strictly for data collection.`
//     });

//     // Inject form acknowledgment
//     messages.push({
//       role: 'user',
//       content: `[FORM CONFIGURATION]\n${JSON.stringify(formJson, null, 2)}\n\nFollow this configuration strictly for data collection.`
//     });

//     messages.push({
//       role: 'assistant',
//       content: 'Understood. I will follow the form configuration precisely and return responses in the specified JSON format.'
//     });

//     // Add conversation history
//     historyMessages.forEach(msg => {
//       if (msg.role === 'user' || msg.role === 'assistant') {
//         messages.push({
//           role: msg.role,
//           content: msg.text || ''
//         });
//       }
//     });

//     // Add current user message
//     messages.push({
//       role: 'user',
//       content: userMessage
//     });

//     const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';

//     const completion = await openai.chat.completions.create({
//       model: openaiModel,
//       messages: messages,
//       temperature: 0.7,
//       max_tokens: 2048,
//       top_p: 0.95,
//     });

//     const text = completion.choices[0]?.message?.content || '';

//     if (!text) {
//       throw new Error('OpenAI returned empty response');
//     }

//     logger.info(`✅ OpenAI response generated (${text.length} chars)`);

//     return text;
//   } catch (error: any) {
//     logger.error(`❌ OpenAI API call failed: ${error.message}`);
//     throw new Error(`Failed to call OpenAI API: ${error.message}`);
//   }
// }

