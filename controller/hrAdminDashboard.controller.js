import mongoose from 'mongoose';
import JobPost from '../models/jobs.model.js';
import Application from '../models/jobApply.model.js';
import CompanyProfile from '../models/companyProfile.model.js';
import User from '../models/user.model.js';
import CandidateProfile from '../models/candidateProfile.model.js';

const hrAdminDashboardController = {};

/**
 * Get overall platform statistics for HR-Admin/Superadmin
 * @route GET /api/v1/hr-admin-dashboard/platform-stats
 * @access Private (HR-Admin, Superadmin)
 */
hrAdminDashboardController.getPlatformStats = async (req, res, next) => {
  try {
    const user = req.user;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let employerIds = user.employerIds || [];
    let companyFilter = {};
    let jobFilter = {};

    if (user.role === 'hr-admin') {
      companyFilter = {
        $or: [
          { employer: { $in: employerIds } },
          { createdBy: user.id }
        ]
      };

      jobFilter = {
        $or: [
          { employer: { $in: employerIds } },
          { postedBy: user.id }
        ]
      };
    } else if (user.role === 'superadmin') {
      companyFilter = {};
      jobFilter = {};
    } else {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

   const [
      totalEmployers,
      activeCompanies,
      totalJobs,
      activeJobs,
      totalApplications,
      recentApplications,
      shortlistedApplications,
      totalCandidates,
      recentCandidates,
      lastMonthStats,
    ] = await Promise.all([
      user.role === 'hr-admin' 
        ? employerIds.length 
        : User.countDocuments({ role: 'employer', isActive: true }),

      CompanyProfile.countDocuments({
        status: 'approved',
        ...companyFilter
      }),

      JobPost.countDocuments(jobFilter),

      JobPost.countDocuments({
        ...jobFilter,
        status: 'Published',
        applicationDeadline: { $gte: new Date() }
      }),

      // FIXED: Total applications
      Application.aggregate([
        { $lookup: { from: 'jobposts', localField: 'jobPost', foreignField: '_id', as: 'job' } },
        { $unwind: '$job' },
        {
          $match: {
            $or: [
              { 'job.employer': { $in: employerIds } },
              { 'job.postedBy': user.id }
            ]
          }
        },
        { $count: 'total' }
      ]).then(r => r[0]?.total || 0),

      // FIXED: Recent applications
      Application.aggregate([
        { $lookup: { from: 'jobposts', localField: 'jobPost', foreignField: '_id', as: 'job' } },
        { $unwind: '$job' },
        {
          $match: {
            $or: [
              { 'job.employer': { $in: employerIds } },
              { 'job.postedBy': user.id }
            ],
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        { $count: 'total' }
      ]).then(r => r[0]?.total || 0),

      // FIXED: Shortlisted applications
      Application.aggregate([
        { $lookup: { from: 'jobposts', localField: 'jobPost', foreignField: '_id', as: 'job' } },
        { $unwind: '$job' },
        {
          $match: {
            $or: [
              { 'job.employer': { $in: employerIds } },
              { 'job.postedBy': user.id }
            ],
            shortlisted: true
          }
        },
        { $count: 'total' }
      ]).then(r => r[0]?.total || 0),

      User.countDocuments({ role: 'candidate', isActive: true }),

      User.countDocuments({
        role: 'candidate',
        isActive: true,
        createdAt: { $gte: thirtyDaysAgo }
      }),

      getLastMonthStats(user, employerIds, jobFilter, companyFilter),
    ]);
    
    // Growth percentages (Month-over-Month)
    const employerGrowth = lastMonthStats.totalEmployers > 0
      ? Math.round(((totalEmployers - lastMonthStats.totalEmployers) / lastMonthStats.totalEmployers) * 100)
      : totalEmployers > 0 ? 100 : 0;

    const jobGrowth = lastMonthStats.totalJobs > 0
      ? Math.round(((totalJobs - lastMonthStats.totalJobs) / lastMonthStats.totalJobs) * 100)
      : totalJobs > 0 ? 100 : 0;

    const applicationGrowth = lastMonthStats.totalApplications > 0
      ? Math.round(((totalApplications - lastMonthStats.totalApplications) / lastMonthStats.totalApplications) * 100)
      : totalApplications > 0 ? 100 : 0;

    const candidateGrowth = lastMonthStats.totalCandidates > 0
      ? Math.round(((totalCandidates - lastMonthStats.totalCandidates) / lastMonthStats.totalCandidates) * 100)
      : totalCandidates > 0 ? 100 : 0;

    // Industry-standard derived metrics

    // 1. Average Applications per Job
    // Real-world name: "Applications per Job Posting"
    // Typical range: 20–80 for most roles (higher for entry-level)
    const avgApplicationsPerJob = totalJobs > 0 
      ? Number((totalApplications / totalJobs).toFixed(1))   // e.g. 37.4
      : 0;

    // 2. Open Jobs Rate (most honest & widely used)
    // % of jobs still accepting applications (Published & not expired)
    // Typical good range: 40–80%
    const openJobsRate = totalJobs > 0 
      ? Math.round((activeJobs / totalJobs) * 100) 
      : 0;

    // 3. Shortlist Conversion Rate
    // Industry standard: % of applications that get shortlisted
    // Typical range: 5–20% (higher for high-volume, lower for selective roles)
    const shortlistConversionRate = totalApplications > 0 
      ? Math.round((shortlistedApplications / totalApplications) * 100) 
      : 0;

    const stats = {
      // Core counts
      totalEmployers,
      totalCandidates,
      newCandidates: recentCandidates,

      activeCompanies,
      totalJobs,
      activeJobs,

      totalApplications,
      recentApplications,
      shortlistedApplications,

      // Growth rates (MoM)
      employerGrowth,
      jobGrowth,
      applicationGrowth,
      candidateGrowth,

      // Industry-standard derived metrics
      avgApplicationsPerJob,
      openJobsRate,
      shortlistConversionRate,

      // Scope info
      scope: user.role === 'hr-admin' ? 'assigned-employers' : 'platform-wide',
      assignedEmployerCount: user.role === 'hr-admin' ? employerIds.length : null,
      lastUpdated: new Date().toISOString(),
    };

    return res.status(200).json({ success: true, stats });
  } catch (error) {
    next(error);
  }
};

/**
 * Get assigned employers overview for HR-Admin
 * @route GET /api/v1/hr-admin-dashboard/assigned-employers
 * @access Private (HR-Admin, Superadmin)
 */
hrAdminDashboardController.getAssignedEmployers = async (req, res, next) => {
  try {
    const user = req.user;
    console.log("user in assigned employers:", user);
    const { limit = 10, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let employerIds = [];

    if (user.role === 'hr-admin') {
      if (!user.employerIds || user.employerIds.length === 0) {
        return res.status(200).json({
          success: true,
          employers: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            total: 0,
            limit: parseInt(limit),
          },
        });
      }
      employerIds = user.employerIds;
    } else {
      // Superadmin gets all employers
      const employers = await User.find({ role: 'employer', isActive: true })
        .select('_id')
        .limit(parseInt(limit))
        .skip(skip);
      employerIds = employers.map(e => e._id);
    }

    // Get employer details with their stats
    const employers = await User.aggregate([
      {
        $match: {
          _id: { $in: employerIds.map(id => new mongoose.Types.ObjectId(id)) },
          role: 'employer',
          isActive: true,
        },
      },
      {
        $lookup: {
          from: 'companyprofiles',
          localField: '_id',
          foreignField: 'employer',
          as: 'companyProfile',
        },
      },
      {
        $unwind: {
          path: '$companyProfile',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'jobposts',
          localField: '_id',
          foreignField: 'employer',
          as: 'jobs',
        },
      },
      {
        $lookup: {
          from: 'applications',
          localField: 'jobs._id',
          foreignField: 'jobPost',
          as: 'applications',
        },
      },
      {
        $project: {
          name: 1,
          email: 1,
          createdAt: 1,
          lastLoginAt: 1,
          companyName: '$companyProfile.companyName',
          companyStatus: '$companyProfile.status',
          totalJobs: { $size: '$jobs' },
          activeJobs: {
            $size: {
              $filter: {
                input: '$jobs',
                as: 'job',
                cond: {
                  $and: [
                    { $gte: ['$$job.applicationDeadline', new Date()] },
                    { $eq: ['$$job.status', 'Published'] },
                  ],
                },
              },
            },
          },
          totalApplications: { $size: '$applications' },
          pendingApplications: {
            $size: {
              $filter: {
                input: '$applications',
                as: 'app',
                cond: { $eq: ['$$app.status', 'Pending'] },
              },
            },
          },
          profileViews: '$companyProfile.profileViews',
          isCompanyVerified: '$companyProfile.isVerified',
          companyCreatedAt: '$companyProfile.createdAt',
        },
      },
      { $sort: { totalApplications: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ]);

    // Get total count for pagination
    const total = await User.countDocuments({
      _id: { $in: employerIds.map(id => new mongoose.Types.ObjectId(id)) },
      role: 'employer',
      isActive: true,
    });

    return res.status(200).json({
      success: true,
      employers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get job performance metrics across assigned employers
 * @route GET /api/v1/hr-admin-dashboard/job-performance
 * @access Private (HR-Admin, Superadmin)
 */
hrAdminDashboardController.getJobPerformance = async (req, res, next) => {
    try {
        const user = req.user;
        const { period = 'monthly', limit = 10, months = 6 } = req.query;

        // Calculate start date based on months parameter
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - parseInt(months));

        let jobMatch = {};
        let applicationMatch = {};

        // For HR-Admin, filter by assigned employers
        if (user.role === 'hr-admin' && user.employerIds && user.employerIds.length > 0) {
            jobMatch.employer = { $in: user.employerIds };
            const assignedJobIds = await JobPost.find(jobMatch).distinct('_id');
            applicationMatch.jobPost = { $in: assignedJobIds };
        }

        // Get top performing jobs by applications
        const topJobs = await JobPost.aggregate([
            { $match: { ...jobMatch, createdAt: { $gte: startDate } } },
            {
                $lookup: {
                    from: 'applications',
                    localField: '_id',
                    foreignField: 'jobPost',
                    as: 'applications',
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'employer',
                    foreignField: '_id',
                    as: 'employer',
                },
            },
            { $unwind: '$employer' },
            {
                $lookup: {
                    from: 'companyprofiles',
                    localField: 'companyProfile',
                    foreignField: '_id',
                    as: 'company',
                },
            },
            { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    title: 1,
                    status: 1,
                    location: 1,
                    jobType: 1,
                    offeredSalary: 1,
                    applicationDeadline: 1,
                    createdAt: 1,
                    totalApplications: { $size: '$applications' },
                    recentApplications: {
                        $size: {
                            $filter: {
                                input: '$applications',
                                as: 'app',
                                cond: { $gte: ['$$app.createdAt', startDate] }
                            }
                        }
                    },
                    shortlistedCount: {
                        $size: {
                            $filter: {
                                input: '$applications',
                                as: 'app',
                                cond: { $eq: ['$$app.shortlisted', true] }
                            }
                        }
                    },
                    acceptedCount: {
                        $size: {
                            $filter: {
                                input: '$applications',
                                as: 'app',
                                cond: { $eq: ['$$app.status', 'Accepted'] }
                            }
                        }
                    },
                    // Safe acceptanceRate – never divide by zero
                    acceptanceRate: {
                        $cond: {
                            if: { $gt: [{ $size: '$applications' }, 0] },
                            then: {
                                $round: [
                                    {
                                        $multiply: [
                                            {
                                                $divide: [
                                                    {
                                                        $size: {
                                                            $filter: {
                                                                input: '$applications',
                                                                as: 'app',
                                                                cond: { $eq: ['$$app.status', 'Accepted'] }
                                                            }
                                                        }
                                                    },
                                                    { $size: '$applications' }
                                                ]
                                            },
                                            100
                                        ]
                                    },
                                    1
                                ]
                            },
                            else: 0
                        }
                    },
                    employerName: '$employer.name',
                    companyName: { $ifNull: ['$company.companyName', 'N/A'] },
                    positionsRemaining: { $ifNull: ['$positions.remaining', 0] },
                    positionsTotal: { $ifNull: ['$positions.total', 0] },
                    // Safe fillPercentage
                    fillPercentage: {
                        $cond: {
                            if: { $gt: [{ $ifNull: ['$positions.total', 0] }, 0] },
                            then: {
                                $round: [
                                    {
                                        $multiply: [
                                            {
                                                $divide: [
                                                    { $subtract: [{ $ifNull: ['$positions.total', 0] }, { $ifNull: ['$positions.remaining', 0] }] },
                                                    { $ifNull: ['$positions.total', 0] }
                                                ]
                                            },
                                            100
                                        ]
                                    },
                                    1
                                ]
                            },
                            else: 0
                        }
                    },
                    // Safe viewsPerApplication
                    viewsPerApplication: {
                        $cond: {
                            if: {
                                $and: [
                                    { $gt: [{ $ifNull: ['$profileViews', 0] }, 0] },
                                    { $gt: [{ $size: '$applications' }, 0] }
                                ]
                            },
                            then: {
                                $round: [
                                    { $divide: [{ $ifNull: ['$profileViews', 0] }, { $size: '$applications' }] },
                                    1
                                ]
                            },
                            else: 0
                        }
                    },
                    // Safe timeToFirstApplication (in days)
                    timeToFirstApplication: {
                        $cond: {
                            if: { $gt: [{ $size: '$applications' }, 0] },
                            then: {
                                $round: [
                                    {
                                        $divide: [
                                            {
                                                $min: {
                                                    $map: {
                                                        input: '$applications',
                                                        as: 'app',
                                                        in: { $subtract: ['$$app.createdAt', '$createdAt'] }
                                                    }
                                                }
                                            },
                                            1000 * 60 * 60 * 24
                                        ]
                                    },
                                    0
                                ]
                            },
                            else: null
                        }
                    },
                    // Safe timeToFill (in days)
                    timeToFill: {
                        $cond: {
                            if: { $eq: [{ $ifNull: ['$positions.remaining', 0] }, 0] },
                            then: {
                                $round: [
                                    {
                                        $divide: [
                                            { $subtract: ['$updatedAt', '$createdAt'] },
                                            1000 * 60 * 60 * 24
                                        ]
                                    },
                                    0
                                ]
                            },
                            else: null
                        }
                    }
                }
            },
            { $sort: { totalApplications: -1 } },
            { $limit: parseInt(limit) },
        ]);

        // Format time metrics (convert ms to days)
        const formattedTopJobs = topJobs.map(job => ({
            ...job,
            timeToFirstApplication: job.timeToFirstApplication
                ? Math.round(job.timeToFirstApplication / (1000 * 60 * 60 * 24))  // ms to days
                : null,
            timeToFill: job.timeToFill
                ? Math.round(job.timeToFill / (1000 * 60 * 60 * 24))
                : null,
        }));

        // Get job status distribution
        const jobStatusDistribution = await JobPost.aggregate([
            { $match: { ...jobMatch, createdAt: { $gte: startDate } } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalApplications: { $sum: '$applicantCount' },
                    avgApplications: { $avg: '$applicantCount' },
                    avgFillRate: { $avg: { $subtract: ['$positions.total', '$positions.remaining'] } },
                },
            },
            { $sort: { count: -1 } },
        ]);

        // Get job type distribution
        const jobTypeDistribution = await JobPost.aggregate([
            { $match: { ...jobMatch, createdAt: { $gte: startDate } } },
            // Extract salary numbers
            {
                $addFields: {
                    salaryNumbers: {
                        $regexFindAll: {
                            input: '$offeredSalary',
                            regex: /[0-9]+(\.[0-9]+)?/g,
                        },
                    },
                },
            },
            // Calculate average salary number
            {
                $addFields: {
                    numericSalary: {
                        $cond: [
                            { $gt: [{ $size: '$salaryNumbers' }, 0] },
                            {
                                $avg: {
                                    $map: {
                                        input: '$salaryNumbers',
                                        as: 's',
                                        in: { $toDouble: '$$s.match' },
                                    },
                                },
                            },
                            null,
                        ],
                    },
                },
            },
            // Group
            {
                $group: {
                    _id: '$jobType',
                    count: { $sum: 1 },
                    avgSalary: { $avg: '$numericSalary' },
                    totalApplications: { $sum: '$applicantCount' },
                    avgApplications: { $avg: '$applicantCount' },
                },
            },
            { $sort: { count: -1 } },
        ]);

        // Calculate overall metrics
        const totalJobs = await JobPost.countDocuments({ ...jobMatch, createdAt: { $gte: startDate } });
        const totalApplications = await Application.aggregate([
            { $match: applicationMatch },
            { $count: 'total' },
        ]).then(r => r[0]?.total || 0);

        const avgApplicationsPerJob = totalJobs > 0 ? Math.round(totalApplications / totalJobs) : 0;

        const timeToFillStats = await JobPost.aggregate([
            {
                $match: {
                    ...jobMatch,
                    status: 'Closed',
                    createdAt: { $gte: startDate },
                    updatedAt: { $exists: true },     // safety: skip jobs without updatedAt
                }
            },
            {
                $project: {
                    daysToFill: {
                        $cond: {
                            if: { $gt: ['$updatedAt', '$createdAt'] },
                            then: {
                                $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 1000 * 60 * 60 * 24]
                            },
                            else: null
                        }
                    }
                }
            },
            {
                $match: { daysToFill: { $ne: null } }   // remove invalid entries
            },
            {
                $group: {
                    _id: null,
                    avgTimeToFill: { $avg: '$daysToFill' },
                    medianTimeToFill: {
                        $median: {
                            input: '$daysToFill',
                            method: "approximate"         
                        }
                    },
                    countFilled: { $sum: 1 }
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            period,
            months: parseInt(months),
            topJobs: formattedTopJobs,
            jobStatusDistribution,
            jobTypeDistribution,
            metrics: {
                totalJobs,
                totalApplications,
                avgApplicationsPerJob,
                avgTimeToFill: timeToFillStats[0]?.avgTimeToFill ? Math.round(timeToFillStats[0].avgTimeToFill) : 0,
                medianTimeToFill: timeToFillStats[0]?.medianTimeToFill ? Math.round(timeToFillStats[0].medianTimeToFill) : 0,
                avgAcceptanceRate: calculateAverageAcceptanceRate(topJobs),
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get application trends across platform or assigned employers
 * @route GET /api/v1/hr-admin-dashboard/application-trends
 * @access Private (HR-Admin, Superadmin)
 */
hrAdminDashboardController.getApplicationTrends = async (req, res, next) => {
  try {
    const user = req.user;
    const { period = 'monthly', months = 6 } = req.query;

    console.log("testtt", user);


    let jobMatch = {};
    let applicationMatch = {};

    // For HR-Admin, filter by assigned employers
    if (user.role === 'hr-admin' && user.employerIds && user.employerIds.length > 0) {
      jobMatch.employer = { $in: user.employerIds };
      
      // Get job IDs for assigned employers
      const assignedJobIds = await JobPost.find(jobMatch).select('_id');
      const jobIdArray = assignedJobIds.map(job => job._id);
      
      applicationMatch.jobPost = { $in: jobIdArray };
    }

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));

    // Get application trends by period
    const trends = await Application.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          ...applicationMatch,
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] },
          },
          reviewed: {
            $sum: { $cond: [{ $eq: ['$status', 'Reviewed'] }, 1, 0] },
          },
          accepted: {
            $sum: { $cond: [{ $eq: ['$status', 'Accepted'] }, 1, 0] },
          },
          rejected: {
            $sum: { $cond: [{ $eq: ['$status', 'Rejected'] }, 1, 0] },
          },
          shortlisted: {
            $sum: { $cond: [{ $eq: ['$shortlisted', true] }, 1, 0] },
          },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Format trends data
    const formattedTrends = trends.map(item => ({
      period: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
      label: `${new Date(item._id.year, item._id.month - 1).toLocaleString('default', { month: 'short' })} ${item._id.year}`,
      total: item.total,
      pending: item.pending,
      reviewed: item.reviewed,
      accepted: item.accepted,
      rejected: item.rejected,
      shortlisted: item.shortlisted,
      conversionRate: item.total > 0 ? Math.round((item.accepted / item.total) * 100) : 0,
    }));

    // Get top employers by applications
   // Top employers – improved
    const topEmployersPipeline = [
      { $match: { ...applicationMatch, createdAt: { $gte: startDate } } },
      {
        $lookup: { from: 'jobposts', localField: 'jobPost', foreignField: '_id', as: 'job' },
      },
      { $unwind: '$job' },
      {
        $group: {
          _id: '$job.employer',
          totalApplications: { $sum: 1 },
          shortlisted: { $sum: { $cond: [{ $eq: ['$shortlisted', true] }, 1, 0] } },
          accepted: { $sum: { $cond: [{ $eq: ['$status', 'Accepted'] }, 1, 0] } },
          lastActivity: { $max: '$createdAt' },
        },
      },
      {
        $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'employer' },
      },
      { $unwind: '$employer' },
      {
        $lookup: { from: 'companyprofiles', localField: '_id', foreignField: 'employer', as: 'company' },
      },
      { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          employerId: '$_id',
          employerName: '$employer.name',
          companyName: { $ifNull: ['$company.companyName', 'N/A'] },
          totalApplications: 1,
          shortlistRate: { $cond: [{ $gt: ['$totalApplications', 0] }, { $round: [{ $multiply: [{ $divide: ['$shortlisted', '$totalApplications'] }, 100] }, 1] }, 0] },
          acceptanceRate: { $cond: [{ $gt: ['$totalApplications', 0] }, { $round: [{ $multiply: [{ $divide: ['$accepted', '$totalApplications'] }, 100] }, 1] }, 0] },
          daysSinceLastActivity: {
            $round: [{ $divide: [{ $subtract: [new Date(), '$lastActivity'] }, 1000 * 60 * 60 * 24] }, 0],
          },
        },
      },
      { $sort: { totalApplications: -1 } },
      { $limit: 5 },
    ];

    const topEmployers = await Application.aggregate(topEmployersPipeline);

    // Format top employers data
    const formattedTopEmployers = topEmployers.map(item => ({
      employerId: item.employerId,
      employerName: item.employerName,
      companyName: item.companyName,
      totalApplications: item.totalApplications,
      shortlistRate: item.shortlistRate,
      acceptanceRate: item.acceptanceRate,
      daysSinceLastActivity: item.daysSinceLastActivity,
    }));

    return res.status(200).json({
      success: true,
      period,
      months: parseInt(months),
      trends: formattedTrends,
      topEmployers: formattedTopEmployers,
      totalApplications: formattedTrends.reduce((sum, item) => sum + item.total, 0),
      avgMonthlyApplications: Math.round(
        formattedTrends.reduce((sum, item) => sum + item.total, 0) / formattedTrends.length
      ),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get candidate analytics for HR-Admin dashboard
 * @route GET /api/v1/hr-admin-dashboard/candidate-analytics
 * @access Private (HR-Admin, Superadmin)
 */
hrAdminDashboardController.getCandidateAnalytics = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // 1. Registration trends (daily)
    const registrationTrends = await User.aggregate([
      {
        $match: {
          role: 'candidate',
          isActive: true,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);

    // 2. Profile completion stats (improved – no profileCompletion field needed)
    const profileStats = await CandidateProfile.aggregate([
      {
        $group: {
          _id: null,
          totalProfiles: { $sum: 1 },
          withResume: {
            $sum: { $cond: [{ $ne: ['$resume', null] }, 1, 0] },
          },
          withPhoto: {
            $sum: { $cond: [{ $ne: ['$profilePhoto', null] }, 1, 0] },
          },
          withSkills: {
            $sum: {
              $cond: [
                { $and: [{ $isArray: '$skills' }, { $gt: [{ $size: '$skills' }, 0] }] },
                1,
                0,
              ],
            },
          },
          withExperience: {
            $sum: {
              $cond: [{ $and: [{ $ne: ['$experience', null] }, { $ne: ['$experience', ''] }] }, 1, 0],
            },
          },
          withLocation: {
            $sum: { $cond: [{ $ne: ['$location.city', null] }, 1, 0] },
          },
          // ────────────────────────────────────────────────
          // Calculate average profile completion percentage
          // Each field contributes 20% → total 100%
          // ────────────────────────────────────────────────
          avgCompletionPercentage: {
            $avg: {
              $add: [
                { $cond: [{ $ne: ['$resume', null] }, 20, 0] },           // 20% for resume
                { $cond: [{ $ne: ['$profilePhoto', null] }, 20, 0] },     // 20% for photo
                { $cond: [{ $and: [{ $isArray: '$skills' }, { $gt: [{ $size: '$skills' }, 0] }] }, 20, 0] },  // 20% for skills
                { $cond: [{ $and: [{ $ne: ['$experience', null] }, { $ne: ['$experience', ''] }] }, 20, 0] }, // 20% for experience
                { $cond: [{ $ne: ['$location.city', null] }, 20, 0] }     // 20% for location
              ]
            }
          },
        },
      },
    ]);

    // 3. Top 10 skills
    const topSkills = await CandidateProfile.aggregate([
      { $match: { skills: { $exists: true, $type: 'array', $ne: [] } } },
      { $unwind: '$skills' },
      { $group: { _id: '$skills', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);


    // 4. Application behavior
    const applicationBehavior = await Application.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: '$candidate',
          totalApplications: { $sum: 1 },
          firstApplication: { $min: '$createdAt' },
          lastApplication: { $max: '$createdAt' },
        },
      },
      {
        $group: {
          _id: null,
          totalActiveCandidates: { $sum: 1 },
          avgApplicationsPerCandidate: { $avg: '$totalApplications' },
          candidatesWithMultipleApps: {
            $sum: { $cond: [{ $gt: ['$totalApplications', 1] }, 1, 0] },
          },
          avgDaysBetweenApps: {
            $avg: {
              $cond: [
                { $gt: ['$totalApplications', 1] },
                { $divide: [{ $subtract: ['$lastApplication', '$firstApplication'] }, 1000 * 60 * 60 * 24] },
                0,
              ],
            },
          },
        },
      },
    ]);

    const stats = profileStats[0] || {
      totalProfiles: 0,
      withResume: 0,
      withPhoto: 0,
      withSkills: 0,
      withExperience: 0,
      withLocation: 0,
    };

    const behavior = applicationBehavior[0] || {
      totalActiveCandidates: 0,
      avgApplicationsPerCandidate: 0,
      candidatesWithMultipleApps: 0,
      avgDaysBetweenApps: 0,
    };

    return res.status(200).json({
      success: true,
      periodDays: parseInt(days),
      registrationTrends: registrationTrends.map(t => ({
        date: `${t._id.year}-${String(t._id.month).padStart(2, '0')}-${String(t._id.day).padStart(2, '0')}`,
        registrations: t.count,
      })),
      profileCompletion: {
        totalProfiles: stats.totalProfiles,
        resumeUploadRate: stats.totalProfiles ? Math.round((stats.withResume / stats.totalProfiles) * 100) : 0,
        photoUploadRate: stats.totalProfiles ? Math.round((stats.withPhoto / stats.totalProfiles) * 100) : 0,
        skillsAddedRate: stats.totalProfiles ? Math.round((stats.withSkills / stats.totalProfiles) * 100) : 0,
        experienceAddedRate: stats.totalProfiles ? Math.round((stats.withExperience / stats.totalProfiles) * 100) : 0,
        locationAddedRate: stats.totalProfiles ? Math.round((stats.withLocation / stats.totalProfiles) * 100) : 0,
        avgCompletionPercentage: Math.round(stats.avgCompletionPercentage) || 0,    
      },
      topSkills: topSkills.map(s => ({ skill: s._id, count: s.count })),
      applicationBehavior: {
        totalActiveCandidates: behavior.totalActiveCandidates,
        avgApplicationsPerCandidate: Number(behavior.avgApplicationsPerCandidate.toFixed(1)),
        multipleApplicationRate: behavior.totalActiveCandidates
          ? Math.round((behavior.candidatesWithMultipleApps / behavior.totalActiveCandidates) * 100)
          : 0,
        avgDaysBetweenApplications: Number(behavior.avgDaysBetweenApps.toFixed(1)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get pending approvals and actions needed
 * @route GET /api/v1/hr-admin-dashboard/pending-actions
 * @access Private (HR-Admin, Superadmin)
 */
hrAdminDashboardController.getPendingActions = async (req, res, next) => {
  try {
    const user = req.user;

    let companyMatch = {};
    let userMatch = {};

    // For HR-Admin, filter by assigned employers
    if (user.role === 'hr-admin' && user.employerIds && user.employerIds.length > 0) {
      companyMatch.employer = { $in: user.employerIds };
      userMatch._id = { $in: user.employerIds };
    }

    // Get pending company approvals
    const pendingCompanies = await CompanyProfile.find({
      ...companyMatch,
      status: 'pending',
    })
      .populate('employer', 'name email')
      .select('companyName email phone status createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get pending job approvals
    const pendingJobs = await JobPost.find({
      status: 'Pending',
      ...(user.role === 'hr-admin' && user.employerIds ? { employer: { $in: user.employerIds } } : {}),
    })
      .populate('employer', 'name email')
      .populate('companyProfile', 'companyName')
      .select('title employer companyProfile status createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get pending employer registrations
    const pendingEmployers = await User.find({
      role: 'employer',
      status: 'pending',
      ...userMatch,
    })
      .select('name email createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get recent activities by HR-Admin
    const recentActivities = await JobPost.find({
      postedBy: user.id,
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
    })
      .select('title status createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    return res.status(200).json({
      success: true,
      pendingActions: {
        companies: {
          count: pendingCompanies.length,
          items: pendingCompanies,
        },
        jobs: {
          count: pendingJobs.length,
          items: pendingJobs,
        },
        employers: {
          count: pendingEmployers.length,
          items: pendingEmployers,
        },
      },
      recentActivities,
      totalPendingActions: pendingCompanies.length + pendingJobs.length + pendingEmployers.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get revenue/reporting metrics (if applicable)
 * @route GET /api/v1/hr-admin-dashboard/revenue-metrics
 * @access Private (HR-Admin, Superadmin)
 */
hrAdminDashboardController.getRevenueMetrics = async (req, res, next) => {
  try {
    const user = req.user;
    const { months = 6 } = req.query;

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));

    let jobMatch = {};

    // For HR-Admin, filter by assigned employers
    if (user.role === 'hr-admin' && user.employerIds && user.employerIds.length > 0) {
      jobMatch.employer = { $in: user.employerIds };
    }

    // Get job postings over time (assuming each job posting generates revenue)
    const jobPostingTrends = await JobPost.aggregate([
      {
        $match: {
          ...jobMatch,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
          // Assuming revenue calculation based on job type/level
          estimatedRevenue: {
            $sum: {
                $switch: {
                branches: [
                    { case: { $eq: ['$jobType', 'Full-time'] },   then: 3500 },
                    { case: { $eq: ['$jobType', 'Part-time'] },   then: 1800 },
                    { case: { $eq: ['$jobType', 'Contract'] },    then: 2500 },
                    { case: { $eq: ['$jobType', 'Freelance'] },   then: 1200 },
                    { case: { $eq: ['$jobType', 'Internship'] },  then: 800  },
                ],
                default: 2000,
                }
            }
         },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Calculate employer engagement metrics
    const employerEngagement = await JobPost.aggregate([
      {
        $match: {
          ...jobMatch,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$employer',
          totalJobs: { $sum: 1 },
          totalApplications: { $sum: '$applicantCount' },
          lastJobDate: { $max: '$createdAt' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'employer',
        },
      },
      { $unwind: '$employer' },
      {
        $project: {
          employerName: '$employer.name',
          email: '$employer.email',
          totalJobs: 1,
          totalApplications: 1,
          lastJobDate: 1,
          daysSinceLastJob: {
            $divide: [
              { $subtract: [new Date(), '$lastJobDate'] },
              1000 * 60 * 60 * 24,
            ],
          },
        },
      },
      { $sort: { totalJobs: -1 } },
      { $limit: 10 },
    ]);

    // Format trends data
    const formattedTrends = jobPostingTrends.map(item => ({
      period: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
      jobsPosted: item.count,
      estimatedRevenue: item.estimatedRevenue,
      avgRevenuePerJob: Math.round(item.estimatedRevenue / item.count),
    }));

    // Calculate totals
    const totalJobs = formattedTrends.reduce((sum, item) => sum + item.jobsPosted, 0);
    const totalRevenue = formattedTrends.reduce((sum, item) => sum + item.estimatedRevenue, 0);
    const avgMonthlyRevenue = Math.round(totalRevenue / formattedTrends.length);

    // Calculate growth
    const recentMonths = formattedTrends.slice(-3);
    const olderMonths = formattedTrends.slice(-6, -3);
    const recentRevenue = recentMonths.reduce((sum, item) => sum + item.estimatedRevenue, 0);
    const olderRevenue = olderMonths.reduce((sum, item) => sum + item.estimatedRevenue, 0);
    const revenueGrowth = olderRevenue > 0 
      ? Math.round(((recentRevenue - olderRevenue) / olderRevenue) * 100)
      : recentRevenue > 0 ? 100 : 0;

    return res.status(200).json({
      success: true,
      disclaimer: 'Revenue metrics are estimates for demonstration purposes',
      trends: formattedTrends,
      employerEngagement,
      summary: {
        totalJobs,
        totalRevenue,
        avgMonthlyRevenue,
        revenueGrowth,
        avgRevenuePerJob: totalJobs > 0 ? Math.round(totalRevenue / totalJobs) : 0,
        activeEmployers: employerEngagement.length,
        highlyEngagedEmployers: employerEngagement.filter(e => e.totalJobs >= 3).length,
      },
      periodMonths: parseInt(months),
    });
  } catch (error) {
    next(error);
  }
};


// Helper: Last month's baseline stats for growth calculation
async function getLastMonthStats(user, employerIds, jobFilter, companyFilter) {
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  const [
    totalEmployers,
    totalJobs,
    totalApplications,
    totalCandidates,
  ] = await Promise.all([
    user.role === 'hr-admin' 
      ? employerIds.length 
      : User.countDocuments({ role: 'employer', isActive: true, createdAt: { $lt: lastMonth } }),

    JobPost.countDocuments({ createdAt: { $lt: lastMonth }, ...jobFilter }),

    Application.aggregate([
      { $lookup: { from: 'jobposts', localField: 'jobPost', foreignField: '_id', as: 'job' } },
      { $unwind: '$job' },
      { $match: { ...jobFilter, createdAt: { $lt: lastMonth } } },
      { $count: 'total' }
    ]).then(r => r[0]?.total || 0),

    User.countDocuments({ role: 'candidate', isActive: true, createdAt: { $lt: lastMonth } }),
  ]);

  return { totalEmployers, totalJobs, totalApplications, totalCandidates };
}

function calculateAverageAcceptanceRate(jobs) {
  if (!jobs.length) return 0;
  
  const totalRate = jobs.reduce((sum, job) => sum + job.acceptanceRate, 0);
  return Math.round(totalRate / jobs.length);
}

export default hrAdminDashboardController;