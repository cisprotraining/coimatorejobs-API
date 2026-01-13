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

    let employerMatch = {};
    let jobMatch = {};
    let companyMatch = {};

    // For HR-Admin, filter by assigned employers
    if (user.role === 'hr-admin' && user.employerIds && user.employerIds.length > 0) {
      const employerObjectIds = user.employerIds.map(id => new mongoose.Types.ObjectId(id));
      employerMatch._id = { $in: employerObjectIds };
      jobMatch.employer = { $in: user.employerIds };
      companyMatch.employer = { $in: user.employerIds };
    }

    // Get counts
    const [
      totalEmployers,
      activeCompanies,
      totalJobs,
      activeJobs,
      totalApplications,
      recentApplications,
      totalCandidates,
      recentCandidates,
      lastMonthStats,
    ] = await Promise.all([
      // Total employers (active users)
      User.countDocuments({ 
        role: 'employer', 
        isActive: true,
        ...employerMatch 
      }),

      // Approved company profiles
      CompanyProfile.countDocuments({ 
        status: 'approved',
        ...companyMatch 
      }),

      // Total jobs
      JobPost.countDocuments(jobMatch),

      // Active jobs (not expired)
      JobPost.countDocuments({ 
        ...jobMatch,
        applicationDeadline: { $gte: new Date() },
        status: 'Published'
      }),

      // Total applications
      Application.countDocuments(), // Will filter in aggregation if needed

      // Recent applications (last 30 days)
      Application.countDocuments({ 
        createdAt: { $gte: thirtyDaysAgo }
      }),

      // Total candidates
      User.countDocuments({ 
        role: 'candidate', 
        isActive: true 
      }),

      // New candidates (last 30 days)
      User.countDocuments({ 
        role: 'candidate', 
        isActive: true,
        createdAt: { $gte: thirtyDaysAgo }
      }),

      // Last month stats for growth calculation
      getLastMonthStats(user),
    ]);

    // Calculate growth percentages
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

    const stats = {
      // User counts
      totalEmployers,
      totalCandidates,
      newCandidates: recentCandidates,
      
      // Company/Job counts
      activeCompanies,
      totalJobs,
      activeJobs,
      
      // Application counts
      totalApplications,
      recentApplications,
      
      // Growth percentages
      employerGrowth,
      jobGrowth,
      applicationGrowth,
      candidateGrowth,
      
      // Additional metrics
      averageApplicationsPerJob: totalJobs > 0 ? Math.round(totalApplications / totalJobs) : 0,
      jobFillRate: totalJobs > 0 ? Math.round((totalApplications / (totalJobs * 10)) * 100) : 0, // Assuming 10 positions per job avg
      conversionRate: totalApplications > 0 ? Math.round((recentApplications / totalApplications) * 100) : 0,
      
      // Metadata
      scope: user.role === 'hr-admin' ? 'assigned-employers' : 'platform-wide',
      assignedEmployerCount: user.role === 'hr-admin' ? (user.employerIds?.length || 0) : null,
      lastUpdated: new Date(),
    };

    return res.status(200).json({
      success: true,
      stats,
    });
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
    const { period = 'monthly', limit = 10 } = req.query;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let jobMatch = {};

    // For HR-Admin, filter by assigned employers
    if (user.role === 'hr-admin' && user.employerIds && user.employerIds.length > 0) {
      jobMatch.employer = { $in: user.employerIds };
    }

    // Get top performing jobs by applications
    const topJobs = await JobPost.aggregate([
      { $match: jobMatch },
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
                cond: { $gte: ['$$app.createdAt', thirtyDaysAgo] },
              },
            },
          },
          shortlistedCount: {
            $size: {
              $filter: {
                input: '$applications',
                as: 'app',
                cond: { $eq: ['$$app.shortlisted', true] },
              },
            },
          },
          acceptanceRate: {
            $cond: {
              if: { $gt: [{ $size: '$applications' }, 0] },
              then: {
                $multiply: [
                  {
                    $divide: [
                      {
                        $size: {
                          $filter: {
                            input: '$applications',
                            as: 'app',
                            cond: { $eq: ['$$app.status', 'Accepted'] },
                          },
                        },
                      },
                      { $size: '$applications' },
                    ],
                  },
                  100,
                ],
              },
              else: 0,
            },
          },
          employerName: '$employer.name',
          companyName: '$company.companyName',
          positionsRemaining: '$positions.remaining',
          positionsTotal: '$positions.total',
          fillPercentage: {
            $cond: {
              if: { $gt: ['$positions.total', 0] },
              then: {
                $multiply: [
                  {
                    $divide: [
                      { $subtract: ['$positions.total', '$positions.remaining'] },
                      '$positions.total',
                    ],
                  },
                  100,
                ],
              },
              else: 0,
            },
          },
        },
      },
      { $sort: { totalApplications: -1 } },
      { $limit: parseInt(limit) },
    ]);

    // Get job status distribution
    const jobStatusDistribution = await JobPost.aggregate([
      { $match: jobMatch },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalApplications: { $sum: '$applicantCount' },
          avgApplications: { $avg: '$applicantCount' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // console.log("testttttt", jobStatusDistribution);
    

    // Get job type distribution
    // const jobTypeDistribution = await JobPost.aggregate([
    //   { $match: jobMatch },
    //   {
    //     $group: {
    //       _id: '$jobType',
    //       count: { $sum: 1 },
    //       avgSalary: { $avg: { $toDouble: { $substr: ['$offeredSalary', 1, 10] } } },
    //     },
    //   },
    //   { $sort: { count: -1 } },
    // ]);

    const jobTypeDistribution = await JobPost.aggregate([
        { $match: jobMatch },

        // Extract numeric parts safely
        {
            $addFields: {
            salaryNumbers: {
                $regexFindAll: {
                input: "$offeredSalary",
                regex: /[0-9]+(\.[0-9]+)?/g
                }
            }
            }
        },

        // Convert array → average salary (handles ranges)
        {
            $addFields: {
            numericSalary: {
                $cond: [
                { $gt: [{ $size: "$salaryNumbers" }, 0] },
                {
                    $avg: {
                    $map: {
                        input: "$salaryNumbers",
                        as: "s",
                        in: { $toDouble: "$$s.match" }
                    }
                    }
                },
                null
                ]
            }
            }
        },

        // Group by job type
        {
            $group: {
            _id: "$jobType",
            count: { $sum: 1 },
            avgSalary: { $avg: "$numericSalary" }
            }
        },

        { $sort: { count: -1 } }
        ]);


    // Calculate overall metrics
    const totalJobs = await JobPost.countDocuments(jobMatch);
    const totalApplications = await Application.countDocuments();
    const avgApplicationsPerJob = totalJobs > 0 ? Math.round(totalApplications / totalJobs) : 0;

    return res.status(200).json({
      success: true,
      topJobs,
      jobStatusDistribution,
      jobTypeDistribution,
      metrics: {
        totalJobs,
        totalApplications,
        avgApplicationsPerJob,
        avgTimeToFill: 14, // Hardcoded for now, could calculate from job post to closure
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
    const topEmployers = await Application.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          ...applicationMatch,
        },
      },
      {
        $lookup: {
          from: 'jobposts',
          localField: 'jobPost',
          foreignField: '_id',
          as: 'job',
        },
      },
      { $unwind: '$job' },
      {
        $lookup: {
          from: 'users',
          localField: 'job.employer',
          foreignField: '_id',
          as: 'employer',
        },
      },
      { $unwind: '$employer' },
      {
        $lookup: {
          from: 'companyprofiles',
          localField: 'job.employer',
          foreignField: 'employer',
          as: 'company',
        },
      },
      { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$job.employer',
          employerName: { $first: '$employer.name' },
          companyName: { $first: '$company.companyName' },
          totalApplications: { $sum: 1 },
          acceptedApplications: {
            $sum: { $cond: [{ $eq: ['$status', 'Accepted'] }, 1, 0] },
          },
          avgTimeToResponse: { $avg: { $subtract: ['$updatedAt', '$createdAt'] } },
        },
      },
      { $sort: { totalApplications: -1 } },
      { $limit: 5 },
    ]);

    // Format top employers
    const formattedTopEmployers = topEmployers.map(employer => ({
      employerId: employer._id,
      employerName: employer.employerName,
      companyName: employer.companyName || 'N/A',
      totalApplications: employer.totalApplications,
      acceptanceRate: employer.totalApplications > 0 
        ? Math.round((employer.acceptedApplications / employer.totalApplications) * 100)
        : 0,
      avgResponseTime: employer.avgTimeToResponse 
        ? Math.round(employer.avgTimeToResponse / (1000 * 60 * 60 * 24)) // Convert to days
        : 0,
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
    const user = req.user;
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get candidate registration trends
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
      { $limit: parseInt(days) },
    ]);

    // Get candidate profile completion stats
    const profileStats = await CandidateProfile.aggregate([
    {
        $lookup: {
        from: 'users',
        localField: 'candidate',
        foreignField: '_id',
        as: 'user',
        },
    },
    { $unwind: '$user' },
    {
        $group: {
        _id: null,
        totalCandidates: { $sum: 1 },

        withResume: {
            $sum: {
            $cond: [{ $ne: ['$resume', null] }, 1, 0],
            },
        },

        withPhoto: {
            $sum: {
            $cond: [{ $ne: ['$profilePhoto', null] }, 1, 0],
            },
        },

        // ✅ SAFE SKILLS CHECK (array OR missing)
        withSkills: {
            $sum: {
            $cond: [
                {
                $and: [
                    { $isArray: '$skills' },
                    { $gt: [{ $size: '$skills' }, 0] },
                ],
                },
                1,
                0,
            ],
            },
        },

        // ✅ EXPERIENCE IS STRING → check not null & not empty
        withExperience: {
            $sum: {
            $cond: [
                {
                $and: [
                    { $ne: ['$experience', null] },
                    { $ne: ['$experience', ''] },
                ],
                },
                1,
                0,
            ],
            },
        },

        avgProfileCompletion: {
            $avg: { $ifNull: ['$profileCompletion', 0] },
        },
        },
    },
    ]);



    console.log("testtt", profileStats);
    

    // Get top candidate skills in demand
    const topSkills = await CandidateProfile.aggregate([
    {
        $match: {
        skills: { $exists: true, $type: 'array', $ne: [] },
        },
    },
    { $unwind: '$skills' },
    {
        $group: {
        _id: '$skills',
        count: { $sum: 1 },
        },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
    ]);


    // Get candidate application behavior
    const applicationBehavior = await Application.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'candidate',
          foreignField: '_id',
          as: 'candidate',
        },
      },
      { $unwind: '$candidate' },
      {
        $group: {
          _id: '$candidate._id',
          totalApplications: { $sum: 1 },
          avgResponseTime: { $avg: { $subtract: ['$updatedAt', '$createdAt'] } },
          acceptanceRate: {
            $avg: {
              $cond: [{ $eq: ['$status', 'Accepted'] }, 1, 0],
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          avgApplicationsPerCandidate: { $avg: '$totalApplications' },
          candidatesWithMultipleApplications: {
            $sum: { $cond: [{ $gt: ['$totalApplications', 1] }, 1, 0] },
          },
          totalActiveCandidates: { $sum: 1 },
        },
      },
    ]);

    // Format response
    const formattedRegistrationTrends = registrationTrends.map(item => ({
      date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
      registrations: item.count,
    }));

    const profileCompletion = profileStats[0] || {
      totalCandidates: 0,
      withResume: 0,
      withPhoto: 0,
      withSkills: 0,
      withExperience: 0,
      avgProfileCompletion: 0,
    };

    const behaviorStats = applicationBehavior[0] || {
      avgApplicationsPerCandidate: 0,
      candidatesWithMultipleApplications: 0,
      totalActiveCandidates: 0,
    };

    return res.status(200).json({
      success: true,
      registrationTrends: formattedRegistrationTrends,
      profileCompletion: {
        totalCandidates: profileCompletion.totalCandidates,
        resumeUploadRate: Math.round((profileCompletion.withResume / profileCompletion.totalCandidates) * 100) || 0,
        photoUploadRate: Math.round((profileCompletion.withPhoto / profileCompletion.totalCandidates) * 100) || 0,
        skillsAddedRate: Math.round((profileCompletion.withSkills / profileCompletion.totalCandidates) * 100) || 0,
        experienceAddedRate: Math.round((profileCompletion.withExperience / profileCompletion.totalCandidates) * 100) || 0,
        avgCompletionPercentage: Math.round(profileCompletion.avgProfileCompletion) || 0,
      },
      topSkills,
      applicationBehavior: {
        avgApplicationsPerCandidate: Math.round(behaviorStats.avgApplicationsPerCandidate * 100) / 100,
        candidatesWithMultipleApplications: behaviorStats.candidatesWithMultipleApplications,
        activeCandidatesPercentage: profileCompletion.totalCandidates > 0 
          ? Math.round((behaviorStats.totalActiveCandidates / profileCompletion.totalCandidates) * 100)
          : 0,
      },
      periodDays: parseInt(days),
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
                  {
                    case: { $eq: ['$jobType', 'Full-time'] },
                    then: 1000,
                  },
                  {
                    case: { $eq: ['$jobType', 'Part-time'] },
                    then: 500,
                  },
                  {
                    case: { $eq: ['$jobType', 'Contract'] },
                    then: 300,
                  },
                ],
                default: 200,
              },
            },
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

