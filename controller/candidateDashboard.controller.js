// controller/candidateDashboard.controller.js
import JobPost from '../models/jobs.model.js';
import JobApply from '../models/jobApply.model.js';
import SavedJob from '../models/savedJob.model.js';
import JobAlert from '../models/jobAlert.model.js';
import CandidateProfile from '../models/candidateProfile.model.js';

const candidateDashboardController = {};

/**
 * Get aggregated dashboard statistics for candidate
 * @route GET /api/v1/candidate-dashboard/stats
 */
candidateDashboardController.getDashboardStats = async (req, res, next) => {
  try {
    const candidateId = req.user.id;

    const profile = await CandidateProfile.findOne({ candidate: candidateId });

    if (!profile) {
      return res.status(200).json({
        success: true,
        stats: {
          appliedJobs: 0,
          savedJobs: 0,
          jobAlerts: 0,
          profileViews: 0,
          profileCompleteness: 0,
          applicationsThisMonth: 0,
          applicationGrowth: 0,
        }
      });
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfLastMonth = new Date(startOfMonth);
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      appliedCount,
      savedCount,
      alertCount,
      thisMonthApps,
      lastMonthApps,
      activeJobs,
      jobsAddedToday
    ] = await Promise.all([
      JobApply.countDocuments({ candidate: candidateId }),
      SavedJob.countDocuments({ candidate: candidateId }),
      JobAlert.countDocuments({ candidate: candidateId, isActive: true }),
      JobApply.countDocuments({ candidate: candidateId, createdAt: { $gte: startOfMonth } }),
      JobApply.countDocuments({ candidate: candidateId, createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }),

      JobPost.countDocuments({ status: 'Published' }),
      JobPost.countDocuments({
        status: 'Published',
        createdAt: { $gte: todayStart }
      })
    ]);

    // Profile completeness 
    const requiredFields = [
      'fullName', 'jobTitle', 'phone', 'email', 'description',
      'educationLevels', 'languages', 'categories', 'location.city',
      'profilePhoto', 'resume'
    ];
    const filled = requiredFields.filter(field => {
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        return profile[parent]?.[child];
      }
      return profile[field];
    }).length;

    // Profile completeness calculation
    const completeness = Math.round((filled / requiredFields.length) * 100);

    // Application growth calculation
    const growth = lastMonthApps > 0
      ? Math.round(((thisMonthApps - lastMonthApps) / lastMonthApps) * 100)
      : thisMonthApps > 0 ? 100 : 0;

    const stats = {
      appliedJobs: appliedCount,
      savedJobs: savedCount,
      jobAlerts: alertCount,
      profileViews: profile.profileViews || 0,
      profileCompleteness: completeness,
      applicationsThisMonth: thisMonthApps,
      applicationGrowth: growth,
      activeJobs,
      jobsAddedToday,
      lastUpdated: new Date(),
    };

    res.status(200).json({ success: true, stats });
  } catch (error) {
    next(error);
  }
};

/**
 * Get profile views data for chart
 * @route GET /api/v1/candidate-dashboard/profile-views
 */
