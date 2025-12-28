import JobAlert from '../models/jobAlert.model.js';
import JobPost from '../models/jobs.model.js';
import CandidateProfile from '../models/candidateProfile.model.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { sendJobAlertEmail } from '../utils/mailer.js';
import EventEmitter from 'events';

// EventEmitter to handle job alert events (e.g., sending notifications)
const alertEmitter = new EventEmitter();

const jobAlertController = {};

/**
 * Creates a job alert for the logged-in candidate.
 * @route POST /api/v1/notification/job-alerts
 * @access Private (Candidate only)
 * @param {Object} req - Express request object (contains user and alert data)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
jobAlertController.createJobAlert = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const { criteria, frequency } = req.body;

    // Ensure at least one criterion is provided
    if (!criteria || Object.keys(criteria).length === 0) {
      throw new BadRequestError('At least one criterion is required');
    }

    // Optionally pre-fill criteria from candidate's profile if fields are missing
    const profile = await CandidateProfile.findOne({ candidate: candidateId });
    if (profile) {
      criteria.categories = criteria.categories || profile.categories;
      criteria.location = criteria.location || profile.location;
      criteria.experience = criteria.experience || profile.experience;
    }

    // Create and save the new job alert
    const newAlert = new JobAlert({
      candidate: candidateId,
      criteria,
      frequency,
    });

    await newAlert.save();

    return res.status(201).json({
      success: true,
      message: 'Job alert created successfully',
      alert: newAlert,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates an existing job alert for the logged-in candidate.
 * @route PUT /api/v1/notification/job-alerts/:id
 * @access Private (Candidate only)
 * @param {Object} req - Express request object (contains user and update data)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
jobAlertController.updateJobAlert = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const alertId = req.params.id;
    const { criteria, frequency } = req.body;

    // Find alert and check ownership
    const alert = await JobAlert.findById(alertId);
    if (!alert || alert.candidate.toString() !== candidateId.toString()) {
      throw new NotFoundError('Job alert not found or not yours');
    }

    // Update fields if provided
    alert.criteria = criteria || alert.criteria;
    alert.frequency = frequency || alert.frequency;

    await alert.save();

    return res.status(200).json({
      success: true,
      message: 'Job alert updated successfully',
      alert,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deletes a job alert for the logged-in candidate.
 * @route DELETE /api/v1/notification/job-alerts/:id
 * @access Private (Candidate only)
 * @param {Object} req - Express request object (contains user and alert ID)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
jobAlertController.deleteJobAlert = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const alertId = req.params.id;

    // Find alert and check ownership
    const alert = await JobAlert.findById(alertId);
    if (!alert || alert.candidate.toString() !== candidateId.toString()) {
      throw new NotFoundError('Job alert not found or not yours');
    }

    // Delete the alert
    await alert.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Job alert deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lists all active job alerts for the logged-in candidate.
 * @route GET /api/v1/notification/job-alerts
 * @access Private (Candidate only)
 * @param {Object} req - Express request object (contains user info)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
jobAlertController.listJobAlerts = async (req, res, next) => {
  try {
    const candidateId = req.user.id;

    // Get all active alerts for the candidate, sorted by most recent
    const alerts = await JobAlert.find({ candidate: candidateId, isActive: true })
      .select('-__v')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      alerts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mongoose post-save hook for JobPost.
 * Triggers job alert notifications if a new published job matches any alert criteria.
 */
// JobPost.schema.post('save', async function (doc) {
//   if (doc.status !== 'Published') return;

//   // Get all active alerts
//    const alerts = await JobAlert.find({ isActive: true })
//     .populate('candidate', 'email')
//     .populate({
//       path: 'jobPost',
//       populate: { path: 'companyProfile', select: 'companyName' },
//     });

//   // Check each alert to see if the new job matches its criteria
//    for (const alert of alerts) {
//     if (alert.frequency !== 'Instant') continue; // Handle Daily/Weekly separately

//     const matches = matchJobToAlert(doc, alert.criteria);
//     console.log('matches', matches);
    
//     if (matches) {
//       await sendJobAlertEmail({
//         recipient: alert.candidate.email,
//         jobTitle: doc.title,
//         companyName: doc.companyProfile.companyName,
//         jobId: doc._id,
//       });
//     }
//   }
// });


// Hook for new job post to trigger alerts
//old one
// JobPost.schema.post('save', async function (doc) {
//   if (doc.status !== 'Published') return;

//   const alerts = await JobAlert.find({ isActive: true })
//     .populate('candidate', 'email')
//     .populate({
//       path: 'jobPost',
//       populate: { path: 'companyProfile', select: 'companyName' },
//     });

//   for (const alert of alerts) {
//     if (alert.frequency !== 'Instant') continue; // Handle Daily/Weekly separately

//     const matches = matchJobToAlert(doc, alert.criteria);
//     if (matches) {
//       await sendJobAlertEmail({
//         recipient: alert.candidate.email,
//         jobTitle: doc.title,
//         companyName: doc.companyProfile.companyName,
//         jobId: doc._id,
//       });
//     }
//   }


/**
 * Event listener for jobAlert events.
 * Sends notification (e.g., email/SMS) when a job matches a candidate's alert.
 * In production, integrate this with a messaging service (e.g., Nodemailer, Twilio).
 */
alertEmitter.on('jobAlert', async ({ alertId, jobPostId }) => {
  try {
    const alert = await JobAlert.findById(alertId).populate('candidate', 'email');
    const job = await JobPost.findById(jobPostId).populate('companyProfile', 'companyName');
    if (alert && job && alert.candidate.email) {
      console.log(`Event emitter: Sending email for alert ${alertId} to ${alert.candidate.email}`);
      await sendJobAlertEmail({
        recipient: alert.candidate.email,
        jobTitle: job.title,
        companyName: job.companyProfile.companyName,
        jobId: job._id,
      });
    } else {
      console.log(`Event emitter: Skipped for alert ${alertId} (missing data)`);
    }
  } catch (error) {
    console.error('Error in jobAlert emitter:', error.message, error.stack);
  }
});

export default jobAlertController;
