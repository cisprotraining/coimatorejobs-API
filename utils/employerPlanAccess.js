import mongoose from 'mongoose';
import User from '../models/user.model.js';
import PaymentPlan from '../models/paymentPlan.model.js';
import JobPost from '../models/jobs.model.js';
import ResumeAlert from '../models/resumeAlert.model.js';
import ResumeDownloadLog from '../models/resumeDownloadLog.model.js';
import EmployerResumeDownloadLog from '../models/employerResumeDownloadLog.model.js';

const PLAN_REQUIRED_MESSAGE =
  'Your employer account needs an active payment plan to use this feature.';

const getIstDateKey = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const getIstMonthKey = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());

const getIstMonthLabel = () =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

const getCycleDateFilter = (cycle = 'Monthly') => {
  if (cycle === 'Total') return {};

  const now = new Date();
  const start = new Date(now);

  if (cycle === 'Daily') {
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }

  return { createdAt: { $gte: start } };
};

const findActiveFreePlan = () =>
  PaymentPlan.findOne({
    status: 'Active',
    $or: [
      { planType: 'Free' },
      { name: /^free$/i, price: 0 },
    ],
  }).sort({ createdAt: -1 });

export const resolveEmployerPlan = async (employerId) => {
  const user = await User.findById(employerId).select('activePaymentPlan paymentPlanAssignedAt role');
  if (!user || user.role !== 'employer') return null;

  let plan = null;
  if (user.activePaymentPlan) {
    plan = await PaymentPlan.findOne({
      _id: user.activePaymentPlan,
      status: 'Active',
    });
  }

  if (!plan) {
    plan = await findActiveFreePlan();
    if (plan) {
      user.activePaymentPlan = plan._id;
      user.paymentPlanAssignedAt = new Date();
      await user.save({ validateBeforeSave: false });
    }
  }

  return plan;
};

export const getFeatureLimit = (plan, featureKey, legacyKey = null) => {
  const feature = plan?.[featureKey] || {};
  const legacyValue = legacyKey ? Number(plan?.[legacyKey] || 0) : 0;
  const featureEnabled =
    Boolean(feature.enabled) || legacyValue === -1 || legacyValue > 0;

  if (!plan || !featureEnabled) {
    return {
      enabled: false,
      limit: 0,
      cycle: feature.cycle || 'Monthly',
    };
  }

  if (feature.limitType === 'unlimited' || legacyValue === -1) {
    return {
      enabled: true,
      limit: -1,
      cycle: feature.cycle || 'Monthly',
    };
  }

  return {
    enabled: true,
    limit: Number(feature.limitCount || legacyValue || 0),
    cycle: feature.cycle || 'Monthly',
  };
};

export const getEmployerResumeDownloadUsage = async (employerId, cycle = 'Monthly') => {
  const employerObjectId = mongoose.Types.ObjectId.isValid(employerId)
    ? new mongoose.Types.ObjectId(employerId)
    : employerId;

  const profileQuery = { employer: employerObjectId };
  if (cycle === 'Daily') profileQuery.dayKey = getIstDateKey();
  if (cycle === 'Monthly') profileQuery.dayKey = new RegExp(`^${getIstMonthKey()}`);

  const applicantQuery = { employer: employerObjectId };
  if (cycle === 'Daily') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    applicantQuery.downloadedAt = { $gte: start };
  }
  if (cycle === 'Monthly') applicantQuery.monthKey = getIstMonthKey();

  const [profileRows, applicantDownloadCount] = await Promise.all([
    ResumeDownloadLog.aggregate([
      { $match: profileQuery },
      { $group: { _id: null, total: { $sum: '$downloadCount' } } },
    ]),
    EmployerResumeDownloadLog.countDocuments(applicantQuery),
  ]);

  const profileDownloads = Number(profileRows[0]?.total || 0);
  const applicantDownloads = Number(applicantDownloadCount || 0);

  return {
    profileDownloads,
    applicantDownloads,
    total: profileDownloads + applicantDownloads,
  };
};

export const buildEmployerResumeDownloadQuota = async (employerId, feature = null) => {
  let resolvedFeature = feature;

  if (!resolvedFeature) {
    const plan = await resolveEmployerPlan(employerId);
    resolvedFeature = getFeatureLimit(plan, 'resumeDownloads', 'resumeLimit');
  }

  const usage = await getEmployerResumeDownloadUsage(employerId, resolvedFeature.cycle);
  const downloadsRemaining =
    resolvedFeature.limit === -1
      ? -1
      : Math.max(Number(resolvedFeature.limit || 0) - usage.total, 0);

  return {
    limitPerJob: resolvedFeature.limit,
    limitPerEmployer: resolvedFeature.limit,
    limitScope: 'employer',
    cycle: resolvedFeature.cycle,
    monthKey: getIstMonthKey(),
    monthLabel: getIstMonthLabel(),
    jobs: [],
    selectedJob: null,
    summary: {
      totalJobs: 0,
      totalDownloadsUsed: usage.total,
      downloadsRemaining,
      profileDownloads: usage.profileDownloads,
      applicantDownloads: usage.applicantDownloads,
    },
  };
};

