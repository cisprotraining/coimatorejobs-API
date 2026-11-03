/**
 * Remove records that must not outlive a company profile's job listings.
 * Keep this dependency-injected so the deletion order can be tested without a
 * live database. The caller deletes the CompanyProfile document last.
 */
export async function deleteCompanyProfileRelatedData({
  profileId,
  JobPost,
  Application,
  SavedJob,
  Notification,
  EmployerResumeDownloadLog,
  DemandCandidate,
  Homepage,
}) {
  const jobIds = await JobPost.distinct('_id', { companyProfile: profileId });
  const applicationIds = jobIds.length
    ? await Application.distinct('_id', { jobPost: { $in: jobIds } })
    : [];

  if (applicationIds.length) {
    await Notification.deleteMany({ application: { $in: applicationIds } });
  }

  if (jobIds.length) {
    await Promise.all([
      Application.deleteMany({ jobPost: { $in: jobIds } }),
      SavedJob.deleteMany({ jobPost: { $in: jobIds } }),
      Notification.deleteMany({ jobPost: { $in: jobIds } }),
      EmployerResumeDownloadLog.deleteMany({ jobPost: { $in: jobIds } }),
      Homepage.updateMany({}, { $pull: { featuredJobs: { $in: jobIds } } }),
    ]);
  }

  await Promise.all([
    DemandCandidate.deleteMany({ companyProfile: profileId }),
    Homepage.updateMany({}, { $pull: { featuredCompanies: profileId } }),
  ]);

  // Delete jobs only after all candidate-visible and related references are
  // gone. The controller then deletes the company profile as the final DB step.
  if (jobIds.length) {
    await JobPost.deleteMany({ _id: { $in: jobIds } });
  }

  return { deletedJobCount: jobIds.length, deletedApplicationCount: applicationIds.length };
}
