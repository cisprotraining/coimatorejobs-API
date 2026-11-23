import { publicJobApprovalFilter } from './publicJobApproval.js';
import { toPublicJob } from './publicJobSerializer.js';

const JOB_FIELDS = 'title slug jobType offeredSalary salary experience location applicationDeadline status createdAt companyProfile industry collarCategory';
const jobCards = (query) => query
  .select(JOB_FIELDS)
  .populate({ path: 'companyProfile', select: 'companyName logo slug', skipInvalidIds: true })
  .populate({ path: 'industry', select: 'name slug', skipInvalidIds: true })
  .sort({ createdAt: -1, _id: -1 }).limit(12).lean();

// One bounded card feed and one aggregation replace the browser's paginated
// inventory download and one job-count request per featured company.
export async function loadPublicHome({ Homepage, JobPost, CompanyProfile, Industry }, now = new Date()) {
  const home = await Homepage.findOne().select('featuredJobs featuredCompanies').lean();
  const companyIds = (home?.featuredCompanies || []).slice(0, 6);
  const featuredIds = (home?.featuredJobs || []).slice(0, 12);
  const live = publicJobApprovalFilter({ status: 'Published', applicationDeadline: { $gte: now } });
  const [selectedJobs, companies, industries, summaries] = await Promise.all([
    jobCards(JobPost.find(featuredIds.length ? { ...live, _id: { $in: featuredIds } } : live)),
    CompanyProfile.find({ _id: { $in: companyIds }, status: 'approved' })
      .select('companyName logo slug description').lean(),
    Industry.find({ isActive: true }).select('name slug').sort({ name: 1 }).lean(),
    JobPost.aggregate([
      { $match: live },
      { $facet: {
        locations: [
          { $unwind: '$location.city' },
          { $match: { 'location.city': { $type: 'string', $ne: '' } } },
          { $group: { _id: '$location.city' } },
          { $sort: { _id: 1 } },
        ],
        counts: [
          { $match: { companyProfile: { $in: companyIds } } },
          { $group: { _id: '$companyProfile', count: { $sum: 1 } } },
        ],
      } },
    ]),
  ]);
  const counts = new Map((summaries[0]?.counts || []).map(c => [String(c._id), c.count]));
  const byId = new Map(companies.map(c => [String(c._id), c]));
  const jobs = selectedJobs.length || !featuredIds.length ? selectedJobs : await jobCards(JobPost.find(live));
  return {
    jobs: jobs.map(toPublicJob),
    companies: companyIds.map(id => byId.get(String(id))).filter(Boolean).map(c => ({
      _id: c._id, companyName: c.companyName, logo: c.logo, slug: c.slug,
      description: c.description, openJobCount: counts.get(String(c._id)) || 0,
    })),
    industries: industries.map(i => ({ name: i.name, slug: i.slug })),
    locations: [...new Set((summaries[0]?.locations || []).map(c => c._id.trim()).filter(Boolean))],
  };
}
