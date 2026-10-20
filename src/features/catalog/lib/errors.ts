import { ApiError, getErrorMessage, isApiError } from "@/lib/api/errors";

/**
 * Friendly messages for catalog error codes. Needed because several controllers send generic
 * (conditions/grades: "Business rule or concurrency conflict.") or null (units) messages.
 */
const MESSAGES: Record<string, string> = {
  INVALID_DATA: "The server rejected the request as invalid. Check required fields, lengths and numeric ranges.",
  FORBIDDEN: "You don't have permission to perform this action.",
  // Attributes
  ATTRIBUTE_NOT_FOUND: "This attribute no longer exists.",
  ATTRIBUTE_CODE_ALREADY_EXISTS: "An attribute with this code already exists.",
  ATTRIBUTE_NAME_ALREADY_EXISTS: "An attribute with this name already exists.",
  ATTRIBUTE_ALREADY_INACTIVE: "This attribute is already inactive.",
  ATTRIBUTE_ALREADY_ACTIVE: "This attribute is already active.",
  ATTRIBUTE_OPTION_NOT_FOUND: "This option no longer exists.",
  ATTRIBUTE_OPTION_ALREADY_EXISTS: "An option with this value already exists for the attribute.",
  ATTRIBUTE_OPTION_ALREADY_INACTIVE: "This option is already inactive.",
  ATTRIBUTE_OPTION_ALREADY_ACTIVE: "This option is already active.",
  ATTRIBUTE_OPTIONS_NOT_ALLOWED: "Options are only allowed for single-select and multi-select attributes.",
  ATTRIBUTE_REQUIRES_ACTIVE_OPTION: "A select attribute assigned to a category must keep at least one active option.",
  INVALID_ATTRIBUTE_DATA_TYPE: "The selected data type is not supported.",
  INVALID_ATTRIBUTE_VALIDATION: "The validation constraints are not valid for this data type (check ranges and the regex pattern).",
  // Brands
  BRAND_NOT_FOUND: "This brand no longer exists.",
  BRAND_CODE_ALREADY_EXISTS: "A brand with this code already exists.",
  BRAND_NAME_ALREADY_EXISTS: "A brand with this name already exists.",
  BRAND_ALREADY_INACTIVE: "This brand is already inactive.",
  BRAND_ALREADY_ACTIVE: "This brand is already active.",
  // Categories
  CATEGORY_NOT_FOUND: "This category no longer exists.",
  DUPLICATE_CATEGORY_CODE: "A category with this code already exists.",
  DUPLICATE_CATEGORY_SLUG: "A category with this slug already exists.",
  PARENT_CATEGORY_NOT_FOUND: "The selected parent category no longer exists.",
  PARENT_CATEGORY_INACTIVE: "The parent category is inactive. Reactivate it first.",
  CATEGORY_PARENT_SELF_REFERENCE: "A category cannot be its own parent.",
  CATEGORY_HIERARCHY_CYCLE: "That parent would create a cycle in the category tree.",
  CATEGORY_HAS_ACTIVE_CHILDREN: "Deactivate this category's active child categories first.",
  CATEGORY_ALREADY_INACTIVE: "This category is already inactive.",
  CATEGORY_ALREADY_ACTIVE: "This category is already active.",
  CATEGORY_INACTIVE: "The category is inactive. Reactivate it to manage its assignments.",
  CATEGORY_ATTRIBUTE_ALREADY_ASSIGNED: "One of these attributes is already assigned on an ancestor category.",
  CATEGORY_BRAND_ALREADY_ASSIGNED: "One of these brands is already assigned on an ancestor category.",
  CATEGORY_UNIT_ALREADY_ASSIGNED: "A unit can only be assigned once — check for duplicate rows or a unit already set on a parent category.",
  CATEGORY_HIERARCHY_INVALID: "An ancestor category is inactive.",
  // Conditions & grades
  CONDITION_NOT_FOUND: "A selected condition no longer exists.",
  CONDITION_CODE_ALREADY_EXISTS: "A condition with this code already exists.",
  CONDITION_NAME_ALREADY_EXISTS: "A condition with this name already exists.",
  CONDITION_ALREADY_ACTIVE: "This condition is already active.",
  CONDITION_ALREADY_INACTIVE: "A selected condition is inactive.",
  CONDITION_GRADE_MAPPING_CONFLICT: "A category requires grades for this condition, so its grade list cannot be empty.",
  GRADE_NOT_FOUND: "A selected grade no longer exists.",
  GRADE_CODE_ALREADY_EXISTS: "A grade with this code already exists.",
  GRADE_NAME_ALREADY_EXISTS: "A grade with this name already exists.",
  GRADE_ALREADY_ACTIVE: "This grade is already active.",
  GRADE_ALREADY_INACTIVE: "A selected grade is inactive.",
  GRADE_REQUIRED_BUT_NO_ACTIVE_GRADES: "A condition marked 'grade required' has no active grades.",
  INVALID_INHERITANCE_MODE: "Inheritance mode must be INHERIT or OVERRIDE.",
  // Units
  UNIT_NOT_FOUND: "A selected unit was not found.",
  UNIT_CODE_ALREADY_EXISTS: "A unit with this code already exists.",
  UNIT_NAME_ALREADY_EXISTS: "A unit with this name already exists.",
  UNIT_ALREADY_ACTIVE: "This unit is already active.",
  UNIT_ALREADY_INACTIVE: "This unit is already inactive.",
  UNIT_INACTIVE: "A selected unit is inactive.",
  INVALID_UNIT_TYPE: "The unit type is not supported.",
  INVALID_QUANTITY_RANGE: "Quantity range is invalid: minimum must be greater than 0 and maximum at least the minimum.",
  INVALID_QUANTITY_PRECISION: "Quantity decimal precision must be between 0 and 6.",
  DEFAULT_UNIT_NOT_EFFECTIVE: "The default unit must be one of the category's effective units.",
  // Inspection templates
  MARKETPLACE_INSPECTION_TEMPLATE_NOT_FOUND: "This inspection template no longer exists.",
  MARKETPLACE_INSPECTION_TEMPLATE_ACTIVE_CONFLICT:
    "Conflict: another active template already covers this scope (one per category plus one global default), or the template code is already in use.",
  MARKETPLACE_INSPECTION_ROW_VERSION_INVALID: "The template version is invalid. Reload and try again.",
};

export const CONFLICT_MESSAGE = "This record was changed by someone else since you loaded it. Reload to get the latest version, then try again.";

/** 409 optimistic-concurrency failures (*_CONCURRENCY_CONFLICT, *_VERSION_CONFLICT). */
export function isConcurrencyConflict(error: unknown): boolean {
  return isApiError(error) && Boolean(error.code) && /(CONCURRENCY_CONFLICT|VERSION_CONFLICT)$/.test(error.code ?? "");
}

export function catalogErrorMessage(error: unknown): string {
  if (isConcurrencyConflict(error)) return CONFLICT_MESSAGE;
  if (isApiError(error) && error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  return getErrorMessage(error);
}

/** Rethrows API errors with a catalog-specific message so toasts and inline errors read well. */
export async function withCatalogErrors<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (!isApiError(error)) throw error;
    throw new ApiError({
      kind: error.kind,
      status: error.status,
      message: catalogErrorMessage(error),
      code: error.code,
      fieldErrors: error.fieldErrors,
      requestId: error.requestId,
      retryAfterSeconds: error.retryAfterSeconds,
      body: error.body,
    });
  }
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return isApiError(error) && error.code === code;
}