const block = (res, message, status = 403, extra = {}) =>
  res.status(status).json({
    success: false,
    code: extra.code || 'PLAN_LIMIT_REACHED',
    message,
    ...extra,
  });

export const requireEmployerPlanFeature = async ({
  req,
  res,
  booleanField,
  featureLabel,
}) => {
  if (req.user?.role !== 'employer') return { allowed: true, plan: null };

  const plan = await resolveEmployerPlan(req.user.id);
  if (!plan) {
    block(res, PLAN_REQUIRED_MESSAGE, 403, { code: 'PLAN_REQUIRED' });
    return { allowed: false, plan: null };
  }

  if (!plan[booleanField]) {
    block(res, `${featureLabel} is not included in your current plan.`);
    return { allowed: false, plan };
  }

  return { allowed: true, plan };
};

export const requireEmployerJobPostLimit = async (req, res, employerId = null) => {
  if (req.user?.role !== 'employer') return true;

  const plan = await resolveEmployerPlan(req.user.id);
  if (!plan) {
    block(res, PLAN_REQUIRED_MESSAGE, 403, { code: 'PLAN_REQUIRED' });
    return false;
  }

  const feature = getFeatureLimit(plan, 'jobPostingLimit', 'jobLimit');
  if (!feature.enabled || feature.limit === 0) {
    block(res, 'Job posting is not included in your current plan.');
    return false;
  }

  if (feature.limit === -1) return true;

  const usageCount = await JobPost.countDocuments({
    employer: employerId || req.user.id,
    ...getCycleDateFilter(feature.cycle),
  });

  if (usageCount >= feature.limit) {
    block(
      res,
      `Job posting limit reached. Your current plan allows ${feature.limit} job post(s) per ${feature.cycle.toLowerCase()} cycle.`,
      429,
      {
        limit: feature.limit,
        used: usageCount,
        cycle: feature.cycle,
      },
    );
    return false;
  }

  return true;
};

export const requireEmployerResumeAlertLimit = async (req, res) => {
  if (req.user?.role !== 'employer') return true;

  const plan = await resolveEmployerPlan(req.user.id);
  if (!plan) {
    block(res, PLAN_REQUIRED_MESSAGE, 403, { code: 'PLAN_REQUIRED' });
    return false;
  }

  const feature = getFeatureLimit(plan, 'candidateProfileAlerts');
  if (!feature.enabled || feature.limit === 0) {
    block(res, 'Resume alerts are not included in your current plan.');
    return false;
  }

  if (feature.limit === -1) return true;

  const usageCount = await ResumeAlert.countDocuments({
    employer: req.user.id,
    ...getCycleDateFilter(feature.cycle),
  });

  if (usageCount >= feature.limit) {
    block(
      res,
      `Resume alert limit reached. Your current plan allows ${feature.limit} alert(s) per ${feature.cycle.toLowerCase()} cycle.`,
      429,
      {
        limit: feature.limit,
        used: usageCount,
        cycle: feature.cycle,
      },
    );
    return false;
  }

  return true;
};

export const requireEmployerResumeDownloadLimit = async (req, res) => {
  if (req.user?.role !== 'employer') return { allowed: true, plan: null, feature: null };

  const plan = await resolveEmployerPlan(req.user.id);
  if (!plan) {
    block(res, PLAN_REQUIRED_MESSAGE, 403, { code: 'PLAN_REQUIRED' });
    return { allowed: false, plan: null, feature: null };
  }

  const feature = getFeatureLimit(plan, 'resumeDownloads', 'resumeLimit');
  if (!feature.enabled || feature.limit === 0) {
    block(res, 'Resume downloads are not included in your current plan.');
    return { allowed: false, plan, feature };
  }

  if (feature.limit === -1) return { allowed: true, plan, feature };

  const usage = await getEmployerResumeDownloadUsage(req.user.id, feature.cycle);
  const usageCount = usage.total;

  if (usageCount >= feature.limit) {
    const downloadQuota = await buildEmployerResumeDownloadQuota(req.user.id, feature);
    block(
      res,
      `Resume download limit reached. Your current plan allows ${feature.limit} download(s) per ${feature.cycle.toLowerCase()} cycle.`,
      429,
      {
        code: 'DOWNLOAD_LIMIT_REACHED',
        limit: feature.limit,
        used: usageCount,
        cycle: feature.cycle,
        downloadQuota,
      },
    );
    return { allowed: false, plan, feature };
  }

  return { allowed: true, plan, feature };
};