// Helper functions
async function getLastMonthStats(user) {
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  
  let employerMatch = {};
  let jobMatch = {};

  if (user.role === 'hr-admin' && user.employerIds && user.employerIds.length > 0) {
    employerMatch._id = { $in: user.employerIds };
    jobMatch.employer = { $in: user.employerIds };
  }

  const twoMonthsAgo = new Date(lastMonth);
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 1);

  const [
    totalEmployers,
    totalJobs,
    totalApplications,
    totalCandidates,
  ] = await Promise.all([
    User.countDocuments({ 
      role: 'employer', 
      isActive: true,
      createdAt: { $lt: lastMonth },
      ...employerMatch 
    }),
    JobPost.countDocuments({ 
      createdAt: { $lt: lastMonth },
      ...jobMatch 
    }),
    Application.countDocuments({ createdAt: { $lt: lastMonth } }),
    User.countDocuments({ 
      role: 'candidate', 
      isActive: true,
      createdAt: { $lt: lastMonth } 
    }),
  ]);

  return {
    totalEmployers,
    totalJobs,
    totalApplications,
    totalCandidates,
  };
}

function calculateAverageAcceptanceRate(jobs) {
  if (!jobs.length) return 0;
  
  const totalRate = jobs.reduce((sum, job) => sum + job.acceptanceRate, 0);
  return Math.round(totalRate / jobs.length);
}

export default hrAdminDashboardController;