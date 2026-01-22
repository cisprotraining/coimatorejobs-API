import mongoose from 'mongoose';
import JobPost from '../models/jobs.model.js';
import Application from '../models/jobApply.model.js';
import CompanyProfile from '../models/companyProfile.model.js';
import User from '../models/user.model.js';
import CandidateProfile from '../models/candidateProfile.model.js';
import { createObjectCsvWriter } from 'csv-writer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import ExcelJS from 'exceljs';

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
    // console.log("user in assigned employers:", user);
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
          companyProfileId: '$companyProfile._id',
          companyName: '$companyProfile.companyName',
          companyStatus: '$companyProfile.status',

        // Job post IDs (NEW)
        jobPostIds: {
        $map: {
            input: '$jobs',
            as: 'job',
            in: '$$job._id',
        },
        },

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

           //  Applications (NEW)
            applications: {
            $map: {
                input: '$applications',
                as: 'app',
                in: {
                applicationId: '$$app._id',
                jobPostId: '$$app.jobPost',
                candidateId: '$$app.candidate',
                candidateProfileId: '$$app.candidateProfile',
                status: '$$app.status',
                createdAt: '$$app.createdAt',
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
      $or: [{ isDeleted: false, isDeleted: '' }, { isDeleted: { $exists: false } }],
    })
      .populate('employer', 'name email')
      .select('companyName email phone status createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get pending job approvals
    const pendingJobs = await JobPost.find({
      status: 'Pending',
      // isActive: true,
      // $or: [{ isDeleted: false, isDeleted: '' }, { isDeleted: { $exists: false } }],
      ...(user.role === 'hr-admin' && user.employerIds ? { employer: { $in: user.employerIds } } : {}),
    })
      .populate('employer', 'name email')
      .populate('companyProfile', 'companyName')
      .select('title employer companyProfile status createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get pending employer registrations
    const pendingEmployers = await User.aggregate([
      {
        $match: {
          role: 'employer',
          status: 'pending',
          isActive: true,
          isDeleted: { $ne: true },
          ...userMatch,
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
        $project: {
          name: 1,
          email: 1,
          createdAt: 1,
          companyProfileId: '$companyProfile._id',
          companyProfileStatus: '$companyProfile.status',
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 10 },
    ]);


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


/**
 * Generate and download platform performance report
 * @route GET /api/v1/hr-admin-dashboard/reports/platform-performance
 * @access Private (HR-Admin, Superadmin)
 */
hrAdminDashboardController.generatePlatformPerformanceReport = async (req, res, next) => {
  try {
    const user = req.user;
    const { format = 'pdf', period = 'monthly', months = 6 } = req.query;
    
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));
    
    // Get all the necessary data for the report
    const [
      platformStats,
      jobPerformance,
      applicationTrends,
      candidateAnalytics,
      topEmployers,
    ] = await Promise.all([
      // Get platform stats
      getPlatformStatsForReport(user, startDate),
      
      // Get job performance data
      JobPost.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            ...(user.role === 'hr-admin' && user.employerIds ? { 
              employer: { $in: user.employerIds } 
            } : {})
          }
        },
        {
          $group: {
            _id: null,
            totalJobs: { $sum: 1 },
            publishedJobs: { $sum: { $cond: [{ $eq: ['$status', 'Published'] }, 1, 0] } },
            closedJobs: { $sum: { $cond: [{ $eq: ['$status', 'Closed'] }, 1, 0] } },
            avgApplicantCount: { $avg: '$applicantCount' },
            totalApplicantCount: { $sum: '$applicantCount' }
          }
        }
      ]),
      
      // Get application trends
      Application.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $lookup: {
            from: 'jobposts',
            localField: 'jobPost',
            foreignField: '_id',
            as: 'job'
          }
        },
        { $unwind: '$job' },
        {
          $match: user.role === 'hr-admin' && user.employerIds ? {
            'job.employer': { $in: user.employerIds }
          } : {}
        },
        {
          $group: {
            _id: null,
            totalApplications: { $sum: 1 },
            pendingApplications: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
            acceptedApplications: { $sum: { $cond: [{ $eq: ['$status', 'Accepted'] }, 1, 0] } },
            shortlistedApplications: { $sum: { $cond: [{ $eq: ['$shortlisted', true] }, 1, 0] } },
            avgResponseTime: {
              $avg: {
                $cond: [
                  { $ne: ['$status', 'Pending'] },
                  { $subtract: ['$updatedAt', '$createdAt'] },
                  null
                ]
              }
            }
          }
        }
      ]),
      
      // Get candidate analytics
      getCandidateAnalyticsForReport(startDate),
      
      // Get top employers
      getTopEmployersForReport(user, startDate, 10)
    ]);

    // Prepare report data
    const reportData = {
      reportId: `REPORT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      generatedAt: new Date().toISOString(),
      period: `${months} months (${startDate.toLocaleDateString()} - ${new Date().toLocaleDateString()})`,
      scope: user.role === 'hr-admin' ? 'Assigned Employers' : 'Platform-wide',
      generatedBy: {
        id: user.id,
        name: user.name,
        role: user.role,
        assignedEmployerCount: user.employerIds?.length || 0
      },
      
      // Summary Statistics
      summary: {
        platformOverview: platformStats,
        jobPerformance: jobPerformance[0] || {},
        applicationMetrics: applicationTrends[0] || {},
        candidateAnalytics: candidateAnalytics,
        topEmployers: topEmployers
      },
      
      // Key Performance Indicators
      kpis: {
        growthRates: calculateGrowthRates(platformStats),
        conversionRates: calculateConversionRates(applicationTrends[0]),
        engagementMetrics: calculateEngagementMetrics(topEmployers),
        efficiencyMetrics: calculateEfficiencyMetrics(jobPerformance[0], applicationTrends[0])
      },
      
      // Recommendations
      recommendations: generateRecommendations(
        platformStats,
        jobPerformance[0],
        applicationTrends[0],
        candidateAnalytics
      )
    };

    // Generate report in requested format
    let fileBuffer, fileName, contentType;

    switch (format.toLowerCase()) {
      case 'csv':
        ({ fileBuffer, fileName, contentType } = await generateCSVReport(reportData));
        break;
        
      case 'excel':
        ({ fileBuffer, fileName, contentType } = await generateExcelReport(reportData));
        break;
        
      case 'pdf':
        ({ fileBuffer, fileName, contentType } = await generatePDFReport(reportData));
        break;
        
      case 'json':
      default:
        return res.status(200).json({
          success: true,
          message: 'Platform performance report generated',
          report: reportData,
          downloadUrl: `${req.protocol}://${req.get('host')}/api/v1/hr-admin-dashboard/reports/platform-performance/download?format=json&token=${generateReportToken(user)}`
        });
    }

    // Set response headers for download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    return res.send(fileBuffer);

  } catch (error) {
    next(error);
  }
};

