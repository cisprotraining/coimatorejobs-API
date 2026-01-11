// utils/roleHelper.js

// Roles that can act like "employer" (post jobs, manage applicants)
export const EMPLOYER_LIKE_ROLES = ['employer', 'hr-admin', 'superadmin'];

// Roles that can manage users/system
export const PLATFORM_ADMIN_ROLES = ['superadmin'];

export const isEmployerLike = (role) => EMPLOYER_LIKE_ROLES.includes(role);
export const isPlatformAdmin = (role) => PLATFORM_ADMIN_ROLES.includes(role);


/**
 * Checks whether a user can manage a given job post
 * (view applicants, shortlist, approve, reject, delete, etc.)
 *
 * Permission Rules:
 * ------------------------------------------------
 * superadmin → can manage all jobs
 * employer   → can manage jobs they own
 * hr-admin   → can manage jobs of assigned employers
 *
 * @param {Object} jobPost - JobPost document
 * @param {Object} user - Logged-in user
 * @returns {Boolean}
 */
export const canManageJob = (jobPost, user) => {

  if (!jobPost || !user) return false;

  if (user.role === 'superadmin') return true;

  if (user.role === 'employer' && jobPost.employer?.toString() === user.id.toString()) {
    return true;
  }
  // console.log("tetttt", user.id);

   // HR-Admin → manages jobs for assigned employer
  if (user.role === 'hr-admin' && user.employerIds?.some(eid => eid.toString() === jobPost.employer.toString())) {
    return true;
}

  return false;
};


/**
 * Builds MongoDB query to fetch job posts
 * user is allowed to manage.
 *
 * Mirrors canManageJob() logic at query level.
 *
 * @param {Object} user - Logged-in user
 * @returns {Object} MongoDB query
 */
export const buildJobQueryForUser = (user) => {
  if (!user) return { _id: null };

  // SUPERADMIN → all jobs
  if (user.role === 'superadmin' || user.role === 'hr-admin') {
    return {}; // All jobs
  }

  // EMPLOYER → own jobs
  if (user.role === 'employer') {
    return { employer: user.id };
  }

  // HR-ADMIN → jobs of assigned employers
//   if (user.role === 'hr-admin') {
//     return {
//       $or: [
//         { employer: { $in: user.employerIds } }, // assigned employers
//         { postedBy: user.id }                    // jobs HR created
//       ]
//     };
//   }

//   if (user.role === 'hr-admin') {
//     if (user.scope === 'restricted') {
//         return { employer: { $in: user.employerIds } };
//     }
//     return {}; // full access HR
// }


  return { _id: null };
};
