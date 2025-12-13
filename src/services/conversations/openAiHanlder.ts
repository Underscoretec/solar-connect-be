// src/lib/openAiHandler.ts
import OpenAI from "openai";
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
}

export interface LlmTurnOutput {
  action: "ask_question" | "store_answer" | "clarify" | "update_answer" | "go_back" | null;
  questionId: string | null;
  assistantText: string;
  answer?: any | null;
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
}

export async function callFormLlm(input: LlmTurnInput): Promise<LlmTurnOutput> {
  const userPayload = {
    field: input.field,
    collectedProfile: input.collectedProfile,
    lastUserMessage: input.lastUserMessage,
    attachmentsMeta: input.attachmentsMeta || null,
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

  return parsed;
}