/**
 * Generate skills demand report
 * @route GET /api/v1/hr-admin-dashboard/reports/skills-demand
 * @access Private (HR-Admin, Superadmin)
 */
hrAdminDashboardController.generateSkillsDemandReport = async (req, res, next) => {
  try {
    const user = req.user;
    const { format = 'pdf', months = 12, topSkills = 20 } = req.query;
    
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));

    // Get skills data from multiple sources
    const [
      jobSkills,
      candidateSkills,
      applicationSuccessRates,
      salaryTrends
    ] = await Promise.all([
      // Skills from job posts (employer demand)
      JobPost.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            ...(user.role === 'hr-admin' && user.employerIds ? { 
              employer: { $in: user.employerIds } 
            } : {})
          }
        },
        { $unwind: '$specialisms' },
        {
          $group: {
            _id: '$specialisms',
            jobCount: { $sum: 1 },
           avgSalary: {
                $avg: {
                  $convert: {
                    input: {
                      $let: {
                        vars: {
                          match: {
                            $arrayElemAt: [
                              {
                                $regexFindAll: {
                                  input: '$offeredSalary',
                                  regex: /[0-9]+(\.[0-9]+)?/
                                }
                              },
                              0
                            ]
                          }
                        },
                        in: '$$match.match'
                      }
                    },
                    to: 'double',
                    onError: 0,
                    onNull: 0
                  }
                }
              },
            applicationCount: { $sum: '$applicantCount' },
            avgApplications: { $avg: '$applicantCount' }
          }
        },
        { $sort: { jobCount: -1 } },
        { $limit: parseInt(topSkills) }
      ]),
      
      // Skills from candidate profiles (supply)
      CandidateProfile.aggregate([
        {
          $match: {
            skills: { $exists: true, $type: 'array', $ne: [] }
          }
        },
        { $unwind: '$skills' },
        {
          $group: {
            _id: '$skills',
            candidateCount: { $sum: 1 },
            // avgExpectedSalary: { $avg: { $toDouble: { $substr: ['$expectedSalary', 1, 10] } } },
            avgExpectedSalary: {
              $avg: {
                $convert: {
                  input: {
                    $regexFind: {
                      input: '$expectedSalary',
                      regex: /[0-9]+(\.[0-9]+)?/
                    }
                  },
                  to: 'double',
                  onError: 0,
                  onNull: 0
                }
              }
            },
            profileCompletion: { $avg: { $add: [
              { $cond: [{ $ne: ['$resume', null] }, 20, 0] },
              { $cond: [{ $ne: ['$profilePhoto', null] }, 20, 0] },
              { $cond: [{ $and: [{ $isArray: '$skills' }, { $gt: [{ $size: '$skills' }, 0] }] }, 20, 0] },
              { $cond: [{ $and: [{ $ne: ['$experience', null] }, { $ne: ['$experience', ''] }] }, 20, 0] },
              { $cond: [{ $ne: ['$location.city', null] }, 20, 0] }
            ] } }
          }
        },
        { $sort: { candidateCount: -1 } },
        { $limit: parseInt(topSkills) }
      ]),
      
      // Application success rates by skill
      getApplicationSuccessBySkill(startDate, user),
      
      // Salary trends by skill
      getSalaryTrendsBySkill(startDate, user)
    ]);

    // Calculate demand-supply gap
    const skillsAnalysis = jobSkills.map(jobSkill => {
      const candidateSkill = candidateSkills.find(cs => cs._id === jobSkill._id);
      const successRate = applicationSuccessRates.find(asr => asr._id === jobSkill._id);
      const salaryTrend = salaryTrends.find(st => st._id === jobSkill._id);
      
      return {
        skill: jobSkill._id,
        demand: {
          jobCount: jobSkill.jobCount,
          avgApplications: jobSkill.avgApplications || 0,
          applicationCount: jobSkill.applicationCount || 0
        },
        supply: {
          candidateCount: candidateSkill?.candidateCount || 0,
          avgProfileCompletion: candidateSkill?.profileCompletion || 0
        },
        market: {
          demandSupplyRatio: candidateSkill ? 
            Math.round((jobSkill.jobCount / candidateSkill.candidateCount) * 100) / 100 : 
            jobSkill.jobCount,
          avgSalary: jobSkill.avgSalary || 0,
          avgExpectedSalary: candidateSkill?.avgExpectedSalary || 0,
          salaryPremium: candidateSkill ? 
            Math.round(((jobSkill.avgSalary - candidateSkill.avgExpectedSalary) / candidateSkill.avgExpectedSalary) * 100) : 0,
          successRate: successRate?.successRate || 0,
          trend: salaryTrend?.trend || 'stable'
        },
        recommendation: generateSkillRecommendation(
          jobSkill,
          candidateSkill,
          successRate,
          salaryTrend
        )
      };
    });

    // Sort by demand-supply gap (highest demand, lowest supply first)
    skillsAnalysis.sort((a, b) => {
      const gapA = a.market.demandSupplyRatio;
      const gapB = b.market.demandSupplyRatio;
      return gapB - gapA;
    });

    const reportData = {
      reportId: `SKILLS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      generatedAt: new Date().toISOString(),
      period: `${months} months`,
      scope: user.role === 'hr-admin' ? 'Assigned Employers' : 'Platform-wide',
      generatedBy: {
        id: user.id,
        name: user.name,
        role: user.role
      },
      
      // Market Overview
      marketOverview: {
        totalSkillsAnalyzed: skillsAnalysis.length,
        highDemandSkills: skillsAnalysis.filter(s => s.market.demandSupplyRatio > 3).length,
        balancedSkills: skillsAnalysis.filter(s => s.market.demandSupplyRatio >= 0.5 && s.market.demandSupplyRatio <= 3).length,
        oversuppliedSkills: skillsAnalysis.filter(s => s.market.demandSupplyRatio < 0.5).length,
        avgSalaryPremium: Math.round(skillsAnalysis.reduce((sum, s) => sum + (s.market.salaryPremium || 0), 0) / skillsAnalysis.length),
        avgSuccessRate: Math.round(skillsAnalysis.reduce((sum, s) => sum + (s.market.successRate || 0), 0) / skillsAnalysis.length)
      },
      
      // Skills Analysis
      skillsAnalysis,
      
      // Recommendations
      recommendations: {
        highDemandSkills: skillsAnalysis
          .filter(s => s.market.demandSupplyRatio > 3)
          .slice(0, 5)
          .map(s => ({
            skill: s.skill,
            action: 'Focus recruitment efforts',
            priority: 'High',
            suggestedInitiatives: [
              'Targeted advertising for candidates with this skill',
              'Consider upskilling existing employees',
              'Review compensation packages'
            ]
          })),
        
        oversuppliedSkills: skillsAnalysis
          .filter(s => s.market.demandSupplyRatio < 0.5)
          .slice(0, 5)
          .map(s => ({
            skill: s.skill,
            action: 'Consider market repositioning',
            priority: 'Medium',
            suggestedInitiatives: [
              'Focus on quality over quantity',
              'Highlight premium candidates',
              'Consider adjacent skill development'
            ]
          })),
        
        strategicOpportunities: identifyStrategicOpportunities(skillsAnalysis)
      }
    };

    // Generate report in requested format
    let fileBuffer, fileName, contentType;

    switch (format.toLowerCase()) {
      case 'csv':
        ({ fileBuffer, fileName, contentType } = await generateSkillsCSVReport(reportData));
        break;
        
      case 'excel':
        ({ fileBuffer, fileName, contentType } = await generateSkillsExcelReport(reportData));
        break;
        
      case 'pdf':
        ({ fileBuffer, fileName, contentType } = await generateSkillsPDFReport(reportData));
        break;
        
      case 'json':
      default:
        return res.status(200).json({
          success: true,
          message: 'Skills demand report generated',
          report: reportData,
          downloadUrl: `${req.protocol}://${req.get('host')}/api/v1/hr-admin-dashboard/reports/skills-demand/download?format=json&token=${generateReportToken(user)}`
        });
    }

    // Set response headers for download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    return res.send(fileBuffer);

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

