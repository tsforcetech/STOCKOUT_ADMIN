import { z } from "zod";

/**
 * Form helpers. The backend returns 400 INVALID_DATA without field details, so every limit is
 * validated here. Numeric inputs are kept as strings in the form and converted on submit.
 */

export const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`);

export const optionalText = (label: string, max: number) => z.string().trim().max(max, `${label} must be at most ${max} characters.`);

const INT_RE = /^-?\d+$/;
const NUM_RE = /^-?(\d+(\.\d*)?|\.\d+)$/;

/** Integer kept as a string. Empty is allowed only when `optional`. */
export function intString(label: string, opts: { min?: number; max?: number; optional?: boolean } = {}) {
  return z.string().trim().superRefine((value, ctx) => {
    if (value === "") {
      if (!opts.optional) ctx.addIssue({ code: "custom", message: `${label} is required.` });
      return;
    }
    if (!INT_RE.test(value)) {
      ctx.addIssue({ code: "custom", message: `${label} must be a whole number.` });
      return;
    }
    const n = Number(value);
    if (opts.min !== undefined && n < opts.min) ctx.addIssue({ code: "custom", message: `${label} must be at least ${opts.min}.` });
    if (opts.max !== undefined && n > opts.max) ctx.addIssue({ code: "custom", message: `${label} must be at most ${opts.max}.` });
    if (!Number.isSafeInteger(n)) ctx.addIssue({ code: "custom", message: `${label} is too large.` });
  });
}

/** Decimal number kept as a string (optional). */
export function numString(label: string, opts: { optional?: boolean; min?: number; exclusiveMin?: number } = {}) {
  return z.string().trim().superRefine((value, ctx) => {
    if (value === "") {
      if (!opts.optional) ctx.addIssue({ code: "custom", message: `${label} is required.` });
      return;
    }
    if (!NUM_RE.test(value)) {
      ctx.addIssue({ code: "custom", message: `${label} must be a number.` });
      return;
    }
    const n = Number(value);
    if (opts.min !== undefined && n < opts.min) ctx.addIssue({ code: "custom", message: `${label} must be at least ${opts.min}.` });
    if (opts.exclusiveMin !== undefined && n <= opts.exclusiveMin) ctx.addIssue({ code: "custom", message: `${label} must be greater than ${opts.exclusiveMin}.` });
  });
}

export const isBlank = (value: string | null | undefined) => !value || value.trim() === "";
export const toInt = (value: string): number => Number.parseInt(value.trim(), 10);
export const toOptInt = (value: string): number | null => (isBlank(value) ? null : Number.parseInt(value.trim(), 10));
export const toOptNum = (value: string): number | null => (isBlank(value) ? null : Number(value.trim()));
export const toOptText = (value: string): string | null => (isBlank(value) ? null : value.trim());
export const numToString = (value: number | null | undefined): string => (value === null || value === undefined ? "" : String(value));

/** Lowercase code pattern used by conditions/grades/units (server trims + lowercases). */
export const lowerCodeHint = "Stored lowercase. Cannot be changed later.";
