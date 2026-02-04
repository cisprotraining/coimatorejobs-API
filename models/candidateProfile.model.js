import mongoose from 'mongoose';
import ResumeAlert from './resumeAlert.model.js';
import { sendResumeAlertEmail } from '../utils/mailer.js';
import { matchResumeToAlert } from '../utils/resumeMatching.js';

const candidateProfileSchema = new mongoose.Schema({
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'createdBy is required'],
    default: function() {
      return this.candidate; 
    }
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
  },
  jobTitle: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true,
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^\+91\d{10}$/, 'Please enter a valid Indian phone number (e.g., +919876543210)'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
  },
  website: {
    type: String,
    trim: true,
    match: [/^(https?:\/\/)?([\w\d-]+\.)+[\w\d]{2,}(\/.*)?$/, 'Please enter a valid URL'],
  },
  currentSalary: {
    type: String,
    // enum: ['< ₹5 LPA', '₹5-10 LPA', '₹10-15 LPA', '₹15-20 LPA', '₹20-30 LPA', '₹30+ LPA'],
  },
  expectedSalary: {
    type: String,
    // enum: ['< ₹5 LPA', '₹5-10 LPA', '₹10-15 LPA', '₹15-20 LPA', '₹20-30 LPA', '₹30+ LPA'],
  },
  experience: {
    type: String,
    required: [false, 'Experience is required'],
    // enum: ['Fresher', '1-3 years', '3-5 years', '5-10 years', '10+ years'],
  },
  age: {
    type: Number,
    min: 18,
    max: 65,
    required: [true, 'Age is required'],
  },
  gender: { type: String, enum: ['Male', 'Female', 'Other', 'No Preference'], default: 'No Preference' },
  educationLevels: {
    type: [String],
    required: [true, 'Education levels are required'],
    // enum: [ '10th', '12th', 'Diploma', 'Bachelor', 'Master', 'Doctorate', 'Other' ],
    // enum: ['High School', 'Diploma', 'Bachelor\'s Degree', 'Master\'s Degree', 'PhD', 'Professional Certification'],
  },
  languages: {
    type: [String],
    required: [true, 'Languages are required'],
    enum: ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Other'],
    // default: [],
  },
  categories: {
    type: [String],
    required: [true, 'Categories are required'],
  },
  allowInSearch: {
    type: Boolean,
    default: true,
  },
  // Approval status from hr-admin or superadmin
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  // Approval status from hr-admin or superadmin
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    default: null
  },
  // timstamp of when the profile was approved
  approvedAt: {
    type: Date,
    default: null
  },
  // rejection reason from hr-admin or superadmin
  rejectionReason: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
  },
  jobType: {
    type: String,
    required: [true, 'Job type is required'],
    enum: ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary'],
  },

  // if employer saving the this candidate for future use
  savedCount: {
    type: Number,
    default: 0,
  },

  // employer viewed count
  profileViews: {
    type: Number,
    default: 0
  },

  dailyViews: [{
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    count: { type: Number, default: 0 },
    unique: { type: Number, default: 0 }
  }],

  uniqueViewers: [{
    viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // employer who viewed
    lastViewed: { type: Date, default: Date.now }
  }],
  socialMedia: {
    facebook: { type: String, trim: true, default: '' },
    twitter: { type: String, trim: true, default: '' },
    linkedin: { type: String, trim: true, default: '' },
    instagram: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
  },
  location: {
    country: { type: String, default: 'India', trim: true },
    city: { type: String, required: [true, 'City is required'], trim: true },
    completeAddress: { type: String, required: [true, 'Complete address is required'], trim: true },
    remoteWork: {
      type: String,
      enum: ['On-site', 'Hybrid', 'Remote', 'Any'],
      default: 'Any'
    },
  },
  profilePhoto: {
    type: String,
    trim: true,
  },
  resume: {
    type: String,
    trim: true,
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Hook for new/updated candidate profile to trigger resume alerts
candidateProfileSchema.post('save', async function (doc) {
  try {
    const alerts = await ResumeAlert.find({ isActive: true }).populate('employer', 'email');

    for (const alert of alerts) {
      if (alert.frequency !== 'Instant') continue;

      const { matched, matchScore } = matchResumeToAlert(doc, alert.criteria);

      console.log(`[ResumeAlert] ${alert.title}: match=${matched}, score=${matchScore}`);

      if (matched && alert.employer.email) {
        await sendResumeAlertEmail({
          recipient: alert.employer.email,
          candidateName: doc.fullName,
          jobTitle: doc.jobTitle,
          profileId: doc._id,
          alert,
          matchScore,
        });
      }
    }
  } catch (error) {
    console.error('Error in CandidateProfile save hook:', error);
  }
});

// Define indexes explicitly
candidateProfileSchema.index({ candidate: 1 }, { unique: true });
candidateProfileSchema.index({ email: 1 }, { unique: true });
candidateProfileSchema.index({ jobTitle: 'text', description: 'text' });
candidateProfileSchema.index({ 'dailyViews.date': 1 });

const CandidateProfile = mongoose.model('CandidateProfile', candidateProfileSchema);

export default CandidateProfile;