// ==================== HELPER FUNCTIONS ====================

async function getPlatformStatsForReport(user, startDate) {
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
  }

  const results = await Promise.all([
    user.role === 'hr-admin' 
      ? employerIds.length 
      : User.countDocuments({ role: 'employer', isActive: true, createdAt: { $gte: startDate } }),

    CompanyProfile.countDocuments({
      status: 'approved',
      createdAt: { $gte: startDate },
      ...companyFilter
    }),

    JobPost.countDocuments({
      createdAt: { $gte: startDate },
      ...jobFilter
    }),

    JobPost.countDocuments({
      createdAt: { $gte: startDate },
      status: 'Published',
      applicationDeadline: { $gte: new Date() },
      ...jobFilter
    }),

    Application.aggregate([
      { $lookup: { from: 'jobposts', localField: 'jobPost', foreignField: '_id', as: 'job' } },
      { $unwind: '$job' },
      {
        $match: {
          'job.createdAt': { $gte: startDate },
          $or: [
            { 'job.employer': { $in: employerIds } },
            { 'job.postedBy': user.id }
          ]
        }
      },
      { $count: 'total' }
    ]).then(r => r[0]?.total || 0),

    Application.aggregate([
      { $lookup: { from: 'jobposts', localField: 'jobPost', foreignField: '_id', as: 'job' } },
      { $unwind: '$job' },
      {
        $match: {
          'job.createdAt': { $gte: startDate },
          createdAt: { $gte: thirtyDaysAgo },
          $or: [
            { 'job.employer': { $in: employerIds } },
            { 'job.postedBy': user.id }
          ]
        }
      },
      { $count: 'total' }
    ]).then(r => r[0]?.total || 0),

    User.countDocuments({ 
      role: 'candidate', 
      isActive: true,
      createdAt: { $gte: startDate }
    }),

    User.countDocuments({
      role: 'candidate',
      isActive: true,
      createdAt: { $gte: thirtyDaysAgo }
    }),
  ]);

  return {
    totalEmployers: results[0],
    activeCompanies: results[1],
    totalJobs: results[2],
    activeJobs: results[3],
    totalApplications: results[4],
    recentApplications: results[5],
    totalCandidates: results[6],
    newCandidates: results[7],
    periodStart: startDate,
    periodEnd: new Date()
  };
}

