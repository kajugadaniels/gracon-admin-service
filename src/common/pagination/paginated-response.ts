/**
 * Shared paginated response shape used by admin endpoints whose frontend
 * client types extend `PaginatedResponse<T>` from
 * `app/admin/api/common/pagination.types.ts`.
 *
 * The shape is intentionally flat (`items`, `total`, `page`, `limit`,
 * `totalPages`) to match that contract one-to-one — older endpoints that
 * return `{ data, pagination: {...} }` use a different frontend shape and
 * should not be migrated through this helper.
 */
export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  items: T[];
}

/**
 * Builds the canonical `PaginatedResponse<T>` envelope from a count + page
 * size + already-projected items array. Centralising this avoids
 * inconsistent `totalPages` math (off-by-one when `total === 0` is the
 * usual culprit).
 *
 * @param input - Items for the current page plus the unfiltered total.
 * @returns The flat paginated envelope expected by the admin frontend.
 */
export function buildPaginatedResponse<T>(input: {
  items: T[];
  total: number;
  page: number;
  limit: number;
}): PaginatedResponse<T> {
  const totalPages = Math.max(1, Math.ceil(input.total / input.limit));
  return {
    total: input.total,
    page: input.page,
    limit: input.limit,
    totalPages,
    items: input.items,
  };
}
