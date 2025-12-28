// commented is all fields required for matching resumes to alerts
// export function matchResumeToAlert(doc, criteria) {
//   // Handle both CandidateProfile and CandidateResume
//   const isResume = doc.personalInfo !== undefined;
//   const profile = isResume ? doc.personalInfo : doc;
//   const skills = isResume ? doc.skills : doc.skills;
//   const categories = isResume ? doc.skills : doc.categories; // Assuming resume.skills maps to categories for matching
//   const experience = isResume ? calculateTotalExperience(doc.experience) : doc.experience;
//   const educationLevels = isResume ? doc.education.map((edu) => edu.degree) : doc.educationLevels;

//   if (criteria.categories?.length > 0 && !criteria.categories.some((cat) => categories?.includes(cat))) {
//     return false;
//   }
//   if (criteria.location?.city && criteria.location.city !== profile.location?.city) {
//     return false;
//   }
//   if (criteria.experience && criteria.experience !== experience) {
//     return false;
//   }
//   if (criteria.skills?.length > 0 && !criteria.skills.some((skill) => skills?.includes(skill))) {
//     return false;
//   }
//   if (criteria.educationLevels?.length > 0 && !criteria.educationLevels.some((edu) => educationLevels?.includes(edu))) {
//     return false;
//   }
//   if (criteria.salaryRange?.min || criteria.salaryRange?.max) {
//     const salary = isResume ? profile.expectedSalary : doc.expectedSalary;
//     const salaryRanges = ['< ₹5 LPA', '₹5-10 LPA', '₹10-15 LPA', '₹15-20 LPA', '₹20-30 LPA', '₹30+ LPA'];
//     const [min, max] = salaryRanges
//       .find((range) => range === salary)
//       ?.match(/[\d.]+/g)
//       ?.map(Number) || [0, Infinity];
//     if (criteria.salaryRange.min && min < criteria.salaryRange.min / 100000) return false;
//     if (criteria.salaryRange.max && max && max > criteria.salaryRange.max / 100000) return false;
//   }
//   if (criteria.diversity?.gender && criteria.diversity.gender !== 'No Preference' && criteria.diversity.gender !== profile.socialMedia?.gender) {
//     return false;
//   }
//   if (criteria.diversity?.ageRange?.min && profile.age < criteria.diversity.ageRange.min) {
//     return false;
//   }
//   if (criteria.diversity?.ageRange?.max && profile.age > criteria.diversity.ageRange.max) {
//     return false;
//   }
//   if (criteria.remoteWork && !profile.preferences?.remoteWork) {
//     return false;
//   }
//   if (criteria.keywords?.length > 0) {
//     const text = `${profile.jobTitle || profile.professionalTitle} ${profile.description || profile.summary} ${skills?.join(' ')} ${categories?.join(' ')}`.toLowerCase();
//     if (!criteria.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
//       return false;
//     }
//   }
//   return true;
// }


// Helper function to calculate total experience for CandidateResume
// function calculateTotalExperience(experiences) {
//   if (!experiences || experiences.length === 0) return 'Less than 1 year';
//   const totalYears = experiences.reduce((total, exp) => {
//     const start = new Date(exp.startDate);
//     const end = exp.current ? new Date() : new Date(exp.endDate);
//     const years = (end - start) / (1000 * 60 * 60 * 24 * 365.25);
//     return total + years;
//   }, 0);
//   if (totalYears < 1) return 'Less than 1 year';
//   if (totalYears <= 3) return '1-3 years';
//   if (totalYears <= 5) return '3-5 years';
//   if (totalYears <= 10) return '5-10 years';
//   return '10+ years';
// }



/**
 * Calculate total experience (returns human-readable range)
 */
export function calculateTotalExperience(experiences) {
  if (!experiences || experiences.length === 0) return 'Less than 1 year';
  const totalYears = experiences.reduce((total, exp) => {
    const start = new Date(exp.startDate);
    const end = exp.current ? new Date() : new Date(exp.endDate);
    const years = (end - start) / (1000 * 60 * 60 * 24 * 365.25);
    return total + years;
  }, 0);
  if (totalYears < 1) return 'Less than 1 year';
  if (totalYears <= 3) return '1-3 years';
  if (totalYears <= 5) return '3-5 years';
  if (totalYears <= 10) return '5-10 years';
  return '10+ years';
}

