// Public job search is intentionally unauthenticated. Keep its response
// limited to fields used by job cards, search filters and public SEO pages.
// In particular, never serialize employer/user IDs, contact details, approval
// actors, applicant/viewer data, or database-only normalization fields.
const TOP_LEVEL_FIELDS = [
  "_id",
  "jobId",
  "slug",
  "title",
  "companyName",
  "jobType",
  "offeredSalary",
  "salary",
  "careerLevel",
  "experience",
  "experienceMin",
  "experienceMax",
  "qualification",
  "gender",
  "collarCategory",
  "applicationDeadline",
  "remoteWork",
  "status",
  "createdAt",
  "updatedAt",
  "seoKeywords",
];

const toPlainObject = (value) => {
  if (!value || typeof value !== "object") return null;
  return typeof value.toObject === "function" ? value.toObject() : value;
};

const pick = (value, keys) => {
  const source = toPlainObject(value);
  if (!source) return undefined;
  return Object.fromEntries(
    keys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
};

const pickReference = (value, keys) => {
  if (Array.isArray(value)) {
    return value.map((item) => pick(item, keys)).filter(Boolean);
  }
  return pick(value, keys);
};

export const toPublicJob = (job) => {
  const source = toPlainObject(job);
  if (!source) return null;

  const result = Object.fromEntries(
    TOP_LEVEL_FIELDS
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );

  for (const key of ["industry", "role"]) {
    const reference = pick(source[key], ["_id", "name", "slug", "defaultCollarCategory"]);
    if (reference) result[key] = reference;
  }

  for (const key of ["skills", "functionalAreas"]) {
    const references = pickReference(source[key], ["_id", "name", "slug", "keywords"]);
    if (references !== undefined) result[key] = references;
  }

  const companyProfile = pick(source.companyProfile, ["_id", "companyName", "logo", "slug"]);
  if (companyProfile) result.companyProfile = companyProfile;

  const location = pick(source.location, ["city", "country"]);
  if (location) result.location = location;

  const positions = pick(source.positions, ["total", "remaining"]);
  if (positions) result.positions = positions;

  const salary = pick(source.salary, ["min", "max", "currency", "unit"]);
  if (salary) result.salary = salary;

  return result;
};
