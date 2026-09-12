/**
 * Client-side validation mirroring the backend's rules exactly:
 *   - password: app/schemas/auth.py::_validate_password_strength
 *       min 8 chars, at least one digit
 *   - phone: app/schemas/auth.py::_validate_and_normalize_phone
 *       must parse as a valid E.164 number (we do a lightweight check here;
 *       the backend remains the source of truth via libphonenumber)
 *
 * Keeping these in sync with the backend avoids "your input looks fine to
 * the app, but the server 422s" round-trips. If the backend rule changes,
 * update here too.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePassword(password: string): ValidationResult {
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters long" };
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: "Password must contain at least one digit" };
  }
  return { valid: true };
}

export function validateEmail(email: string): ValidationResult {
  // Simple RFC-5322-ish check; the backend uses pydantic's EmailStr as the
  // real source of truth. This just catches obvious typos before submit.
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email.trim())) {
    return { valid: false, error: "Enter a valid email address" };
  }
  return { valid: true };
}

export function validateFullName(name: string): ValidationResult {
  if (!name.trim()) {
    return { valid: false, error: "Full name cannot be empty" };
  }
  return { valid: true };
}

/**
 * Lightweight E.164 shape check: "+" followed by 8-15 digits. This is not
 * as strict as libphonenumber (used server-side) but catches the common
 * mistakes -- missing "+", missing country code, letters in the number --
 * before a network round trip.
 */
export function validatePhoneNumber(phone: string): ValidationResult {
  const trimmed = phone.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(trimmed)) {
    return {
      valid: false,
      error: "Phone number must be in E.164 format, e.g. +919876543210",
    };
  }
  return { valid: true };
}

export function validateOtpCode(code: string): ValidationResult {
  if (!/^\d{4,8}$/.test(code.trim())) {
    return { valid: false, error: "Enter the code you received" };
  }
  return { valid: true };
}