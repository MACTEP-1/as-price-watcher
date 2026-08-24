/**
 * Configuration read by BOTH the server and the browser.
 *
 * Nothing here may be secret: `NEXT_PUBLIC_` values are inlined into the
 * client bundle at build time and are visible to anyone. Secrets belong in
 * server-only env vars read directly where they are used.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` only when written out
 * literally, so these must not be destructured or accessed dynamically.
 */

/**
 * Maximum dates a single /api/search request will price.
 *
 * Each date is one real SerpApi call against a 250/month quota, so this is a
 * cost control, not a preference. The API route ENFORCES it; the homepage
 * reads the same value purely to tell you what a search will cost before you
 * run it. One constant, so the warning can never disagree with the limit.
 *
 * Public on purpose: knowing the cap grants no advantage, and the server
 * applies it regardless of what any client believes.
 */
export const SEARCH_MAX_DAYS = Math.max(
  1,
  parseInt(process.env.NEXT_PUBLIC_SEARCH_MAX_DAYS ?? '5', 10)
)