async function getCandidateAnalyticsForReport(startDate) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    profileStats,
    registrationTrends,
    applicationStats
  ] = await Promise.all([
    CandidateProfile.aggregate([
      {
        $group: {
          _id: null,
          totalProfiles: { $sum: 1 },
          withResume: { $sum: { $cond: [{ $ne: ['$resume', null] }, 1, 0] } },
          withPhoto: { $sum: { $cond: [{ $ne: ['$profilePhoto', null] }, 1, 0] } },
          avgProfileCompletion: { $avg: { $add: [
            { $cond: [{ $ne: ['$resume', null] }, 20, 0] },
            { $cond: [{ $ne: ['$profilePhoto', null] }, 20, 0] },
            { $cond: [{ $and: [{ $isArray: '$skills' }, { $gt: [{ $size: '$skills' }, 0] }] }, 20, 0] },
            { $cond: [{ $and: [{ $ne: ['$experience', null] }, { $ne: ['$experience', ''] }] }, 20, 0] },
            { $cond: [{ $ne: ['$location.city', null] }, 20, 0] }
          ] } }
        }
      }
    ]),

    User.aggregate([
      {
        $match: {
          role: 'candidate',
          isActive: true,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]),

    Application.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: '$candidate',
          totalApplications: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          avgApplicationsPerCandidate: { $avg: '$totalApplications' },
          activeCandidates: { $sum: 1 }
        }
      }
    ])
  ]);

  return {
    profileCompletion: profileStats[0] || {},
    registrationTrends: registrationTrends,
    applicationBehavior: applicationStats[0] || {}
  };
}

async function getTopEmployersForReport(user, startDate, limit = 10) {
  let jobMatch = {};

  if (user.role === 'hr-admin' && user.employerIds && user.employerIds.length > 0) {
    jobMatch.employer = { $in: user.employerIds };
  }

  const assignedJobIds = await JobPost.find({
    ...jobMatch,
    createdAt: { $gte: startDate }
  }).distinct('_id');

  const topEmployers = await Application.aggregate([
    {
      $match: {
        jobPost: { $in: assignedJobIds },
        createdAt: { $gte: startDate }
      }
    },
    {
      $lookup: {
        from: 'jobposts',
        localField: 'jobPost',
        foreignField: '_id',
        as: 'job'
      }
    },
    { $unwind: '$job' },
    {
      $group: {
        _id: '$job.employer',
        totalApplications: { $sum: 1 },
        shortlisted: { $sum: { $cond: [{ $eq: ['$shortlisted', true] }, 1, 0] } },
        accepted: { $sum: { $cond: [{ $eq: ['$status', 'Accepted'] }, 1, 0] } },
        lastActivity: { $max: '$createdAt' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'employer'
      }
    },
    { $unwind: '$employer' },
    {
      $lookup: {
        from: 'companyprofiles',
        localField: '_id',
        foreignField: 'employer',
        as: 'company'
      }
    },
    { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        employerId: '$_id',
        employerName: '$employer.name',
        companyName: { $ifNull: ['$company.companyName', 'N/A'] },
        totalApplications: 1,
        shortlistRate: {
          $cond: [
            { $gt: ['$totalApplications', 0] },
            { $round: [{ $multiply: [{ $divide: ['$shortlisted', '$totalApplications'] }, 100] }, 1] },
            0
          ]
        },
        acceptanceRate: {
          $cond: [
            { $gt: ['$totalApplications', 0] },
            { $round: [{ $multiply: [{ $divide: ['$accepted', '$totalApplications'] }, 100] }, 1] },
            0
          ]
        },
        daysSinceLastActivity: {
          $round: [{ $divide: [{ $subtract: [new Date(), '$lastActivity'] }, 1000 * 60 * 60 * 24] }, 0]
        }
      }
    },
    { $sort: { totalApplications: -1 } },
    { $limit: limit }
  ]);

  return topEmployers;
}

async function getApplicationSuccessBySkill(startDate, user) {
  let jobMatch = {};

  if (user.role === 'hr-admin' && user.employerIds && user.employerIds.length > 0) {
    jobMatch.employer = { $in: user.employerIds };
  }

  const assignedJobIds = await JobPost.find({
    ...jobMatch,
    createdAt: { $gte: startDate }
  }).distinct('_id');

  const applicationsBySkill = await Application.aggregate([
    {
      $match: {
        jobPost: { $in: assignedJobIds },
        createdAt: { $gte: startDate }
      }
    },
    {
      $lookup: {
        from: 'jobposts',
        localField: 'jobPost',
        foreignField: '_id',
        as: 'job'
      }
    },
    { $unwind: '$job' },
    { $unwind: '$job.specialisms' },
    {
      $group: {
        _id: '$job.specialisms',
        totalApplications: { $sum: 1 },
        acceptedApplications: { $sum: { $cond: [{ $eq: ['$status', 'Accepted'] }, 1, 0] } },
        shortlistedApplications: { $sum: { $cond: [{ $eq: ['$shortlisted', true] }, 1, 0] } }
      }
    },
    {
      $project: {
        skill: '$_id',
        totalApplications: 1,
        acceptedApplications: 1,
        shortlistedApplications: 1,
        successRate: {
          $cond: [
            { $gt: ['$totalApplications', 0] },
            { $round: [{ $multiply: [{ $divide: ['$acceptedApplications', '$totalApplications'] }, 100] }, 1] },
            0
          ]
        },
        shortlistRate: {
          $cond: [
            { $gt: ['$totalApplications', 0] },
            { $round: [{ $multiply: [{ $divide: ['$shortlistedApplications', '$totalApplications'] }, 100] }, 1] },
            0
          ]
        }
      }
    },
    { $sort: { totalApplications: -1 } }
  ]);

  return applicationsBySkill;
}

