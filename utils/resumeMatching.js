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
 * Match candidate profile/resume to a Resume Alert using a Weighted Scoring System.
 * Returns { matched: Boolean, matchScore: Number }
 */
export function matchResumeToAlert(doc, criteria) {
  const isResume = doc.personalInfo !== undefined;
  const profile = isResume ? doc.personalInfo : doc;

  // Extract Profile Data safely
  const profileSkills = doc.skills || []; 
  const profileIndustry = doc.industry; 
  const profileRole = doc.role;
  const profileFunctionalAreas = doc.functionalAreas || [];
  
  const experience = isResume ? calculateTotalExperience(doc.experience) : doc.experience;
  const educationLevels = isResume ? (doc.education || []).map((edu) => edu.degree) : doc.educationLevels || [];
  const location = profile.location || {};
  const expectedSalary = profile.expectedSalary || '';
  const remoteReady = profile.preferences?.remoteReady || false;
  const age = profile.age || 0;
  const gender = profile.socialMedia?.gender || profile.gender || 'No Preference';

  // --- WEIGHTED SCORING SYSTEM ---
  const WEIGHTS = {
    SKILLS: 30,
    LOCATION: 25,
    SALARY: 15,
    EXPERIENCE: 10,
    KEYWORDS: 10,
    EDUCATION: 5,
    TAXONOMY: 5 // Industry, FA, Role combined (Low priority as candidates often skip them)
  };

  let maxPossibleScore = 0;
  let earnedScore = 0;

  // 1. HIGH PRIORITY: SKILLS (30 Points)
  if (criteria.skills?.length > 0) {
    maxPossibleScore += WEIGHTS.SKILLS;
    
    // Calculate how many of the required skills the candidate actually has
    let matchedSkillsCount = 0;
    criteria.skills.forEach(reqSkill => {
      const hasSkill = profileSkills.some(pSkill => 
        pSkill.toString() === reqSkill.toString() || pSkill._id?.toString() === reqSkill.toString()
      );
      if (hasSkill) matchedSkillsCount++;
    });

    // Partial points awarded based on percentage of skills matched
    earnedScore += (matchedSkillsCount / criteria.skills.length) * WEIGHTS.SKILLS;
  }

  // 2. HIGH PRIORITY: LOCATION (25 Points)
  if (criteria.location?.city && criteria.location.city.length > 0) {
    maxPossibleScore += WEIGHTS.LOCATION;
    const profileCity = (location.city || '').toLowerCase();
    
    // If the candidate's single city matches any of the cities in the alert array
    if (criteria.location.city.some(c => c.toLowerCase() === profileCity)) {
        earnedScore += WEIGHTS.LOCATION;
    }
  }

  // 3. SALARY (Parsing "5 Lakhs" into 500000)
  if (criteria.salaryRange?.min || criteria.salaryRange?.max) {
    maxPossibleScore += WEIGHTS.SALARY;
    
    let parsedSalary = 0;
    if (expectedSalary) {
        const salaryParts = expectedSalary.trim().split(' ');
        if (salaryParts.length >= 2) {
            const val = parseFloat(salaryParts[0]);
            if (salaryParts[1].includes('Lakhs')) parsedSalary = val * 100000;
            if (salaryParts[1].includes('Thousands')) parsedSalary = val * 1000;
        } else if (!isNaN(parseFloat(expectedSalary))) {
            parsedSalary = parseFloat(expectedSalary);
        }
    }
    
    const minMatch = !criteria.salaryRange.min || parsedSalary >= criteria.salaryRange.min;
    const maxMatch = !criteria.salaryRange.max || parsedSalary <= criteria.salaryRange.max;
    
    if (!parsedSalary) {
        earnedScore += (WEIGHTS.SALARY / 2); // Partial credit if candidate left salary blank
    } else if (minMatch && maxMatch) {
        earnedScore += WEIGHTS.SALARY;
    }
  }

  // 4. HIGH PRIORITY: EXPERIENCE (10 Points)
  if (criteria.experience) {
    maxPossibleScore += WEIGHTS.EXPERIENCE;
    if (criteria.experience.toLowerCase() === (experience || '').toLowerCase()) {
        earnedScore += WEIGHTS.EXPERIENCE;
    }
  }

  // 5. MEDIUM PRIORITY: KEYWORDS (10 Points)
  if (criteria.keywords?.length > 0) {
    maxPossibleScore += WEIGHTS.KEYWORDS;
    const textToSearch = `${profile.jobTitle || ''} ${profile.description || ''} ${profileSkills.map(s => s.name || '').join(' ')}`.toLowerCase();
    
    let matchedKeywordsCount = 0;
    criteria.keywords.forEach(kw => {
        if (textToSearch.includes(kw.toLowerCase())) matchedKeywordsCount++;
    });

    earnedScore += (matchedKeywordsCount / criteria.keywords.length) * WEIGHTS.KEYWORDS;
  }

  // 6. MEDIUM PRIORITY: EDUCATION (5 Points)
  if (criteria.educationLevels?.length > 0) {
    maxPossibleScore += WEIGHTS.EDUCATION;
    const hasMatch = criteria.educationLevels.some((edu) => educationLevels.includes(edu));
    if (hasMatch) earnedScore += WEIGHTS.EDUCATION;
  }

  // 7. LOW PRIORITY: TAXONOMY (Industry/FA/Role - 5 Points Total)
  // We bundle these because candidates often skip them. If they match, it's a bonus.
  let taxonomyActive = false;
  let taxonomyScore = 0;

  if (criteria.industry) {
      taxonomyActive = true;
      if (profileIndustry && criteria.industry.toString() === profileIndustry.toString()) taxonomyScore++;
  }
  if (criteria.functionalAreas?.length > 0) {
      taxonomyActive = true;
      if (criteria.functionalAreas.some(fa => profileFunctionalAreas.some(pfa => pfa.toString() === fa.toString()))) taxonomyScore++;
  }
  if (criteria.role) {
      taxonomyActive = true;
      if (profileRole && criteria.role.toString() === profileRole.toString()) taxonomyScore++;
  }

  if (taxonomyActive) {
      maxPossibleScore += WEIGHTS.TAXONOMY;
      // 3 possible taxonomy fields. Divide points based on how many matched.
      earnedScore += (taxonomyScore / 3) * WEIGHTS.TAXONOMY;
  }

  // Calculate Final Percentage
  const finalPercentage = maxPossibleScore === 0 ? 0 : (earnedScore / maxPossibleScore) * 100;

  console.log(`[ResumeMatch] ${profile.fullName || profile.jobTitle}: Scored ${earnedScore.toFixed(1)} / ${maxPossibleScore} (${finalPercentage.toFixed(1)}%)`);

  // Setting the threshold to 50% ensures that if a candidate perfectly matches Skills and Location, 
  // they will pass even if they failed the strict taxonomy or didn't provide a salary.
  return { matched: finalPercentage >= 50, matchScore: finalPercentage };
}

