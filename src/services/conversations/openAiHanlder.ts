// src/lib/openAiHandler.ts
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "../../prompts/systemPrompt";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type LlmMode = "ask" | "parse" | "confirm_summary" | "confirm_reply";

export interface LlmTurnInput {
  mode: LlmMode;
  field: any | null; // the field object from FORM_JSON2 (or null)
  collectedData: Record<string, any>;
  lastUserMessage: string | null;
  attachmentsMeta?: {
    id: string;
    type: string;
    mimeType?: string;
    size?: number;
  }[];
}

export interface LlmTurnOutput {
  mode: LlmMode;
  questionId?: string | null;
  assistantText: string;
  answer?: any | null;
  validation?: {
    isValid: boolean;
    errors: string[];
    normalized?: any;
  };
  action?: "store_answer" | "request_confirmation" | "complete" | null;
  confirmation?: {
    status: "confirmed" | "changes" | "unclear";
    updatedFields?: Record<string, any>;
  };
}

export async function callFormLlm(input: LlmTurnInput): Promise<LlmTurnOutput> {
  const userPayload = {
    mode: input.mode,
    field: input.field,
    collectedData: input.collectedData,
    lastUserMessage: input.lastUserMessage,
    attachmentsMeta: input.attachmentsMeta || null,
  };

  console.log('userPayload', userPayload);

  // Use chat completion; system prompt instructs strict JSON output
  const resp = await client.chat.completions.create({
    model: "gpt-4o",
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
  parsed.mode = parsed.mode || input.mode;
  parsed.assistantText = parsed.assistantText || (parsed.action === "complete" ? "Thanks — done." : "Sorry, I couldn't process that.");
  if (input.field && !parsed.questionId) {
    parsed.questionId = input.field.questionId || null;
  }

  return parsed;
}
