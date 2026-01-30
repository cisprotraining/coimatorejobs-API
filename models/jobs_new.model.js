import mongoose from 'mongoose';
import JobAlert from './jobAlert.model.js';
import { sendJobAlertEmail } from '../utils/mailer.js';

const jobPostSchema = new mongoose.Schema({
  employer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Employer is required'],
  },
  companyProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyProfile',
    required: [true, 'Company profile is required'],
  },
  title: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Job description is required'],
    trim: true,
  },
  contactEmail: {
    type: String,
    required: [true, 'Contact email is required'],
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
  },
  contactUsername: {
    type: String,
    trim: true,
  },
  specialisms: {
    type: [String],
    required: [true, 'At least one specialism is required'],
  },
  jobType: {
    type: String,
    required: [true, 'Job type is required'],
    // Removed strict enum to allow flexible frontend values (Full-time, Part-time, etc.)
  },
  offeredSalary: {
    type: String,
    required: [true, 'Offered salary is required'],
    // Removed strict enum to support custom range strings: "5 Lakhs - 10 Lakhs"
  },
  careerLevel: {
    type: String,
    required: [true, 'Career level is required'],
  },
  experience: {
    type: String,
    required: [true, 'Experience is required'],
    // Support for "Freshers", "1-3 Years", etc.
  },
  gender: {
    type: String,
    default: 'No Preference',
  },
  industry: {
    type: String,
    required: [true, 'Industry is required'],
    trim: true,
  },
  qualification: {
    type: String,
    required: [true, 'Qualification is required'],
    // Support for "B.E / B.Tech", "MBA / PGDM", etc.
  },
  applicationDeadline: {
    type: Date,
    required: [true, 'Application deadline is required'],
  },
  positions: {
    total: {
      type: Number,
      required: [true, 'Number of positions is required'],
      min: 1,
    },
    remaining: {
      type: Number,
      default: function() { return this.total; }, 
    },
  },
  applicantCount: {
    type: Number,
    default: 0,
  },
  location: {
    country: { type: String, required: [true, 'Country is required'], trim: true },
    city: { type: String, required: [true, 'City is required'], trim: true },
    completeAddress: { type: String, required: [true, 'Complete address is required'], trim: true },
  },
  remoteWork: {
    type: String,
    default: 'On-site',
  },
  status: {
    type: String,
    enum: ['Draft', 'Published', 'Closed'],
    default: 'Published',
  },
  profileViews: { type: Number, default: 0 },
  dailyViews: [{
    date: String,
    count: { type: Number, default: 0 },
    unique: { type: Number, default: 0 } 
  }],
  uniqueViewers: [{
    viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastViewed: { type: Date, default: Date.now }
  }],
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    default: function() { return this.employer; } 
  }
}, { timestamps: true });

// --- MIDDLEWARE & HOOKS ---

/**
 * Mongoose post-save hook for JobPost.
 * Triggers job alert notifications if a new published job matches any alert criteria.
 */
jobPostSchema.post('save', async function (doc) {
  try {
    if (doc.status !== 'Published') return;

    // Populate company name for the email template
    const populatedDoc = await mongoose.model('JobPost')
      .findById(doc._id)
      .populate('companyProfile', 'companyName');

    const alerts = await JobAlert.find({ isActive: true }).populate('candidate', 'email');
    
    for (const alert of alerts) {
      if (alert.frequency !== 'Instant') continue;

      const matches = matchJobToAlert(populatedDoc, alert.criteria);
      if (matches && alert.candidate?.email) {
        await sendJobAlertEmail({
          recipient: alert.candidate.email,
          jobTitle: populatedDoc.title,
          companyName: populatedDoc.companyProfile.companyName,
          jobId: populatedDoc._id,
        });
      }
    }
  } catch (err) {
    console.error('Error in jobPost save hook:', err);
  }
});

/**
 * Determines if a job post matches the alert criteria.
 * Note: Since we use string-based salary, this uses a simple match or fallback.
 */
function matchJobToAlert(job, criteria) {
  // Category match
  if (criteria.categories?.length > 0 &&
      !criteria.categories.some(cat => job.specialisms.includes(cat))) return false;

  // Location match
  if (criteria.location?.city && criteria.location.city !== job.location.city) return false;

  // Job Type match
  if (criteria.jobType && criteria.jobType !== job.jobType) return false;
  
  // Experience match
  if (criteria.experience && criteria.experience !== job.experience) return false;

  // Simple Keyword match in Title/Description
  if (criteria.keywords?.length > 0 &&
      !criteria.keywords.some(kw => 
        job.title.toLowerCase().includes(kw.toLowerCase()) || 
        job.description.toLowerCase().includes(kw.toLowerCase())
      )) return false;

  return true;
}

const JobPost = mongoose.model('JobPost', jobPostSchema);
export default JobPost;