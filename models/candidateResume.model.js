import mongoose from 'mongoose';
import ResumeAlert from './resumeAlert.model.js';
import { sendResumeAlertEmail } from '../utils/mailer.js';
import { matchResumeToAlert } from '../utils/resumeMatching.js';
import { createNotification, notificationPresets } from '../utils/notificationHelper.js';
import { sendPushToUsers } from '../utils/fcm.js';

const educationSchema = new mongoose.Schema({
  institution: String,
  degree: String,
  fieldOfStudy: String,
  startDate: Date,
  endDate: Date,
  current: Boolean,
  grade: String,
  description: String,
  _id: false
});

const experienceSchema = new mongoose.Schema({
  company: String,
  position: String,
  employmentType: {
    type: String,
    enum: ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'],
    default: null
  },
  location: String,
  startDate: Date,
  endDate: Date,
  current: Boolean,
  description: String,
  achievements: [String],
  skills: [String],
  _id: false
});

const awardSchema = new mongoose.Schema({
  title: String,
  issuer: String,
  date: Date,
  description: String,
  _id: false
});

const portfolioSchema = new mongoose.Schema({
  file: { type: String, required: true }, // Path to uploaded file
  title: { type: String, required: true },
  description: { type: String, trim: true },
  _id: false
});

const candidateResumeSchema = new mongoose.Schema({
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  profile: {                     //Link to main profile
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CandidateProfile',
    required: true,
  },
  title: { type: String, required: true }, // e.g., "My Professional Resume"
  description: { type: String, trim: true }, // Overall summary
  template: {
    type: String,
    enum: ['professional', 'modern', 'creative', 'minimalist'],
    default: 'professional'
  },
  // old fields from candidate profile for quick access and searchability (denormalization)
  // personalInfo: {
  //   fullName: String,
  //   professionalTitle: String,
  //   email: String,
  //   phone: String,
  //   location: {
  //     city: String,
  //     country: String
  //   },
  //   profilePhoto: String,
  //   portfolioUrl: String,
  //   linkedInUrl: String,
  //   githubUrl: String,
  //   summary: String
  // },
  // Resume content (can override profile data)
  personalInfo: Object,
  education: [educationSchema],
  experience: [experienceSchema],
  awards: [awardSchema],
  skills: {
      type: [String], // <--- Change to String to accept ["PHP", "Node.js"]
      default: [],
  },
  portfolio: [portfolioSchema],
  preferences: {
    // visibility: {
    //   type: String,
    //   enum: ['private', 'employers-only', 'public'],
    //   default: 'private'
    // },
    jobTypes: [String],
    locations: [String],
    // salaryExpectation: {
    //   min: Number,
    //   max: Number,
    //   currency: { type: String, default: 'INR' } // Default to Indian Rupees
    // }
  },
  // for future use (subscription-based features)
  subscription: {
    plan: { type: String, enum: ['free', 'basic', 'premium'], default: 'free' },
    resumeLimit: { type: Number, default: 2 }
  },
  atsScore: { type: Number, default: 0 }, // ATS score (calculated)
  isActive: { type: Boolean, default: true },
  isPrimary: { type: Boolean, default: false }, // Primary resume for quick access
}, { timestamps: true });

// Hook for new/updated candidate profile to trigger resume alerts
candidateResumeSchema.post('save', async function (doc) {
  try {
    const alerts = await ResumeAlert.find({ isActive: true }).populate('employer', '_id email');

    for (const alert of alerts) {
      if (alert.frequency !== 'Instant') continue;

      const { matched, matchScore } = matchResumeToAlert(doc, alert.criteria);
      console.log(`[ResumeAlert] ${alert.title}: matched=${matched}, score=${matchScore}`);

      if (matched && alert.employer?.email) {
        const candidateName = doc.personalInfo?.fullName || 'Unnamed Candidate';
        const jobTitle = doc.personalInfo?.professionalTitle || 'Not Specified';
        const profileId = doc.profile || doc._id;

        await sendResumeAlertEmail({
          recipient: alert.employer.email,
          candidateName,
          jobTitle,
          profileId,
          alert,
          matchScore,
        });

        const notificationPayload = {
          ...notificationPresets.emailUpdate(
            'New Candidate Resume Match',
            `${candidateName} matched your alert "${alert.title}".`
          ),
          actionUrl: `/candidates-single/${profileId}`,
          icon: 'la-file-alt',
          color: '#22c55e',
        };

        await createNotification(alert.employer._id, 'email_update', notificationPayload);
        await sendPushToUsers([alert.employer._id], {
          title: notificationPayload.title,
          body: notificationPayload.description,
          link: `${process.env.FRONTEND_URL}${notificationPayload.actionUrl}`,
          data: {
            type: 'resume_alert_match',
            profileId,
            alertId: alert._id,
            actionUrl: notificationPayload.actionUrl,
          },
        });
      }
    }
  } catch (error) {
    console.error('Error in CandidateResume save hook:', error);
  }
});


// Indexes for efficient queries
candidateResumeSchema.index({ isPrimary: 1, candidate: 1 });
candidateResumeSchema.index({ profile: 1 });

const CandidateResume = mongoose.model('CandidateResume', candidateResumeSchema);

export default CandidateResume;