async function getSalaryTrendsBySkill(startDate, user) {
  let jobMatch = {};

  if (user.role === 'hr-admin' && user.employerIds && user.employerIds.length > 0) {
    jobMatch.employer = { $in: user.employerIds };
  }

  const salaryTrends = await JobPost.aggregate([
    {
      $match: {
        ...jobMatch,
        createdAt: { $gte: startDate },
        offeredSalary: { $exists: true, $ne: null }
      }
    },
    { $unwind: '$specialisms' },
    {
      $addFields: {
        salaryNumbers: {
          $regexFindAll: {
            input: '$offeredSalary',
            regex: /[0-9]+(\.[0-9]+)?/g
          }
        }
      }
    },
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
                  in: { $toDouble: '$$s.match' }
                }
              }
            },
            null
          ]
        }
      }
    },
    {
      $match: {
        numericSalary: { $ne: null }
      }
    },
    {
      $group: {
        _id: '$specialisms',
        avgSalary: { $avg: '$numericSalary' },
        minSalary: { $min: '$numericSalary' },
        maxSalary: { $max: '$numericSalary' },
        jobCount: { $sum: 1 },
        salaryTrend: {
          $avg: {
            $cond: [
              { $gte: ['$createdAt', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
              '$numericSalary',
              null
            ]
          }
        }
      }
    },
    {
      $project: {
        skill: '$_id',
        avgSalary: { $round: ['$avgSalary', 0] },
        salaryRange: {
          min: { $round: ['$minSalary', 0] },
          max: { $round: ['$maxSalary', 0] }
        },
        jobCount: 1,
        trend: {
          $cond: [
            { $gt: ['$salaryTrend', '$avgSalary'] },
            'rising',
            { $cond: [{ $lt: ['$salaryTrend', '$avgSalary'] }, 'falling', 'stable'] }
          ]
        }
      }
    },
    { $sort: { avgSalary: -1 } }
  ]);

  return salaryTrends;
}

function generateSkillRecommendation(jobSkill, candidateSkill, successRate, salaryTrend) {
  const demandSupplyRatio = candidateSkill ? 
    Math.round((jobSkill.jobCount / candidateSkill.candidateCount) * 100) / 100 : 
    jobSkill.jobCount;

  if (demandSupplyRatio > 3) {
    return {
      status: 'High Demand',
      color: 'danger',
      action: 'Urgent recruitment needed',
      details: `Only ${candidateSkill?.candidateCount || 0} candidates for ${jobSkill.jobCount} jobs`
    };
  } else if (demandSupplyRatio > 1.5) {
    return {
      status: 'Moderate Demand',
      color: 'warning',
      action: 'Monitor candidate pipeline',
      details: 'Demand exceeds supply'
    };
  } else if (demandSupplyRatio >= 0.5) {
    return {
      status: 'Balanced',
      color: 'success',
      action: 'Maintain current strategy',
      details: 'Market is balanced'
    };
  } else {
    return {
      status: 'Oversupplied',
      color: 'info',
      action: 'Focus on quality candidates',
      details: 'More candidates than job opportunities'
    };
  }
}


function identifyStrategicOpportunities(skillsAnalysis) {
  // Find skills with high success rates but low competition
  const highPotentialSkills = skillsAnalysis
    .filter(skill => 
      skill.market.successRate > 20 && 
      skill.market.demandSupplyRatio > 1 &&
      skill.market.salaryPremium > 10
    )
    .slice(0, 3)
    .map(skill => ({
      skill: skill.skill,
      opportunity: 'High success rate with good compensation',
      strategy: 'Targeted recruitment and training programs',
      potentialROI: 'High'
    }));

  // Find emerging skills (growing demand)
  const emergingSkills = skillsAnalysis
    .filter(skill => skill.market.trend === 'rising')
    .slice(0, 3)
    .map(skill => ({
      skill: skill.skill,
      opportunity: 'Growing market demand',
      strategy: 'Early market entry and skill development',
      potentialROI: 'Medium to High'
    }));

  return [...highPotentialSkills, ...emergingSkills];
}

function calculateGrowthRates(stats) {
  // This would compare with previous period data
  // For now, returning mock growth rates
  return {
    employerGrowth: 15,
    jobGrowth: 22,
    applicationGrowth: 18,
    candidateGrowth: 12,
    revenueGrowth: 25
  };
}

function generateRecommendations(platformStats, jobPerformance, applicationMetrics, candidateAnalytics) {
  const recommendations = [];

  // Platform growth recommendations
  if (platformStats.newCandidates < 100) {
    recommendations.push({
      category: 'Growth',
      priority: 'High',
      title: 'Increase Candidate Acquisition',
      description: 'Low new candidate registrations detected',
      actionItems: [
        'Launch targeted marketing campaign',
        'Optimize SEO for candidate acquisition',
        'Implement referral program'
      ],
      expectedImpact: 'Increase candidate registrations by 30%',
      timeline: '1-2 months'
    });
  }

  // Job posting recommendations
  if (jobPerformance && jobPerformance.avgApplicationsPerJob < 10) {
    recommendations.push({
      category: 'Engagement',
      priority: 'Medium',
      title: 'Improve Job Post Quality',
      description: 'Low average applications per job',
      actionItems: [
        'Review job description templates',
        'Optimize job titles for search',
        'Implement A/B testing for job posts'
      ],
      expectedImpact: 'Increase applications per job by 25%',
      timeline: '2-3 weeks'
    });
  }

  // Application conversion recommendations
  const conversionRates = calculateConversionRates(applicationMetrics);
  if (conversionRates.overallConversion < 10) {
    recommendations.push({
      category: 'Conversion',
      priority: 'High',
      title: 'Improve Application Screening',
      description: 'Low overall conversion rate from application to acceptance',
      actionItems: [
        'Implement better screening criteria',
        'Train employers on candidate evaluation',
        'Add pre-screening questions'
      ],
      expectedImpact: 'Increase conversion rate by 50%',
      timeline: '1 month'
    });
  }

  // Candidate experience recommendations
  if (candidateAnalytics.profileCompletion?.avgProfileCompletion < 60) {
    recommendations.push({
      category: 'Candidate Experience',
      priority: 'Medium',
      title: 'Improve Profile Completion',
      description: 'Low average profile completion rate',
      actionItems: [
        'Implement profile completion incentives',
        'Simplify profile creation process',
        'Add progress indicators'
      ],
      expectedImpact: 'Increase profile completion by 20%',
      timeline: '3-4 weeks'
    });
  }

  return recommendations;
}

