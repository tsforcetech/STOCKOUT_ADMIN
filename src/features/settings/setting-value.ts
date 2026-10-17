import type { PlatformSettingValueType } from "@/api/types/user-organization";

/**
 * Client copy of PlatformConfigurationService.ValidateSettingValue (user-organization):
 *  STRING  ≤ 1000 chars ("" allowed)
 *  BOOLEAN exactly "true" | "false"
 *  INTEGER int.TryParse(AllowLeadingSign, Invariant) — optional sign + digits, Int32 range, no whitespace
 *  DECIMAL decimal.TryParse(AllowLeadingSign | AllowDecimalPoint, Invariant) — no whitespace/exponent/thousands
 * Range hints in descriptions are NOT enforced by the server, so they are not enforced here either.
 */
const INT_MIN = -2147483648;
const INT_MAX = 2147483647;
/** decimal.MaxValue (79228162514264337593543950335) — approximated; values this large are not realistic settings. */
const DECIMAL_MAX = 7.9228e28;

export function validateSettingValue(type: PlatformSettingValueType, value: string): string | null {
  switch (type) {
    case "STRING":
      return value.length > 1000 ? "Must be at most 1000 characters." : null;
    case "BOOLEAN":
      return value === "true" || value === "false" ? null : 'Must be "true" or "false".';
    case "INTEGER": {
      if (!/^[+-]?\d+$/.test(value)) return "Enter a whole number (digits with an optional leading + or −; no spaces or separators).";
      const n = Number(value);
      return n < INT_MIN || n > INT_MAX ? `Must be between ${INT_MIN} and ${INT_MAX}.` : null;
    }
    case "DECIMAL": {
      if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(value)) return "Enter a number using a dot as decimal separator (no spaces, exponents or thousands separators).";
      return Math.abs(Number(value)) > DECIMAL_MAX ? "The number is too large." : null;
    }
    default:
      return "Unsupported value type.";
  }
}

export const VALUE_TYPE_LABEL: Record<PlatformSettingValueType, string> = { BOOLEAN: "Boolean", INTEGER: "Integer", DECIMAL: "Decimal", STRING: "Text" };
