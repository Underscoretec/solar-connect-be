
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
