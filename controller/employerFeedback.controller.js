import mongoose from 'mongoose';
import EmployerFeedback from '../models/employerFeedback.model.js';
import CompanyProfile from '../models/companyProfile.model.js';
import User from '../models/user.model.js';
import { getEffectiveEmployerId } from '../utils/roleHelper.js';

export function feedbackInput(body = {}) {
  const rating = body.rating;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const designation = typeof body.designation === 'string' ? body.designation.trim() : '';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw Object.assign(new Error('Choose a rating from 1 to 5 stars.'), { statusCode: 400 });
  if (message.length < 30 || (typeof body.message === 'string' && body.message.length > 200)) throw Object.assign(new Error('Your feedback must contain 30 to 200 characters, including spaces.'), { statusCode: 400 });
  if (designation.length > 80) throw Object.assign(new Error('Designation must contain no more than 80 characters.'), { statusCode: 400 });
  if (body.publishConsent !== true) throw Object.assign(new Error('Please confirm permission to display your feedback.'), { statusCode: 400 });
  if (!mongoose.isValidObjectId(body.companyProfile)) throw Object.assign(new Error('Choose your company profile.'), { statusCode: 400 });
  return { rating, message, designation, publishConsent: true, companyProfile: body.companyProfile };
}

const ownFeedback = row => row && !row.deletedAt ? {
  _id: row._id, rating: row.rating, message: row.message, designation: row.designation,
  companyName: row.companyName, authorName: row.authorName, createdAt: row.createdAt,
  companyProfile: row.companyProfile,
  isVisible: row.isVisible, publishConsent: row.publishConsent,
} : null;

