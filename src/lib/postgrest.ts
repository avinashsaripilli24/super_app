/**
 * Helpers for building PostgREST filter strings by hand (the `.or()` API takes
 * a raw string, so values need PostgREST quoting rather than URL encoding).
 */

/**
 * ilike pattern for a free-text term: `*` wildcards on both ends, LIKE
 * metacharacters escaped, and the whole value double-quoted so commas, dots or
 * parentheses in the term cannot break out of an `or=(...)` group.
 */
export function likePattern(term: string): string {
  const escaped = term.replace(/[\\%_]/g, '\\$&').replace(/"/g, '\\"')
  return `"*${escaped}*"`
}

/** `col.in.(a,b,c)` fragment. Returns null for an empty list (PostgREST rejects `in.()`). */
export function inList(column: string, ids: readonly string[]): string | null {
  return ids.length ? `${column}.in.(${ids.join(',')})` : null
}
