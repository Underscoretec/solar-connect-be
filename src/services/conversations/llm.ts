import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

//system prompts
import { SYSTEM_PROMPT } from "../../prompts/systemPrompt";


const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface LlmTurnInput {
  field: any | null; // the field object from FORM_JSON2 (or null)
  collectedProfile: Array<{ // Pass the array directly
    id: string;
    order?: string;
    questionId: string;
    value: any;
  }>;
  lastUserMessage: string | null; // null = asking, non-null = parsing
  attachmentsMeta?: {
    id: string;
    type: string;
    mimeType?: string;
    size?: number;
  }[];
  last3Messages?: Array<{
    role: "user" | "assistant" | "system";
    text: string;
  }>;
}

export interface LlmTurnOutput {
  action: "ask_question" | "store_answer" | "clarify" | "update_answer" | "go_back" | null;
  questionId: string | null;
  assistantText: string;
  answer?: any | null;
  emailFound?: string | null;
  nameFound?: string | null;
  validation?: {
    isValid: boolean;
    errors: string[];
    normalized?: any;
  } | null;
  updateFields?: Array<{
    id: string;
    order?: string;
    questionId: string;
    value: any;
  }>;
  repeatQuestion?: boolean;
}

export async function callFormLlm(input: LlmTurnInput): Promise<LlmTurnOutput> {
  const userPayload = {
    field: input.field,
    collectedProfile: input.collectedProfile,
    lastUserMessage: input.lastUserMessage,
    attachmentsMeta: input.attachmentsMeta || null,
    last3Messages: input.last3Messages || null,
  };

  console.log('userPayload', userPayload);

  // Use chat completion; system prompt instructs strict JSON output
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.12,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload, null, 2) },
    ],
    max_tokens: 800,
  });

  const raw = resp?.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("LLM returned empty content");
  }

  let parsed: LlmTurnOutput;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Provide defensive fallback: attempt to find JSON substring
    const maybeJson = raw.substring(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    try {
      parsed = JSON.parse(maybeJson);
    } catch (err2) {
      throw new Error(`Failed to parse LLM JSON. Raw response: ${raw}`);
    }
  }

  console.log('parsed', parsed);

  // Ensure certain fields exist
  parsed.action = parsed.action || null;
  parsed.assistantText = parsed.assistantText || "Sorry, I couldn't process that.";
  parsed.questionId = parsed.questionId || (input.field?.questionId || null);
  parsed.answer = parsed.answer !== undefined ? parsed.answer : null;
  parsed.validation = parsed.validation || null;
  parsed.updateFields = parsed.updateFields || [];
  parsed.emailFound = parsed.emailFound !== undefined ? parsed.emailFound : null;
  parsed.nameFound = parsed.nameFound !== undefined ? parsed.nameFound : null;
  parsed.repeatQuestion = parsed.repeatQuestion ?? false;

  return parsed;
}




const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function callFormLlmGemini(
  input: LlmTurnInput
): Promise<LlmTurnOutput> {
  const userPayload = {
    field: input.field,
    collectedProfile: input.collectedProfile,
    lastUserMessage: input.lastUserMessage,
    attachmentsMeta: input.attachmentsMeta || null,
    last3Messages: input.last3Messages || null,
  };

  console.log("gemini userPayload", userPayload);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.12,
      topK: 1,
      topP: 1,
      maxOutputTokens: 800,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent(
    JSON.stringify(userPayload, null, 2)
  );

  const raw =
    result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!raw) {
    throw new Error("Gemini returned empty content");
  }

  let parsed: LlmTurnOutput;

  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Defensive fallback (same as OpenAI)
    const maybeJson = raw.substring(
      raw.indexOf("{"),
      raw.lastIndexOf("}") + 1
    );
    try {
      parsed = JSON.parse(maybeJson);
    } catch (err2) {
      throw new Error(`Failed to parse Gemini JSON. Raw response: ${raw}`);
    }
  }

  console.log("gemini parsed", parsed);

  // Normalize output (same guarantees as OpenAI)
  parsed.action = parsed.action || null;
  parsed.assistantText =
    parsed.assistantText || "Sorry, I couldn't process that.";
  parsed.questionId =
    parsed.questionId || (input.field?.questionId || null);
  parsed.answer = parsed.answer !== undefined ? parsed.answer : null;
  parsed.validation = parsed.validation || null;
  parsed.updateFields = parsed.updateFields || [];
  parsed.emailFound =
    parsed.emailFound !== undefined ? parsed.emailFound : null;
  parsed.nameFound =
    parsed.nameFound !== undefined ? parsed.nameFound : null;
  parsed.repeatQuestion = parsed.repeatQuestion ?? false;

  return parsed;
}