// old matching logic  is commented out (2026-03-07)
// export function matchResumeToAlert(doc, criteria) {
//   const isResume = doc.personalInfo !== undefined;
//   const profile = isResume ? doc.personalInfo : doc;

//   const skills = doc.skills || [];
//   const categories = doc.categories || [];
//   const experience = isResume
//     ? calculateTotalExperience(doc.experience)
//     : doc.experience;
//   const educationLevels = isResume
//     ? (doc.education || []).map((edu) => edu.degree)
//     : doc.educationLevels || [];
//   const location = profile.location || {};
//   const expectedSalary = profile.expectedSalary || '';
//   const remoteReady = profile.preferences?.remoteReady || false;
//   const age = profile.age || 0;
//   const gender = profile.socialMedia?.gender || 'No Preference';

//   let totalCriteria = 0;
//   let matchedCriteria = 0;

//   // ✅ Categories
//   if (criteria.categories?.length) {
//     totalCriteria++;
//     if (criteria.categories.some((cat) => categories.includes(cat)))
//       matchedCriteria++;
//   }

//   // ✅ Location
//   if (criteria.location?.city) {
//     totalCriteria++;
//     if (
//       criteria.location.city.toLowerCase() ===
//       (location.city || '').toLowerCase()
//     )
//       matchedCriteria++;
//   }

//   // ✅ Experience
//   if (criteria.experience) {
//     totalCriteria++;
//     if (criteria.experience.toLowerCase() === experience.toLowerCase())
//       matchedCriteria++;
//   }

//   // ✅ Skills
//   if (criteria.skills?.length) {
//     totalCriteria++;
//     if (criteria.skills.some((skill) => skills.includes(skill)))
//       matchedCriteria++;
//   }

//   // ✅ Education
//   if (criteria.educationLevels?.length) {
//     totalCriteria++;
//     if (
//       criteria.educationLevels.some((edu) => educationLevels.includes(edu))
//     )
//       matchedCriteria++;
//   }

//   // ✅ Salary Range
//   if (criteria.salaryRange?.min || criteria.salaryRange?.max) {
//     totalCriteria++;
//     const salary = expectedSalary;
//     const salaryRanges = [
//       '< ₹5 LPA',
//       '₹5-10 LPA',
//       '₹10-15 LPA',
//       '₹15-20 LPA',
//       '₹20-30 LPA',
//       '₹30+ LPA',
//     ];
//     const [min, max] =
//       salaryRanges
//         .find((r) => r === salary)
//         ?.match(/[\d.]+/g)
//         ?.map(Number) || [0, Infinity];
//     const minMatch =
//       !criteria.salaryRange.min || min * 100000 >= criteria.salaryRange.min;
//     const maxMatch =
//       !criteria.salaryRange.max || max * 100000 <= criteria.salaryRange.max;
//     if (minMatch && maxMatch) matchedCriteria++;
//   }

//   // ✅ Gender & Age
//   if (
//     criteria.diversity?.gender &&
//     criteria.diversity.gender !== 'No Preference'
//   ) {
//     totalCriteria++;
//     if (criteria.diversity.gender === gender) matchedCriteria++;
//   }

//   if (criteria.diversity?.ageRange) {
//     totalCriteria++;
//     const withinRange =
//       age >= criteria.diversity.ageRange.min &&
//       age <= criteria.diversity.ageRange.max;
//     if (withinRange) matchedCriteria++;
//   }

//   // ✅ Remote Work Preference
//   if (criteria.remoteWork) {
//     totalCriteria++;
//     if (
//       criteria.remoteWork === 'Any' ||
//       (criteria.remoteWork === 'Remote Only' && remoteReady)
//     )
//       matchedCriteria++;
//   }

//   // ✅ Keywords
//   if (criteria.keywords?.length) {
//     totalCriteria++;
//     const text = `${profile.jobTitle || ''} ${profile.description || ''} ${(skills || []).join(' ')} ${(categories || []).join(' ')}`.toLowerCase();
//     if (criteria.keywords.some((kw) => text.includes(kw.toLowerCase())))
//       matchedCriteria++;
//   }

//   const matchScore = totalCriteria
//     ? (matchedCriteria / totalCriteria) * 100
//     : 0;

//   console.log(
//     `[ResumeMatch] ${profile.fullName || profile.jobTitle}: ${matchedCriteria}/${totalCriteria} matched (${matchScore.toFixed(
//       1
//     )}%)`
//   );

//   return { matched: matchScore >= 60, matchScore };
// }