// Minimal shape used by the public job-search filter and SEO landing pages.
// Keep role administration fields out of this lightweight response.
export const toPublicRoleOptions = (roles = []) => {
  const seenNames = new Set();
  const options = [];

  for (const role of roles) {
    const name = String(role?.name || '').trim();
    const slug = String(role?.slug || '').trim();
    const key = name.toLowerCase();
    if (!name || !slug || seenNames.has(key)) continue;
    seenNames.add(key);
    options.push({ name, slug });
  }

  return options;
};
