/**
 * Search & Discovery API types (services/search-discovery, /api/v1/search/*). Responses are NOT enveloped.
 * See docs/contracts/files-notifications-search.md §C.
 */

/** ISO-8601 date-time string. */
type IsoDateTime = string;

/** C# SearchSortOrders (input case-insensitive). */
export type SearchSort = 'relevance' | 'date_desc' | 'price_asc' | 'price_desc';

/** C# SearchSuggestionTypes. */
export type SearchSuggestionType = 'listing' | 'brand' | 'category';

/** C# Domain.Exceptions.SearchErrorCodes symbols that the listings/suggest endpoints can emit. */
export type SearchErrorSymbol =
  | 'MARKETPLACE_SEARCH_INTERNAL_ERROR'
  | 'MARKETPLACE_SEARCH_FILTER_INVALID'
  | 'MARKETPLACE_SEARCH_PAGINATION_INVALID'
  | 'MARKETPLACE_SEARCH_PAGINATION_LIMIT_EXCEEDED'
  | 'MARKETPLACE_SEARCH_CURRENCY_REQUIRED'
  | 'MARKETPLACE_SEARCH_SORT_INVALID'
  | 'MARKETPLACE_SEARCH_UNAVAILABLE';

/** Numeric codes matching SearchErrorSymbol (50900..50906). */
export type SearchErrorNumericCode = 50900 | 50901 | 50902 | 50903 | 50904 | 50905 | 50906;

/** C# SearchProblemDetailsDto. title === errorSymbol. 503 carries Retry-After: 30. */
export interface SearchProblemDetails {
  type: string; // "https://tools.ietf.org/html/rfc7807"
  title: SearchErrorSymbol;
  status: 400 | 500 | 503;
  detail: string;
  errorCode: SearchErrorNumericCode;
  errorSymbol: SearchErrorSymbol;
  traceId: string | null;
}

/**
 * Query for GET /api/v1/search/listings (C# SearchListingsRequest + controller-parsed attribute keys).
 * GUID lists may be sent comma-separated or repeated. Dynamic attributes: `attributes[CODE]=v1,v2` (or attrs[CODE], attrs.CODE)
 * and/or repeated `attr=CODE:VALUE`.
 */
export interface SearchListingsQuery {
  q?: string; // <= 200 chars after whitespace normalisation
  categoryId?: string;
  brandId?: string[]; // <= 50
  conditionId?: string[]; // <= 50
  gradeId?: string[]; // <= 50
  currency?: string; // 3 letters; required with minPrice/maxPrice or price_* sort
  minPrice?: number;
  maxPrice?: number;
  countryCode?: string; // 2 letters
  stateOrEmirate?: string; // <= 100
  city?: string; // <= 100
  inStockOnly?: boolean;
  attributes?: Record<string, string>; // CODE -> comma-separated values; CODE ^[A-Z0-9_-]{1,64}$ (uppercased)
  attr?: string[]; // "CODE:VALUE[,VALUE]"
  sort?: SearchSort; // default 'relevance'
  page?: number; // default 1, >= 1
  pageSize?: number; // default 20, 1..100; page*pageSize <= 1000
}

/** C# SearchPaginationMetadataDto. */
export interface SearchPaginationMetadata {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/** C# SearchCardImageDto. */
export interface SearchCardImage {
  fileAssetId: string;
  cdnUrl: string;
}

/** C# SearchCardSellerDto. */
export interface SearchCardSeller {
  sellerId: string;
  displayName: string;
  entityType: string;
  isVerified: boolean;
}

/** C# SearchCardLocationDto. */
export interface SearchCardLocation {
  countryCode: string;
  stateOrEmirate: string;
  city: string;
}

/** C# SearchCardAttributeDto. */
export interface SearchCardAttribute {
  code: string;
  textValue: string | null;
  numValue: number | null;
}

/** C# ListingSearchCardDto. pricingMode is a free string from catalog (default "FIXED_PRICE"). */
export interface ListingSearchCard {
  listingId: string;
  publishedVersionId: string;
  versionNumber: number;
  listingNumber: string;
  title: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  categoryBreadcrumb: string[];
  brandId: string | null;
  brandName: string | null;
  conditionId: string | null;
  conditionName: string | null;
  gradeId: string | null;
  gradeName: string | null;
  pricingMode: string;
  basePrice: number;
  currency: string;
  quantityUnitId: string | null;
  quantityUnitName: string | null;
  quantityUnitSymbol: string | null;
  sellableQuantity: number;
  isAvailable: boolean;
  expiresAtUtc: IsoDateTime | null;
  primaryImage: SearchCardImage | null;
  seller: SearchCardSeller;
  location: SearchCardLocation;
  attributes: SearchCardAttribute[];
  publishedAtUtc: IsoDateTime;
}

/** C# CategoryFacetBucketDto. */
export interface CategoryFacetBucket {
  categoryId: string;
  categoryName: string;
  count: number;
}

/** C# IdNameFacetBucketDto. */
export interface IdNameFacetBucket {
  id: string;
  name: string;
  count: number;
}

/** C# TermFacetBucketDto. */
export interface TermFacetBucket {
  key: string;
  count: number;
}

/** C# PriceRangeFacetDto. */
export interface PriceRangeFacet {
  currency: string | null;
  minPrice: number | null;
  maxPrice: number | null;
}

/** C# AttributeFacetGroupDto. */
export interface AttributeFacetGroup {
  code: string;
  values: TermFacetBucket[];
}

/** C# SearchFacetsDto. */
export interface SearchFacets {
  categories: CategoryFacetBucket[];
  brands: IdNameFacetBucket[];
  conditions: IdNameFacetBucket[];
  grades: IdNameFacetBucket[];
  countries: TermFacetBucket[];
  statesOrEmirates: TermFacetBucket[];
  cities: TermFacetBucket[];
  currencies: TermFacetBucket[];
  priceRange: PriceRangeFacet;
  inStockCount: number;
  attributes: AttributeFacetGroup[];
}

/** C# AppliedSearchFiltersDto. attributes keys are uppercase attribute codes (dictionary keys not camelCased). */
export interface AppliedSearchFilters {
  q: string | null;
  categoryId: string | null;
  brandIds: string[];
  conditionIds: string[];
  gradeIds: string[];
  currency: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  countryCode: string | null;
  stateOrEmirate: string | null;
  city: string | null;
  inStockOnly: boolean;
  attributes: Record<string, string[]>;
}

/** C# SearchListingsResponse. NOTE: items are post-filtered; items.length may be < pageSize even when more results exist. */
export interface SearchListingsResponse {
  items: ListingSearchCard[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  sort: SearchSort;
  pagination: SearchPaginationMetadata;
  facets: SearchFacets;
  appliedFilters: AppliedSearchFilters;
}

/** Query for GET /api/v1/search/suggest (C# SearchSuggestionsRequest). */
export interface SearchSuggestQuery {
  prefix: string; // required, 1..100 chars after sanitisation
  limit?: number; // default 10, 1..25
}

/** C# SearchSuggestionItemDto. */
export interface SearchSuggestionItem {
  text: string;
  type: SearchSuggestionType;
  listingId: string | null;
  brandId: string | null;
  categoryId: string | null;
}

/** C# SearchSuggestionsDto. */
export interface SearchSuggestionsResponse {
  prefix: string;
  limit: number;
  totalCount: number;
  suggestions: SearchSuggestionItem[];
}
