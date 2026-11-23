const PUBLIC_COMPANY_FIELDS = [
  '_id',
  'companyName',
  'slug',
  'companyType',
  'website',
  'establishedSince',
  'teamSize',
  'industry',
  'functionalAreas',
  'description',
  'culture',
  'founders',
  'socialMedia',
  'location',
  'branches',
  'logo',
  'isVerified',
  'isHiring',
  'allowInSearch',
  'status',
  'openJobsCount',
  'activeJobsCount',
];

export const toPublicCompanyProfile = (profile) => {
  if (!profile || typeof profile !== 'object') return null;
  const source = typeof profile.toObject === 'function' ? profile.toObject() : profile;
  return Object.fromEntries(
    PUBLIC_COMPANY_FIELDS
      .filter((field) => source[field] !== undefined)
      .map((field) => [field, source[field]]),
  );
};

export const PUBLIC_COMPANY_PROFILE_SELECT = PUBLIC_COMPANY_FIELDS
  .filter((field) => !['_id', 'openJobsCount', 'activeJobsCount'].includes(field))
  .join(' ');
