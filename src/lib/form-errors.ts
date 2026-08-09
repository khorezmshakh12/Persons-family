import type { z } from 'zod';

export type FieldErrors = Record<string, string>;

/** Maps each invalid field from a failed zod safeParse to the generic
 * 'fieldInvalid' translation key — zod's own issue messages aren't
 * localized, so this doesn't try to preserve them, just which field(s)
 * to point at. */
export function fieldErrorCodes(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '');
    if (field) result[field] = 'fieldInvalid';
  }
  return result;
}
