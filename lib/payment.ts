/**
 * Validation for the payment details, shared by the profile form and the API
 * route that saves them. Same rules on both sides: the client version exists
 * to give a fast error message, the server version is the one that counts.
 */

const VENMO_PATTERN = /^[A-Za-z0-9_-]{3,30}$/;
const LAST4_PATTERN = /^[0-9]{4}$/;

/**
 * Strips a leading @ and surrounding whitespace. People type their handle
 * both ways and Venmo shows it with the @, so accept either and store one
 * canonical form.
 */
export function normalizeVenmoHandle(input: string): string {
  return input.trim().replace(/^@+/, "");
}

/** Returns an error message, or null when the handle is fine. Empty is fine. */
export function validateVenmoHandle(input: string): string | null {
  const handle = normalizeVenmoHandle(input);
  if (handle === "") return null;
  if (!VENMO_PATTERN.test(handle)) {
    return "Venmo handles are 3-30 characters: letters, numbers, dashes and underscores.";
  }
  return null;
}

/** Returns an error message, or null when the digits are fine. Empty is fine. */
export function validatePhoneLast4(input: string): string | null {
  const digits = input.trim();
  if (digits === "") return null;
  if (!LAST4_PATTERN.test(digits)) {
    return "Enter exactly 4 digits — the last 4 of your phone number.";
  }
  return null;
}