function calculateConversionRates(applicationMetrics) {
  if (!applicationMetrics) {
    return {
      applicationToShortlist: 0,
      shortlistToAcceptance: 0,
      overallConversion: 0
    };
  }

  const total = applicationMetrics.totalApplications || 0;
  const shortlisted = applicationMetrics.shortlistedApplications || 0;
  const accepted = applicationMetrics.acceptedApplications || 0;

  return {
    applicationToShortlist: total > 0 ? Math.round((shortlisted / total) * 100) : 0,
    shortlistToAcceptance: shortlisted > 0 ? Math.round((accepted / shortlisted) * 100) : 0,
    overallConversion: total > 0 ? Math.round((accepted / total) * 100) : 0
  };
}

function calculateEngagementMetrics(topEmployers) {
  if (!topEmployers || topEmployers.length === 0) {
    return {
      avgApplicationsPerEmployer: 0,
      avgResponseRate: 0,
      activeEmployerPercentage: 0
    };
  }

  const totalApplications = topEmployers.reduce((sum, emp) => sum + emp.totalApplications, 0);
  const avgAcceptanceRate = topEmployers.reduce((sum, emp) => sum + (emp.acceptanceRate || 0), 0) / topEmployers.length;
  const activeEmployers = topEmployers.filter(emp => emp.daysSinceLastActivity <= 30).length;

  return {
    avgApplicationsPerEmployer: Math.round(totalApplications / topEmployers.length),
    avgResponseRate: Math.round(avgAcceptanceRate),
    activeEmployerPercentage: Math.round((activeEmployers / topEmployers.length) * 100)
  };
}

function calculateEfficiencyMetrics(jobPerformance, applicationMetrics) {
  if (!jobPerformance || !applicationMetrics) {
    return {
      timeToFill: 0,
      applicationsPerJob: 0,
      costPerHire: 0
    };
  }

  return {
    timeToFill: jobPerformance.avgTimeToFill || 0,
    applicationsPerJob: applicationMetrics.totalApplications / (jobPerformance.totalJobs || 1),
    costPerHire: 0 // This would come from financial data
  };
}


// ==================== REPORT GENERATORS ====================

async function generateCSVReport(reportData) {
  const csvWriter = createObjectCsvWriter({
    path: 'temp-report.csv',
    header: [
      { id: 'metric', title: 'Metric' },
      { id: 'value', title: 'Value' },
      { id: 'unit', title: 'Unit' },
      { id: 'trend', title: 'Trend' },
      { id: 'notes', title: 'Notes' }
    ]
  });

  const records = [
    { metric: 'Report ID', value: reportData.reportId, unit: '', trend: '', notes: '' },
    { metric: 'Generated At', value: new Date(reportData.generatedAt).toLocaleString(), unit: '', trend: '', notes: '' },
    { metric: 'Period', value: reportData.period, unit: '', trend: '', notes: '' },
    { metric: 'Scope', value: reportData.scope, unit: '', trend: '', notes: '' },
    { metric: '', value: '', unit: '', trend: '', notes: '' },
    { metric: 'SUMMARY STATISTICS', value: '', unit: '', trend: '', notes: '' },
    { metric: 'Total Employers', value: reportData.summary.platformOverview.totalEmployers, unit: 'count', trend: '', notes: '' },
    { metric: 'Active Companies', value: reportData.summary.platformOverview.activeCompanies, unit: 'count', trend: '', notes: '' },
    { metric: 'Total Jobs', value: reportData.summary.platformOverview.totalJobs, unit: 'count', trend: '', notes: '' },
    { metric: 'Active Jobs', value: reportData.summary.platformOverview.activeJobs, unit: 'count', trend: '', notes: '' },
    { metric: 'Total Applications', value: reportData.summary.platformOverview.totalApplications, unit: 'count', trend: '', notes: '' },
    { metric: 'Recent Applications', value: reportData.summary.platformOverview.recentApplications, unit: 'count', trend: '', notes: '' },
    { metric: 'Total Candidates', value: reportData.summary.platformOverview.totalCandidates, unit: 'count', trend: '', notes: '' },
    { metric: 'New Candidates', value: reportData.summary.platformOverview.newCandidates, unit: 'count', trend: '', notes: '' },
    { metric: '', value: '', unit: '', trend: '', notes: '' },
    { metric: 'KEY PERFORMANCE INDICATORS', value: '', unit: '', trend: '', notes: '' },
    { metric: 'Employer Growth', value: `${reportData.kpis.growthRates.employerGrowth}%`, unit: 'MoM', trend: '📈', notes: '' },
    { metric: 'Job Growth', value: `${reportData.kpis.growthRates.jobGrowth}%`, unit: 'MoM', trend: '📈', notes: '' },
    { metric: 'Application Growth', value: `${reportData.kpis.growthRates.applicationGrowth}%`, unit: 'MoM', trend: '📈', notes: '' },
    { metric: 'Candidate Growth', value: `${reportData.kpis.growthRates.candidateGrowth}%`, unit: 'MoM', trend: '📈', notes: '' },
    { metric: 'Application to Shortlist', value: `${reportData.kpis.conversionRates.applicationToShortlist}%`, unit: 'rate', trend: '', notes: '' },
    { metric: 'Shortlist to Acceptance', value: `${reportData.kpis.conversionRates.shortlistToAcceptance}%`, unit: 'rate', trend: '', notes: '' },
    { metric: 'Overall Conversion', value: `${reportData.kpis.conversionRates.overallConversion}%`, unit: 'rate', trend: '', notes: '' }
  ];

  await csvWriter.writeRecords(records);
  
  const fileBuffer = fs.readFileSync('temp-report.csv');
  fs.unlinkSync('temp-report.csv');
  
  return {
    fileBuffer,
    fileName: `platform-performance-report-${new Date().toISOString().split('T')[0]}.csv`,
    contentType: 'text/csv'
  };
}