/**
 * Match candidate profile/resume to a Resume Alert.
 * Returns { matched: Boolean, matchScore: Number }
 */
export function matchResumeToAlert(doc, criteria) {
  const isResume = doc.personalInfo !== undefined;
  const profile = isResume ? doc.personalInfo : doc;

  const skills = doc.skills || [];
  const categories = doc.categories || [];
  const experience = isResume
    ? calculateTotalExperience(doc.experience)
    : doc.experience;
  const educationLevels = isResume
    ? (doc.education || []).map((edu) => edu.degree)
    : doc.educationLevels || [];
  const location = profile.location || {};
  const expectedSalary = profile.expectedSalary || '';
  const remoteReady = profile.preferences?.remoteReady || false;
  const age = profile.age || 0;
  const gender = profile.socialMedia?.gender || 'No Preference';

  let totalCriteria = 0;
  let matchedCriteria = 0;

  // ✅ Categories
  if (criteria.categories?.length) {
    totalCriteria++;
    if (criteria.categories.some((cat) => categories.includes(cat)))
      matchedCriteria++;
  }

  // ✅ Location
  if (criteria.location?.city) {
    totalCriteria++;
    if (
      criteria.location.city.toLowerCase() ===
      (location.city || '').toLowerCase()
    )
      matchedCriteria++;
  }

  // ✅ Experience
  if (criteria.experience) {
    totalCriteria++;
    if (criteria.experience.toLowerCase() === experience.toLowerCase())
      matchedCriteria++;
  }

  // ✅ Skills
  if (criteria.skills?.length) {
    totalCriteria++;
    if (criteria.skills.some((skill) => skills.includes(skill)))
      matchedCriteria++;
  }

  // ✅ Education
  if (criteria.educationLevels?.length) {
    totalCriteria++;
    if (
      criteria.educationLevels.some((edu) => educationLevels.includes(edu))
    )
      matchedCriteria++;
  }

  // ✅ Salary Range
  if (criteria.salaryRange?.min || criteria.salaryRange?.max) {
    totalCriteria++;
    const salary = expectedSalary;
    const salaryRanges = [
      '< ₹5 LPA',
      '₹5-10 LPA',
      '₹10-15 LPA',
      '₹15-20 LPA',
      '₹20-30 LPA',
      '₹30+ LPA',
    ];
    const [min, max] =
      salaryRanges
        .find((r) => r === salary)
        ?.match(/[\d.]+/g)
        ?.map(Number) || [0, Infinity];
    const minMatch =
      !criteria.salaryRange.min || min * 100000 >= criteria.salaryRange.min;
    const maxMatch =
      !criteria.salaryRange.max || max * 100000 <= criteria.salaryRange.max;
    if (minMatch && maxMatch) matchedCriteria++;
  }

  // ✅ Gender & Age
  if (
    criteria.diversity?.gender &&
    criteria.diversity.gender !== 'No Preference'
  ) {
    totalCriteria++;
    if (criteria.diversity.gender === gender) matchedCriteria++;
  }

  if (criteria.diversity?.ageRange) {
    totalCriteria++;
    const withinRange =
      age >= criteria.diversity.ageRange.min &&
      age <= criteria.diversity.ageRange.max;
    if (withinRange) matchedCriteria++;
  }

  // ✅ Remote Work Preference
  if (criteria.remoteWork) {
    totalCriteria++;
    if (
      criteria.remoteWork === 'Any' ||
      (criteria.remoteWork === 'Remote Only' && remoteReady)
    )
      matchedCriteria++;
  }

  // ✅ Keywords
  if (criteria.keywords?.length) {
    totalCriteria++;
    const text = `${profile.jobTitle || ''} ${profile.description || ''} ${(skills || []).join(' ')} ${(categories || []).join(' ')}`.toLowerCase();
    if (criteria.keywords.some((kw) => text.includes(kw.toLowerCase())))
      matchedCriteria++;
  }

  const matchScore = totalCriteria
    ? (matchedCriteria / totalCriteria) * 100
    : 0;

  console.log(
    `[ResumeMatch] ${profile.fullName || profile.jobTitle}: ${matchedCriteria}/${totalCriteria} matched (${matchScore.toFixed(
      1
    )}%)`
  );

  return { matched: matchScore >= 60, matchScore };
}