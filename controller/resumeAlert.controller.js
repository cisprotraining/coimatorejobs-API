import ResumeAlert from '../models/resumeAlert.model.js'; 
import CandidateProfile from '../models/candidateProfile.model.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { sendResumeAlertEmail } from '../utils/mailer.js';
import { matchResumeToAlert } from '../utils/resumeMatching.js'; 
import EventEmitter from 'events';

const alertEmitter = new EventEmitter();

const resumeAlertController = {};

/**
 * Creates a resume alert for the logged-in employer.
 * @route POST /api/v1/employer/resume-alerts
 * @access Private (Employer only)
 */
resumeAlertController.createResumeAlert = async (req, res, next) => {
  try {
    const employerId = req.user.id;
    const { title, criteria, frequency } = req.body;

    if (!title || !criteria || Object.keys(criteria).length === 0) {
      throw new BadRequestError('Title and at least one criterion are required');
    }

    const alertCount = await ResumeAlert.countDocuments({ employer: employerId });
    if (alertCount >= 5) {
      throw new BadRequestError('Maximum 5 resume alerts allowed per employer');
    }

    const newAlert = new ResumeAlert({
      employer: employerId,
      title,
      criteria,
      frequency,
    });

    await newAlert.save();

    return res.status(201).json({
      success: true,
      message: 'Resume alert created successfully',
      alert: newAlert,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates an existing resume alert for the logged-in employer.
 * @route PUT /api/v1/employer/resume-alerts/:id
 * @access Private (Employer only)
 */
resumeAlertController.updateResumeAlert = async (req, res, next) => {
  try {
    const employerId = req.user.id;
    const alertId = req.params.id;
    const { title, criteria, frequency } = req.body;

    const alert = await ResumeAlert.findById(alertId);
    if (!alert || alert.employer.toString() !== employerId.toString()) {
      throw new NotFoundError('Resume alert not found or not yours');
    }

    alert.title = title || alert.title;
    alert.criteria = criteria || alert.criteria;
    alert.frequency = frequency || alert.frequency;

    await alert.save();

    return res.status(200).json({
      success: true,
      message: 'Resume alert updated successfully',
      alert,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deletes a resume alert for the logged-in employer.
 * @route DELETE /api/v1/employer/resume-alerts/:id
 * @access Private (Employer only)
 */
resumeAlertController.deleteResumeAlert = async (req, res, next) => {
  try {
    const employerId = req.user.id;
    const alertId = req.params.id;

    const alert = await ResumeAlert.findById(alertId);
    if (!alert || alert.employer.toString() !== employerId.toString()) {
      throw new NotFoundError('Resume alert not found or not yours');
    }

    await alert.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Resume alert deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lists all resume alerts for the logged-in employer.
 * @route GET /api/v1/employer/resume-alerts
 * @access Private (Employer only)
 */
resumeAlertController.listResumeAlerts = async (req, res, next) => {
  try {
    const employerId = req.user.id;

    // 1️⃣ Fetch alerts for employer
    const alerts = await ResumeAlert.find({ employer: employerId, isActive: true })
      .select('-__v')
      .sort({ createdAt: -1 });

    // 2️⃣ If no alerts, respond early
    if (!alerts.length) {
      return res.status(200).json({
        success: true,
        message: 'No resume alerts found for this employer.',
        alerts: [],
      });
    }

    // 3️⃣ Enrich alerts with matching candidate count
    const formattedAlerts = await Promise.all(
      alerts.map(async (alert) => {
        const matchingCount = await CandidateProfile.countDocuments({
          isActive: true,
          allowInSearch: true,
          categories: {
            $in: alert.criteria.categories.length > 0
              ? alert.criteria.categories
              : [/.*/],
          },
          'location.city':
            alert.criteria.location?.city || { $exists: true },
          experience:
            alert.criteria.experience || { $exists: true },
          skills: {
            $in: alert.criteria.skills.length > 0
              ? alert.criteria.skills
              : [/.*/],
          },
        });
        return {
          ...alert.toJSON(),
          matchingCount,
        };
      })
    );

    // 4️⃣ Return formatted result
    return res.status(200).json({
      success: true,
      count: formattedAlerts.length,
      alerts: formattedAlerts,
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Gets matching candidate profiles for a specific resume alert.
 * @route GET /api/v1/employer/resume-alerts/:alertid/matches
 * @access Private (Employer, Admin, Superadmin)
 */
resumeAlertController.getAlertMatches = async (req, res, next) => {
  try {
    const employerId = req.user.id;
    const alertId = req.params.id;
    const { page = 1, limit = 10 } = req.query;

    const alert = await ResumeAlert.findById(alertId);
    if (!alert || alert.employer.toString() !== employerId.toString()) {
      throw new NotFoundError('Resume alert not found or not yours');
    }

    // Fetch all active candidate profiles
    const allProfiles = await CandidateProfile.find({
      isActive: true,
      allowInSearch: true,
    });
    
    // Apply liberal matching using the same logic
    const matches = allProfiles
      .map(profile => {
        const { matched, matchScore } = matchResumeToAlert(profile, alert.criteria);
        return matched ? { ...profile.toObject(), matchScore } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.matchScore - a.matchScore);


    if (!matches.length) {
      throw new NotFoundError('No Candidate are available for matching');
    }

    // console.log("krferkufyevfuir", matches);

    // Pagination
    const startIndex = (page - 1) * limit;
    const paginated = matches.slice(startIndex, startIndex + parseInt(limit));

    return res.status(200).json({
      success: true,
      matches: paginated.map(p => ({
        id: p._id,
        fullName: p.fullName,
        jobTitle: p.jobTitle,
        location: p.location?.city || 'N/A',
        expectedSalary: p.expectedSalary || 'N/A',
        experience: p.experience || 'N/A',
        categories: p.categories || [],
        matchScore: p.matchScore?.toFixed(1),
        profilePhoto: p.profilePhoto || '/default-avatar.jpg',
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(matches.length / limit),
        total: matches.length,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    next(error);
  }
};


// Event listener for resume alerts
alertEmitter.on('resumeAlert', async ({ alertId, profileId }) => {
  try {
    const alert = await ResumeAlert.findById(alertId).populate('employer', 'email');
    const profile = await CandidateProfile.findById(profileId);
    if (alert && profile && alert.employer.email) {
      const matches = matchResumeToAlert(profile, alert.criteria);
      if (matches) {
        await sendResumeAlertEmail({
          recipient: alert.employer.email,
          candidateName: profile.fullName,
          jobTitle: profile.jobTitle,
          profileId: profile._id,
          alert,
        });
        await ResumeAlert.findByIdAndUpdate(alertId, { $inc: { matchingCount: 1 } });
      }
    }
  } catch (error) {
    console.error('Error in resumeAlert emitter:', error);
  }
});

export default resumeAlertController;