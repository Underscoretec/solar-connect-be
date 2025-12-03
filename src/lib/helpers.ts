/**
 * Helper utilities for message parsing and validation
 */

/**
 * Clean JSON string by removing trailing commas and other common issues
 * @param jsonString - Raw JSON string that may have formatting issues
 * @returns Cleaned JSON string
 */
function cleanJsonString(jsonString: string): string {
  // Remove trailing commas before closing braces/brackets
  // This regex handles: { "key": "value", } -> { "key": "value" }
  let cleaned = jsonString.replace(/,(\s*[}\]])/g, '$1');

  // Remove trailing commas at end of lines before closing braces
  cleaned = cleaned.replace(/,(\s*\n\s*[}\]])/g, '$1');

  return cleaned;
}

/**
 * Extract trailing JSON block from LLM response text
 * Handles both plain JSON and JSON inside markdown code blocks
 * @param text - The full text response from LLM
 * @returns Parsed JSON object or null if not found/invalid
 */
export function extractTrailingJson(text: string): any | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  try {
    // First, try to extract JSON from markdown code block (```json ... ```)
    const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
    const matches = [...text.matchAll(codeBlockRegex)];

    if (matches.length > 0) {
      // Get the last code block
      const lastMatch = matches[matches.length - 1];
      let jsonString = lastMatch[1].trim();

      // Clean the JSON string (remove trailing commas, etc.)
      jsonString = cleanJsonString(jsonString);

      try {
        const parsed = JSON.parse(jsonString);
        return parsed;
      } catch (e) {
        // If parsing fails, fall through to try plain JSON extraction
      }
    }

    // Fallback: Find the last occurrence of { and }
    const lastOpenBrace = text.lastIndexOf('{');
    const lastCloseBrace = text.lastIndexOf('}');

    if (lastOpenBrace === -1 || lastCloseBrace === -1 || lastOpenBrace >= lastCloseBrace) {
      return null;
    }

    // Extract the JSON string
    let jsonString = text.substring(lastOpenBrace, lastCloseBrace + 1);

    // Clean the JSON string (remove trailing commas, etc.)
    jsonString = cleanJsonString(jsonString);

    // Try to parse it
    try {
      const parsed = JSON.parse(jsonString);
      return parsed;
    } catch (parseError) {
      // If still fails, try to fix common issues more aggressively
      // Remove comments (though JSON shouldn't have them)
      jsonString = jsonString.replace(/\/\*[\s\S]*?\*\//g, '');
      jsonString = jsonString.replace(/\/\/.*$/gm, '');

      // Try one more time with cleaned string
      try {
        const parsed = JSON.parse(jsonString);
        return parsed;
      } catch (finalError) {
        return null;
      }
    }
  } catch (error) {
    return null;
  }
}

/**
 * Normalize email address to lowercase and trim whitespace
 * @param email - Raw email string
 * @returns Normalized email
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }
  return email.trim().toLowerCase();
}

/**
 * Validate email format using regex
 * @param email - Email string to validate
 * @returns True if valid email format
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate phone number format
 * Accepts international format with optional + and 7-15 digits
 * @param phone - Phone string to validate
 * @returns True if valid phone format
 */
export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  const phoneRegex = /^[0-9+]{7,15}$/;
  return phoneRegex.test(phone.trim());
}

/**
 * Remove trailing JSON from text to get clean message text
 * Handles both markdown code blocks and plain JSON
 * @param text - Full text with trailing JSON
 * @returns Text without the JSON block
 */
export function removeTrailingJson(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // Remove markdown code blocks containing JSON
  const codeBlockRegex = /```(?:json)?\s*\n?[\s\S]*?\n?```/g;
  let cleanText = text.replace(codeBlockRegex, '').trim();

  // Also remove any remaining plain JSON at the end
  const lastOpenBrace = cleanText.lastIndexOf('{');
  if (lastOpenBrace !== -1) {
    cleanText = cleanText.substring(0, lastOpenBrace).trim();
  }

  return cleanText;
}



// 🛠 Clean Gemini output (remove markdown fences like ```json ... ```)
export function parseGeminiOutput(text: string) {
  const cleaned = text.replace(/```json/i, "").replace(/```/g, "").trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // Fallback: remove trailing commas
    const noTrailingCommas = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]")
    return JSON.parse(noTrailingCommas)
  }
}


export function minifyPrompt(prompt: string): string {
  return prompt
    // remove all newlines
    .replace(/\n+/g, ' ')
    // collapse multiple spaces to a single space
    .replace(/\s\s+/g, ' ')
    // trim leading/trailing whitespace
    .trim();
}


function injectUiHint(questionId: string | null): any {
  if (!questionId) return null;

  const uiHints: Record<string, any> = {
    'full_name': {
      presentation: 'chat_input',
      placeholder: 'e.g., Rajesh Kumar',
      keyboard: 'text'
    },
    'phone': {
      presentation: 'chat_input',
      placeholder: '+91-XXXXXXXXXX',
      keyboard: 'phone'
    },
    'email': {
      presentation: 'chat_input',
      placeholder: 'you@example.com',
      keyboard: 'email'
    },
    'address_group': {
      presentation: 'modal_form',
      hint: "We'll collect your complete address in one go"
    },
    'nets_interest': {
      presentation: 'buttons',
      options: [
        { value: 'yes', label: "Yes, I'm interested", description: 'Protects against birds, debris, and weather' },
        { value: 'no', label: 'No, not needed', description: 'Standard installation without nets' }
      ]
    },
    'upload_section': {
      presentation: 'upload_form',
      hint: 'Photos help our team provide accurate assessment'
    }
  };

  return uiHints[questionId] || {
    presentation: 'chat_input',
    placeholder: null,
    keyboard: 'text'
  };
}