candidateDashboardController.getProfileViewsData = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const { range = '6' } = req.query;
    const monthsBack = parseInt(range, 10);

    const profile = await CandidateProfile.findOne({ candidate: candidateId });
    if (!profile) {
      return res.json({ success: true, monthlyData: [] });
    }

    const views = [];
    const now = new Date();

    for (let i = monthsBack - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      const monthName = date.toLocaleString('default', { month: 'long' });

      // aggregate ALL days of the month
      const monthEntries = profile.dailyViews.filter(d =>
        d.date.startsWith(key)
      );

      const totalViews = monthEntries.reduce((sum, d) => sum + (d.count || 0), 0);
      const uniqueViews = monthEntries.reduce((sum, d) => sum + (d.unique || 0), 0);

      views.push({
        month: monthName,
        year,
        totalViews,
        uniqueViews
      });
    }

    res.json({
      success: true,
      totalViews: profile.profileViews || 0,
      uniqueViewers: profile.uniqueViewers?.length || 0,
      monthlyData: views.reverse()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get recent activities
 * @route GET /api/v1/candidate-dashboard/recent-activities
 */
candidateDashboardController.getRecentActivity = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    const [apps, saved, alerts] = await Promise.all([
      JobApply.find({ candidate: candidateId })
        .populate('jobPost', 'title companyProfile')
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('jobPost createdAt status'),
      SavedJob.find({ candidate: candidateId })
        .populate('jobPost', 'title')
        .sort({ createdAt: -1 })
        .limit(limit),
      JobAlert.find({ candidate: candidateId, isActive: true })
        .sort({ createdAt: -1 })
        .limit(limit)
    ]);

    const activities = [];

    apps.forEach(app => activities.push({
      type: 'application',
      message: `Applied to ${app.jobPost?.title || 'a job'}`,
      time: app.createdAt,
      status: app.status
    }));

    saved.forEach(s => activities.push({
      type: 'saved',
      message: `Saved job: ${s.jobPost?.title || 'Unknown'}`,
      time: s.createdAt
    }));

    alerts.forEach(a => activities.push({
      type: 'alert',
      message: `Created job alert: ${a.criteria.title || 'Custom Alert'}`,
      time: a.createdAt
    }));

    // Sort all by time
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));
    activities.splice(limit); // Limit total

    res.status(200).json({ success: true, activities });
  } catch (error) {
    next(error);
  }
};

/**
 * Get application trends (monthly)
 * @route GET /api/v1/candidate-dashboard/application-trends
 */
// controller/candidateDashboard.controller.js
candidateDashboardController.getApplicationTrends = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const period = req.query.period || 'monthly'; // monthly, weekly, daily

    const startDate = new Date();
    if (period === 'daily') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === 'weekly') {
      startDate.setDate(startDate.getDate() - 84); // ~12 weeks
    } else {
      startDate.setMonth(startDate.getMonth() - 12); // 12 months
    }

    let groupBy = {};
    if (period === 'daily') {
      groupBy = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
      };
    } else if (period === 'weekly') {
      groupBy = {
        year: { $year: '$createdAt' },
        week: { $week: '$createdAt' },
      };
    } else {
      groupBy = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
      };
    }

    const trends = await JobApply.aggregate([
      {
        $match: {
          candidate: candidateId,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: groupBy,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          reviewed: { $sum: { $cond: [{ $eq: ['$status', 'Reviewed'] }, 1, 0] } },
          accepted: { $sum: { $cond: [{ $eq: ['$status', 'Accepted'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'Rejected'] }, 1, 0] } },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } },
    ]);

    const formatted = trends.map(t => {
      let dateLabel;
      if (period === 'daily') {
        dateLabel = `${t._id.year}-${String(t._id.month).padStart(2,'0')}-${String(t._id.day).padStart(2,'0')}`;
      } else if (period === 'weekly') {
        dateLabel = `Week ${t._id.week}, ${t._id.year}`;
      } else {
        dateLabel = `${t._id.year}-${String(t._id.month).padStart(2,'0')}`;
      }

      return {
        date: dateLabel,
        total: t.total,
        pending: t.pending,
        reviewed: t.reviewed,
        accepted: t.accepted,
        rejected: t.rejected,
      };
    });

    res.status(200).json({
      success: true,
      period,
      data: formatted
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get job type distribution (pie chart)
 * @route GET /api/v1/candidate-dashboard/job-type-distribution
 */
candidateDashboardController.getJobTypeDistribution = async (req, res, next) => {
  try {
    const candidateId = req.user.id;

    const appliedJobs = await JobApply.find({ candidate: candidateId })
      .populate('jobPost', 'jobType');

    const distribution = appliedJobs.reduce((acc, app) => {
      const type = app.jobPost?.jobType || 'Unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const total = Object.values(distribution).reduce((a, b) => a + b, 0);

    const formatted = Object.entries(distribution).map(([type, count]) => ({
      jobType: type,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }));

    res.status(200).json({
      success: true,
      distribution: formatted,
      totalApplications: total
    });
  } catch (error) {
    next(error);
  }
};

export default candidateDashboardController;