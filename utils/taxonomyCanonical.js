// utils/taxonomyCanonical.js
// ---------------------------------------------------------------------------
// Canonical taxonomy groups for industries and roles.
//
// The master collections contain equivalent records created over time by
// different employers ("IT", "IT / Software", "IT Services and IT
// Consulting." ...; "Telecaller", "Tele caller", "Telecalling" ...). Jobs keep
// referencing whichever record they were posted with — NOTHING here rewrites
// or deletes data. Instead every member of a group resolves to the whole group:
//
//   * the query engine expands ?industry= / ?role= to the ids of every member
//     (utils/jobTaxonomyResolver.js), so the canonical page lists all of them;
//   * the SEO layer names the group by its canonical record, whose slug is the
//     one indexable URL (/jobs/industry/it-software, /jobs/role/telecalling-executive);
//     member URLs redirect there.
//
// Only genuinely equivalent records are grouped. Near neighbours with a
// different meaning (e.g. "IT/Education", "Gaming / Technology") stay separate.
//
// Pure, no imports. MIRRORED in the frontend at
// cisprotraining/utils/taxonomyCanonical.js — the SEO test suite asserts the
// two stay identical.
// ---------------------------------------------------------------------------

export const INDUSTRY_CANONICAL_GROUPS = [
  {
    canonical: 'IT / Software',
    members: [
      'IT',
      'IT Services and IT Consulting.',
      'IT Services & Information Technology',
      'IT/ IT Services',
      'IT/ Software & Technology',
      'IT/ Technology Services',
      'IT/Technology',
      'Information Technology (IT) & Services',
      'Technology, Information &  Internet',
      // IT-enabled services / BPO variants. "IT & ITES/ BPO" and
      // "IT/ ITES & BPO" also produced the SAME landing URL (it-ites-bpo).
      'IT & ITES/ BPO',
      'IT/ ITES & BPO',
      'IT/ ITES',
      'IT Services/ IT-Enabled Services',
      'Information Technology (IT) & Services / ITES',
    ],
  },
  { canonical: 'Logistics / Transportation', members: ['Logistic & Transportation'] },
  { canonical: 'Architecture & Design', members: ['Architecture & Design Services'] },
  { canonical: 'Manufacturing', members: ['Manufacturing and supplier', 'Manufacturer & Supplier'] },
];

export const ROLE_CANONICAL_GROUPS = [
  { canonical: 'Telecalling Executive', members: ['Telecaller', 'Tele caller', 'Telecalling'] },
  { canonical: 'Videographer', members: ['Video Grapher'] },
];

/** Lowercase alphanumerics only — "IT / Software" and "it-software" share a key. */
export const taxonomyKey = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const buildIndex = (groups) => {
  const index = new Map();
  groups.forEach((group) => {
    const names = [group.canonical, ...group.members];
    names.forEach((name) => index.set(taxonomyKey(name), { canonical: group.canonical, names }));
  });
  return index;
};

const INDUSTRY_INDEX = buildIndex(INDUSTRY_CANONICAL_GROUPS);
const ROLE_INDEX = buildIndex(ROLE_CANONICAL_GROUPS);

const lookup = (index, value) => index.get(taxonomyKey(value)) || null;

/** Canonical display name for an industry (the input when it is not grouped). */
export const canonicalIndustryName = (name) => lookup(INDUSTRY_INDEX, name)?.canonical || name;
export const canonicalRoleName = (name) => lookup(ROLE_INDEX, name)?.canonical || name;

/** Every name in the value's group (canonical first), or null when ungrouped. */
export const industryGroupNames = (value) => lookup(INDUSTRY_INDEX, value)?.names || null;
export const roleGroupNames = (value) => lookup(ROLE_INDEX, value)?.names || null;
