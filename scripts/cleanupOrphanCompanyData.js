import connectToDatabase from '../database/mongodb.js';
import CompanyProfile from '../models/companyProfile.model.js';
import JobPost from '../models/jobs.model.js';
import Application from '../models/jobApply.model.js';
import SavedJob from '../models/savedJob.model.js';
import Notification from '../models/notification.model.js';
import EmployerResumeDownloadLog from '../models/employerResumeDownloadLog.model.js';
import DemandCandidate from '../models/demandCandidate.model.js';
import Homepage from '../models/homepage.model.js';

const APPLY = process.argv.includes('--apply');

const findOrphanIds = async (Model, referenceField, referencedCollection) => Model.aggregate([
  {
    $lookup: {
      from: referencedCollection,
      localField: referenceField,
      foreignField: '_id',
      as: '_matchedReference',
    },
  },
  { $match: { $or: [{ [referenceField]: { $exists: false } }, { [referenceField]: null }, { _matchedReference: { $eq: [] } }] } },
  { $project: { _id: 1 } },
]);

const main = async () => {
  await connectToDatabase();

  try {
    const orphanJobs = await findOrphanIds(JobPost, 'companyProfile', CompanyProfile.collection.name);
    const jobIds = orphanJobs.map(({ _id }) => _id);
    const orphanApplications = jobIds.length
      ? await Application.find({ jobPost: { $in: jobIds } }).select('_id').lean()
      : [];
    const applicationIds = orphanApplications.map(({ _id }) => _id);

    const orphanDemandCandidates = await findOrphanIds(
      DemandCandidate,
      'companyProfile',
      CompanyProfile.collection.name,
    );
    const demandCandidateIds = orphanDemandCandidates.map(({ _id }) => _id);

    const homepages = await Homepage.find({}).select('featuredJobs featuredCompanies').lean();
    const featuredJobIds = [...new Set(homepages.flatMap((homepage) =>
      (homepage.featuredJobs || []).map(String)
    ))].filter((id) => jobIds.some((jobId) => String(jobId) === id));
    const featuredCompanyIds = [...new Set(homepages.flatMap((homepage) =>
      (homepage.featuredCompanies || []).map(String)
    ))];
    const existingCompanyIds = featuredCompanyIds.length
      ? new Set((await CompanyProfile.distinct('_id', { _id: { $in: featuredCompanyIds } })).map(String))
      : new Set();
    const danglingFeaturedCompanyIds = featuredCompanyIds
      .filter((id) => !existingCompanyIds.has(id));

    const [savedJobCount, notificationCount, resumeLogCount] = jobIds.length
      ? await Promise.all([
        SavedJob.countDocuments({ jobPost: { $in: jobIds } }),
        Notification.countDocuments({
          $or: [
            { jobPost: { $in: jobIds } },
            ...(applicationIds.length ? [{ application: { $in: applicationIds } }] : []),
          ],
        }),
        EmployerResumeDownloadLog.countDocuments({ jobPost: { $in: jobIds } }),
      ])
      : [0, 0, 0];

    console.log(`Orphan cleanup mode: ${APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)'}`);
    console.log(JSON.stringify({
      orphanJobs: jobIds.length,
      applications: applicationIds.length,
      savedJobs: savedJobCount,
      notifications: notificationCount,
      employerResumeDownloadLogs: resumeLogCount,
      orphanDemandCandidateRequests: demandCandidateIds.length,
      homepageJobReferences: featuredJobIds.length,
      homepageCompanyReferences: danglingFeaturedCompanyIds.length,
      sampleOrphanJobs: orphanJobs.slice(0, 20).map(({ _id }) => String(_id)),
      sampleOrphanDemandRequests: demandCandidateIds.slice(0, 20).map(String),
    }, null, 2));

    if (!APPLY) {
      console.log('No data was changed. Review this report, then rerun with --apply to remove these orphan records.');
      return;
    }

    // Remove dependent documents before jobs; only jobs with a missing company
    // profile reference are included, so other profiles under the same employer
    // are unaffected.
    if (jobIds.length) {
      await Promise.all([
        Application.deleteMany({ jobPost: { $in: jobIds } }),
        SavedJob.deleteMany({ jobPost: { $in: jobIds } }),
        Notification.deleteMany({
          $or: [
            { jobPost: { $in: jobIds } },
            ...(applicationIds.length ? [{ application: { $in: applicationIds } }] : []),
          ],
        }),
        EmployerResumeDownloadLog.deleteMany({ jobPost: { $in: jobIds } }),
        Homepage.updateMany({}, { $pull: { featuredJobs: { $in: jobIds } } }),
      ]);
      await JobPost.deleteMany({ _id: { $in: jobIds } });
    }

    if (demandCandidateIds.length) {
      await DemandCandidate.deleteMany({ _id: { $in: demandCandidateIds } });
    }
    if (danglingFeaturedCompanyIds.length) {
      await Homepage.updateMany({}, {
        $pull: { featuredCompanies: { $in: danglingFeaturedCompanyIds } },
      });
    }

    console.log('Orphan company data cleanup completed.');
  } finally {
    await CompanyProfile.db.close();
  }
};

main().catch((error) => {
  console.error('Orphan company data cleanup failed:', error);
  process.exitCode = 1;
});
