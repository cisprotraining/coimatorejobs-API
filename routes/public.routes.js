import { Router } from 'express';
import Homepage from '../models/homepage.model.js';
import JobPost from '../models/jobs.model.js';
import CompanyProfile from '../models/companyProfile.model.js';
import Industry from '../models/industry.model.js';
import { loadPublicHome } from '../utils/publicHome.js';
import mongoose from 'mongoose';
import { PUBLIC_COMPANY_PROFILE_SELECT, toPublicCompanyProfile } from '../utils/publicCompanyProfile.js';
import { publicJobApprovalFilter } from '../utils/publicJobApproval.js';
import feedbackController from '../controller/employerFeedback.controller.js';

const router = Router();
router.get('/testimonials', feedbackController.testimonials);
router.get('/companies/:id/jobs', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Company not found' });
    const company = await CompanyProfile.findOne({ _id: req.params.id, status: 'approved' }).select('companyName').lean();
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const filter = publicJobApprovalFilter({ companyProfile: company._id, status: 'Published', applicationDeadline: { $gte: new Date() } });
    const total = await JobPost.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);
    if (page > Math.max(1, totalPages)) return res.status(404).json({ success: false, message: 'Page not found' });
    const jobs = await JobPost.find(filter).select('slug title location status applicationDeadline jobType offeredSalary createdAt')
      .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean();
    res.json({ success: true, jobs, pagination: { page, limit, total, totalPages } });
  } catch (error) { next(error); }
});
router.get('/companies/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Company not found' });
    const company = await CompanyProfile.findOne({ _id: req.params.id, status: 'approved' })
      .select(PUBLIC_COMPANY_PROFILE_SELECT).populate('industry', 'name').populate('functionalAreas', 'name').lean();
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    const activeJobsCount = await JobPost.countDocuments(publicJobApprovalFilter({
      companyProfile: company._id, status: 'Published', applicationDeadline: { $gte: new Date() },
    }));
    return res.json({ success: true, profile: toPublicCompanyProfile(company), activeJobsCount });
  } catch (error) { next(error); }
});
router.get('/home', async (req, res, next) => {
  try {
    const data = await loadPublicHome({ Homepage, JobPost, CompanyProfile, Industry });
    // Public data only. Bound homepage freshness to 30 seconds; no user-specific
    // or signed-in responses are included in this cache.
    res.set('Cache-Control', 'public, max-age=0, s-maxage=30');
    res.json({ success: true, ...data });
  } catch (error) { next(error); }
});
export default router;