export function createFeedbackController({ Feedback = EmployerFeedback, Company = CompanyProfile, Users = User } = {}) {
  return {
    async mine(req, res, next) {
      try {
        const employer = getEffectiveEmployerId(req.user);
        const [existing, companies] = await Promise.all([
          Feedback.findOne({ employer }).lean(),
          Company.find({ employer, isActive: { $ne: false } }).select('companyName logo').sort({ createdAt: 1 }).lean(),
        ]);
        res.set('Cache-Control', 'private, no-store');
        const active = Boolean(existing && !existing.deletedAt);
        res.json({ success: true, hasSubmitted: active, hasEverSubmitted: Boolean(existing), feedback: ownFeedback(existing),
          companies: companies.map(c => ({ _id: c._id, companyName: c.companyName, logo: c.logo })),
          canSubmit: companies.length > 0 && !active });
      } catch (error) { next(error); }
    },
    async submit(req, res, next) {
      try {
        const input = feedbackInput(req.body);
        const employer = getEffectiveEmployerId(req.user);
        const company = await Company.findOne({ _id: input.companyProfile, employer, isActive: { $ne: false } }).select('companyName').lean();
        if (!company) return res.status(403).json({ success: false, message: 'Create your own company profile before submitting feedback.' });
        if (await Feedback.exists({ employer, deletedAt: null })) return res.status(409).json({ success: false, message: 'Your company has already submitted website feedback.' });
        // Never accept employer, visibility, author or moderation fields from the browser.
        const submission = { ...input, employer, submittedBy: req.user.id,
          companyName: company.companyName, authorName: req.user.name || 'Employer', isVisible: true,
          deletedAt: null, deletedByEmployer: false, moderatedBy: null };
        // Reuse the unique owner record after either kind of deletion. The condition
        // ensures concurrent requests cannot replace a new active submission.
        const restored = await Feedback.findOneAndUpdate({ employer, deletedAt: { $ne: null } },
          { $set: submission }, { new: true, runValidators: true });
        const row = restored || await Feedback.create(submission);
        res.status(201).json({ success: true, hasSubmitted: true, feedback: ownFeedback(row), message: 'Thank you for sharing your feedback.' });
      } catch (error) {
        if (error.code === 11000) return res.status(409).json({ success: false, message: 'Your company has already submitted website feedback.' });
        next(error);
      }
    },
    async updateMine(req, res, next) {
      try {
        const input = feedbackInput(req.body);
        const employer = getEffectiveEmployerId(req.user);
        const company = await Company.findOne({ _id: input.companyProfile, employer, isActive: { $ne: false } }).select('companyName').lean();
        if (!company) return res.status(403).json({ success: false, message: 'Choose your own active company profile.' });
        // Preserve admin moderation when the employer edits their feedback.
        const row = await Feedback.findOneAndUpdate({ employer, deletedAt: null },
          { $set: { ...input, companyName: company.companyName } }, { new: true, runValidators: true });
        if (!row) return res.status(404).json({ success: false, message: 'Feedback not found or already removed.' });
        res.set('Cache-Control', 'private, no-store');
        res.json({ success: true, feedback: ownFeedback(row), message: 'Your feedback has been updated.' });
      } catch (error) { next(error); }
    },
    async removeMine(req, res, next) {
      try {
        const employer = getEffectiveEmployerId(req.user);
        const row = await Feedback.findOneAndUpdate({ employer, deletedAt: null },
          { $set: { deletedAt: new Date(), deletedByEmployer: true, isVisible: false } });
        if (!row) return res.status(404).json({ success: false, message: 'Feedback not found or already removed.' });
        res.set('Cache-Control', 'private, no-store');
        res.json({ success: true, message: 'Your feedback has been removed.' });
      } catch (error) { next(error); }
    },
    async list(req, res, next) {
      try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = 20;
        const filter = { deletedAt: null };
        if (/^[1-5]$/.test(String(req.query.rating || ''))) filter.rating = Number(req.query.rating);
        const eligibility = { rating: { $in: [4, 5] }, publishConsent: true };
        if (req.query.status === 'enabled' || req.query.status === 'hidden') {
          filter.$and = [eligibility, { isVisible: req.query.status === 'enabled' }];
        } else if (req.query.status === 'private') {
          filter.$and = [{ $or: [{ rating: { $in: [1, 2, 3] } }, { publishConsent: { $ne: true } }] }];
        }
        const sorts = {
          newest: { createdAt: -1, _id: -1 }, oldest: { createdAt: 1, _id: 1 },
          'rating-high': { rating: -1, createdAt: -1, _id: -1 },
          'rating-low': { rating: 1, createdAt: -1, _id: -1 },
          'company-asc': { companyName: 1, _id: 1 }, 'company-desc': { companyName: -1, _id: -1 },
        };
        const sort = Object.hasOwn(sorts, req.query.sort) ? sorts[req.query.sort] : sorts.newest;
        const search = String(req.query.search || '').trim().slice(0, 100);
        if (search) {
          const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          filter.$or = [{ companyName: pattern }, { authorName: pattern }, { message: pattern }];
        }
        const [feedback, total] = await Promise.all([
          Feedback.find(filter).select('companyName authorName designation rating message publishConsent isVisible createdAt')
            .sort(sort).skip((page - 1) * limit).limit(limit).lean(),
          Feedback.countDocuments(filter),
        ]);
        res.set('Cache-Control', 'private, no-store');
        res.json({ success: true, feedback, pagination: { page, total, totalPages: Math.ceil(total / limit), limit } });
      } catch (error) { next(error); }
    },
    async visibility(req, res, next) {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Feedback not found.' });
        if (typeof req.body.isVisible !== 'boolean') return res.status(400).json({ success: false, message: 'Choose whether to show this testimonial.' });
        const row = await Feedback.findOne({ _id: req.params.id, deletedAt: null });
        if (!row) return res.status(404).json({ success: false, message: 'Feedback not found.' });
        if (req.body.isVisible && (![4, 5].includes(row.rating) || !row.publishConsent)) return res.status(400).json({ success: false, message: 'Only 4- and 5-star feedback with permission can appear on the homepage.' });
        row.isVisible = req.body.isVisible;
        row.moderatedBy = req.user.id;
        await row.save();
        res.json({ success: true, isVisible: row.isVisible });
      } catch (error) { next(error); }
    },
    async remove(req, res, next) {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Feedback not found.' });
        // Preserve submission history so deletion never prompts the employer again.
        const row = await Feedback.findOneAndUpdate({ _id: req.params.id, deletedAt: null },
          { $set: { deletedAt: new Date(), isVisible: false, moderatedBy: req.user.id } });
        if (!row) return res.status(404).json({ success: false, message: 'Feedback not found.' });
        res.json({ success: true, message: 'Feedback deleted.' });
      } catch (error) { next(error); }
    },
    async testimonials(_req, res, next) {
      try {
        const testimonials = await Feedback.aggregate([
          { $match: { deletedAt: null, isVisible: true, publishConsent: true, rating: { $in: [4, 5] } } },
          { $lookup: { from: Company.collection.name, localField: 'companyProfile', foreignField: '_id', as: 'company' } },
          { $unwind: '$company' },
          { $match: { 'company.isActive': { $ne: false } } },
          { $lookup: { from: Users.collection.name, localField: 'employer', foreignField: '_id', as: 'owner' } },
          { $unwind: '$owner' },
          { $match: { 'owner.isActive': true } },
          { $sort: { createdAt: -1, _id: -1 } }, { $limit: 6 },
          { $project: { _id: 1, rating: 1, message: 1, authorName: 1, designation: 1,
            companyName: '$company.companyName', logo: '$company.logo' } },
        ]);
        // Moderation must be reflected on the next homepage request, without stale public caches.
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, testimonials });
      } catch (error) { next(error); }
    },
  };
}
export default createFeedbackController();
