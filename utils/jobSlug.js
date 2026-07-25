// utils/jobSlug.js
// ---------------------------------------------------------------------------
// SINGLE SOURCE OF TRUTH for the canonical JobPost slug.
//
// Canonical format:
//   {job-title}-jobs-in-{primary-city}-{company-name}
//
// Example:
//   Title   : "Sales Representative"
//   City    : ["Coimbatore", "Tirupur", "Salem"]
//   Company : "Gyanbay Solutions Pvt Ltd"
//   Slug    : "sales-representative-jobs-in-coimbatore-gyanbay-solutions"
//
// Every slug producer (model hooks, migrations, future seed scripts) MUST import
// from here. Do not re-implement slug logic anywhere else — a second copy is how
// the database ends up holding slugs the model would never generate.
//
// This module is intentionally free of mongoose/database imports so it stays
// pure and directly unit-testable. Uniqueness needs I/O, so the caller injects a
// `isSlugTaken` predicate (see buildUniqueJobSlug).
// ---------------------------------------------------------------------------

// Used when a job has no resolvable city. Matches the previous generator's
// behaviour so existing city-less documents keep producing the same city part.
export const DEFAULT_CITY_PART = 'india';

// The literal infix required between the job title and the city (Rule 2).
export const JOBS_IN_INFIX = 'jobs-in';

// Duplicate slugs start at -2 (the first holder keeps the bare slug).
export const DUPLICATE_SUFFIX_START = 2;

// Company legal-entity suffixes stripped from the company part (Rule 4).
// Compared as whole slug tokens, so "PVT." and "Pvt" both arrive here as "pvt".
const LEGAL_SUFFIX_TOKENS = new Set([
  'pvt',
  'private',
  'ltd',
  'limited',
  'llp',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
]);

const toPlainText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
};

/**
 * Lowercases, strips every non-alphanumeric character, collapses runs of
 * hyphens and trims hyphens from both ends (Rule 6).
 */
export const slugifyPart = (value) =>
  toPlainText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Picks the PRIMARY city only (Rule 3). Arrays resolve to their first non-empty
 * entry — never a concatenation of every city.
 */
export const resolvePrimaryCity = (city) => {
  if (Array.isArray(city)) {
    const first = city.find((entry) => toPlainText(entry).trim());
    return toPlainText(first).trim();
  }
  return toPlainText(city).trim();
};

/**
 * Normalizes a company name for slug use (Rule 4): slugified, then trailing
 * legal-entity tokens removed.
 *
 * Only TRAILING tokens are stripped, and only whole tokens. Stripping anywhere
 * in the string would mangle legitimate names whose first word happens to be a
 * legal token (e.g. "Corp Coffee" -> "coffee"), so removal walks in from the end
 * and stops at the first non-legal token.
 *
 * If every token is a legal suffix (a company literally named "Limited"), the
 * un-stripped slug is returned rather than an empty string.
 */
export const normalizeCompanyName = (companyName) => {
  const slug = slugifyPart(companyName);
  if (!slug) return '';

  const tokens = slug.split('-').filter(Boolean);
  let end = tokens.length;
  while (end > 0 && LEGAL_SUFFIX_TOKENS.has(tokens[end - 1])) {
    end -= 1;
  }

  const kept = tokens.slice(0, end);
  return kept.length > 0 ? kept.join('-') : slug;
};

/**
 * Builds the canonical BASE slug — no uniqueness suffix applied (Rule 5).
 *
 *   {job-title}-jobs-in-{primary-city}-{company-name}
 *
 * The title comes from the job's own `title` field, never from the linked Role
 * (Rule 1). A missing/unresolvable company simply omits the company segment,
 * yielding `{job-title}-jobs-in-{primary-city}`. Returns "" when there is no
 * usable title, which callers must treat as "cannot generate a slug".
 */
export const buildJobSlugBase = ({ title, companyName, city } = {}) => {
  const titlePart = slugifyPart(title);
  if (!titlePart) return '';

  const cityPart = slugifyPart(resolvePrimaryCity(city)) || DEFAULT_CITY_PART;
  const companyPart = normalizeCompanyName(companyName);

  return [titlePart, JOBS_IN_INFIX, cityPart, companyPart].filter(Boolean).join('-');
};

/**
 * Resolves a base slug to a unique slug (Rule 8): returns `base` if free,
 * otherwise `base-2`, `base-3`, ... Never uses timestamps or ObjectIds.
 *
 * @param {string} baseSlug
 * @param {(candidate: string) => boolean | Promise<boolean>} isSlugTaken
 *        Returns true when `candidate` is already used by another record. The
 *        caller owns the "another record" definition so it can exclude the
 *        document being saved and/or consult an in-memory set during migration.
 * @param {{ maxAttempts?: number }} [options]
 */
export const buildUniqueJobSlug = async (baseSlug, isSlugTaken, options = {}) => {
  if (!baseSlug) return '';
  if (typeof isSlugTaken !== 'function') return baseSlug;

  const maxAttempts = options.maxAttempts ?? 1000;

  let candidate = baseSlug;
  let suffix = DUPLICATE_SUFFIX_START;
  let attempts = 0;

  while (await isSlugTaken(candidate)) {
    if (attempts >= maxAttempts) {
      throw new Error(
        `Unable to resolve a unique slug for "${baseSlug}" after ${maxAttempts} attempts`
      );
    }
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
    attempts += 1;
  }

  return candidate;
};

/**
 * Convenience wrapper: base slug + uniqueness in one call.
 */
export const buildCanonicalJobSlug = async ({ title, companyName, city }, isSlugTaken, options) => {
  const base = buildJobSlugBase({ title, companyName, city });
  if (!base) return '';
  return buildUniqueJobSlug(base, isSlugTaken, options);
};

/**
 * PUBLIC (candidate-facing) path for a saved job post: `/job/{slug}`.
 *
 * Mirrors the frontend's buildJobPath (utils/jobUrl.js) priority exactly, so a
 * link generated server-side — notification actionUrl, push payload — lands on
 * the same page the site itself links to:
 *   1. stored canonical slug -> /job/{slug}
 *   2. no slug, but an _id   -> /job/{_id}   (the route resolves either form)
 *   3. neither               -> /job-list    (never emits `/job/undefined`)
 *
 * Takes the SAVED document: the slug is written by the model's pre-save hook, so
 * calling this before save() would always fall through to the ObjectId branch.
 */
export const buildPublicJobPath = (job = {}) => {
  const slug = toPlainText(job?.slug).trim();
  if (slug) return `/job/${slug}`;

  const id = job?._id ? String(job._id).trim() : '';
  return id ? `/job/${id}` : '/job-list';
};

/**
 * Absolute public job URL, e.g. https://coimbatorejobs.in/job/{slug}.
 *
 * `baseUrl` is the site origin (FRONTEND_URL). Its trailing slash is stripped
 * because the configured value carries one, and `${base}/job/x` would otherwise
 * produce a double slash that does not resolve. Falls back to the relative path
 * when no base is configured — still a working in-app link.
 */
export const buildPublicJobUrl = (job = {}, baseUrl = '') => {
  const path = buildPublicJobPath(job);
  const base = toPlainText(baseUrl).trim().replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
};