async function generateExcelReport(reportData) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Platform Performance Report');

  // Add title
  worksheet.mergeCells('A1:F1');
  worksheet.getCell('A1').value = 'Platform Performance Report';
  worksheet.getCell('A1').font = { size: 16, bold: true };
  worksheet.getCell('A1').alignment = { horizontal: 'center' };

  // Add report metadata
  worksheet.addRow(['Report ID:', reportData.reportId]);
  worksheet.addRow(['Generated At:', new Date(reportData.generatedAt).toLocaleString()]);
  worksheet.addRow(['Period:', reportData.period]);
  worksheet.addRow(['Scope:', reportData.scope]);
  worksheet.addRow(['Generated By:', `${reportData.generatedBy.name} (${reportData.generatedBy.role})`]);
  worksheet.addRow([]);

  // Add summary statistics
  worksheet.addRow(['SUMMARY STATISTICS']);
  worksheet.addRow(['Metric', 'Value', 'Unit', 'Trend', 'Notes']);
  
  const summaryRows = [
    ['Total Employers', reportData.summary.platformOverview.totalEmployers, 'count', '', ''],
    ['Active Companies', reportData.summary.platformOverview.activeCompanies, 'count', '', ''],
    ['Total Jobs', reportData.summary.platformOverview.totalJobs, 'count', '', ''],
    ['Active Jobs', reportData.summary.platformOverview.activeJobs, 'count', '', ''],
    ['Total Applications', reportData.summary.platformOverview.totalApplications, 'count', '', ''],
    ['Recent Applications', reportData.summary.platformOverview.recentApplications, 'count', '', ''],
    ['Total Candidates', reportData.summary.platformOverview.totalCandidates, 'count', '', ''],
    ['New Candidates', reportData.summary.platformOverview.newCandidates, 'count', '', '']
  ];
  
  summaryRows.forEach(row => worksheet.addRow(row));
  worksheet.addRow([]);

  // Add KPIs
  worksheet.addRow(['KEY PERFORMANCE INDICATORS']);
  worksheet.addRow(['Metric', 'Value', 'Unit', 'Trend', 'Notes']);
  
  const kpiRows = [
    ['Employer Growth', `${reportData.kpis.growthRates.employerGrowth}%`, 'MoM', '📈', ''],
    ['Job Growth', `${reportData.kpis.growthRates.jobGrowth}%`, 'MoM', '📈', ''],
    ['Application Growth', `${reportData.kpis.growthRates.applicationGrowth}%`, 'MoM', '📈', ''],
    ['Candidate Growth', `${reportData.kpis.growthRates.candidateGrowth}%`, 'MoM', '📈', ''],
    ['Application to Shortlist', `${reportData.kpis.conversionRates.applicationToShortlist}%`, 'rate', '', ''],
    ['Shortlist to Acceptance', `${reportData.kpis.conversionRates.shortlistToAcceptance}%`, 'rate', '', ''],
    ['Overall Conversion', `${reportData.kpis.conversionRates.overallConversion}%`, 'rate', '', '']
  ];
  
  kpiRows.forEach(row => worksheet.addRow(row));

  // Style the worksheet
  worksheet.columns = [
    { width: 30 },
    { width: 15 },
    { width: 10 },
    { width: 10 },
    { width: 40 }
  ];

  // Add formatting
  worksheet.getRow(1).height = 25;
  worksheet.getRow(9).font = { bold: true };
  worksheet.getRow(19).font = { bold: true };

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  
  return {
    fileBuffer: buffer,
    fileName: `platform-performance-report-${new Date().toISOString().split('T')[0]}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
}

async function generateSkillsPDFReport(reportData) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const { width, height } = page.getSize();
  
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let y = height - 50;

  // Title
  page.drawText('Skills Demand Analysis Report', {
    x: 50,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.3, 0.6)
  });
  y -= 30;

  // Report metadata
  page.drawText(`Report ID: ${reportData.reportId}`, {
    x: 50,
    y,
    size: 10,
    font
  });
  y -= 15;

  page.drawText(`Generated: ${new Date(reportData.generatedAt).toLocaleString()}`, {
    x: 50,
    y,
    size: 10,
    font
  });
  y -= 15;

  page.drawText(`Period: ${reportData.period}`, {
    x: 50,
    y,
    size: 10,
    font
  });
  y -= 15;

  page.drawText(`Scope: ${reportData.scope}`, {
    x: 50,
    y,
    size: 10,
    font
  });
  y -= 30;

  // Market overview
  page.drawText('Market Overview', {
    x: 50,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2)
  });
  y -= 20;

  const overviewStats = [
    ['Total Skills Analyzed', reportData.marketOverview.totalSkillsAnalyzed],
    ['High Demand Skills', reportData.marketOverview.highDemandSkills],
    ['Balanced Skills', reportData.marketOverview.balancedSkills],
    ['Oversupplied Skills', reportData.marketOverview.oversuppliedSkills],
    ['Avg Salary Premium', `${reportData.marketOverview.avgSalaryPremium}%`],
    ['Avg Success Rate', `${reportData.marketOverview.avgSuccessRate}%`]
  ];

  overviewStats.forEach(([label, value]) => {
    page.drawText(`${label}:`, {
      x: 60,
      y,
      size: 11,
      font
    });
    
    page.drawText(value.toString(), {
      x: 250,
      y,
      size: 11,
      font: fontBold
    });
    y -= 18;
  });

  y -= 20;

  // Top skills table header
  page.drawText('Top Skills Analysis', {
    x: 50,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2)
  });
  y -= 25;

  // Table headers
  const headers = ['Skill', 'Demand', 'Supply', 'D/S', 'Salary', 'Trend'];
  const colX = [50, 150, 220, 290, 340, 420];
  
  headers.forEach((header, i) => {
    page.drawText(header, {
      x: colX[i],
      y,
      size: 10,
      font: fontBold
    });
  });
  y -= 20;

  // Add top 10 skills
  const topSkills = reportData.skillsAnalysis.slice(0, 10);
  
  topSkills.forEach(skill => {
    // Determine color based on demand/supply ratio
    let color = rgb(0, 0, 0);
    if (skill.market.demandSupplyRatio > 3) {
      color = rgb(0.8, 0, 0); // Red for high demand
    } else if (skill.market.demandSupplyRatio < 0.5) {
      color = rgb(0, 0, 0.8); // Blue for oversupply
    }

    page.drawText(skill.skill.substring(0, 15), {
      x: colX[0],
      y,
      size: 9,
      font,
      color
    });
    
    page.drawText(skill.demand.jobCount.toString(), {
      x: colX[1],
      y,
      size: 9,
      font,
      color
    });
    
    page.drawText((skill.supply.candidateCount || 0).toString(), {
      x: colX[2],
      y,
      size: 9,
      font,
      color
    });
    
    page.drawText(skill.market.demandSupplyRatio.toFixed(1), {
      x: colX[3],
      y,
      size: 9,
      font: fontBold,
      color
    });
    
    // page.drawText(`₹${Math.round(skill.market.avgSalary || 0).toLocaleString()}`, {
    page.drawText(`INR ${Math.round(skill.market.avgSalary || 0).toLocaleString()}`, {
      x: colX[4],
      y,
      size: 9,
      font,
      color
    });
    
    page.drawText(skill.market.trend, {
      x: colX[5],
      y,
      size: 9,
      font,
      color
    });
    
    y -= 15;
  });

  // Generate PDF buffer
  const pdfBytes = await pdfDoc.save();
  
  return {
    fileBuffer: Buffer.from(pdfBytes),
    fileName: `skills-demand-report-${new Date().toISOString().split('T')[0]}.pdf`,
    contentType: 'application/pdf'
  };
}

async function generatePDFReport(reportData) {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const { width, height } = page.getSize();
  
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let y = height - 50;

  // Title
  page.drawText('Platform Performance Report', {
    x: 50,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.3, 0.6)
  });
  y -= 30;

  // Report metadata
  page.drawText(`Report ID: ${reportData.reportId}`, {
    x: 50,
    y,
    size: 10,
    font
  });
  y -= 15;

  page.drawText(`Generated: ${new Date(reportData.generatedAt).toLocaleString()}`, {
    x: 50,
    y,
    size: 10,
    font
  });
  y -= 15;

  page.drawText(`Period: ${reportData.period}`, {
    x: 50,
    y,
    size: 10,
    font
  });
  y -= 15;

  page.drawText(`Scope: ${reportData.scope}`, {
    x: 50,
    y,
    size: 10,
    font
  });
  y -= 30;

  // Summary statistics
  page.drawText('Summary Statistics', {
    x: 50,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2)
  });
  y -= 20;

  const summaryStats = [
    ['Total Employers', reportData.summary.platformOverview.totalEmployers],
    ['Active Companies', reportData.summary.platformOverview.activeCompanies],
    ['Total Jobs', reportData.summary.platformOverview.totalJobs],
    ['Active Jobs', reportData.summary.platformOverview.activeJobs],
    ['Total Applications', reportData.summary.platformOverview.totalApplications],
    ['Recent Applications', reportData.summary.platformOverview.recentApplications],
    ['Total Candidates', reportData.summary.platformOverview.totalCandidates],
    ['New Candidates', reportData.summary.platformOverview.newCandidates]
  ];

  summaryStats.forEach(([label, value]) => {
    page.drawText(`${label}:`, {
      x: 60,
      y,
      size: 11,
      font
    });
    
    page.drawText(value.toString(), {
      x: 250,
      y,
      size: 11,
      font: fontBold
    });
    y -= 18;
  });

  y -= 20;

  // KPIs
  page.drawText('Key Performance Indicators', {
    x: 50,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2)
  });
  y -= 20;

  const kpis = [
    ['Employer Growth', `${reportData.kpis.growthRates.employerGrowth}%`],
    ['Job Growth', `${reportData.kpis.growthRates.jobGrowth}%`],
    ['Application Growth', `${reportData.kpis.growthRates.applicationGrowth}%`],
    ['Candidate Growth', `${reportData.kpis.growthRates.candidateGrowth}%`],
    ['Application to Shortlist', `${reportData.kpis.conversionRates.applicationToShortlist}%`],
    ['Shortlist to Acceptance', `${reportData.kpis.conversionRates.shortlistToAcceptance}%`],
    ['Overall Conversion', `${reportData.kpis.conversionRates.overallConversion}%`]
  ];

  kpis.forEach(([label, value]) => {
    page.drawText(`${label}:`, {
      x: 60,
      y,
      size: 11,
      font
    });
    
    page.drawText(value, {
      x: 250,
      y,
      size: 11,
      font: fontBold,
      color: value.includes('📈') ? rgb(0, 0.5, 0) : rgb(0, 0, 0)
    });
    y -= 18;
  });

  // Generate PDF buffer
  const pdfBytes = await pdfDoc.save();
  
  return {
    fileBuffer: Buffer.from(pdfBytes),
    fileName: `platform-performance-report-${new Date().toISOString().split('T')[0]}.pdf`,
    contentType: 'application/pdf'
  };
}


export default hrAdminDashboardController;