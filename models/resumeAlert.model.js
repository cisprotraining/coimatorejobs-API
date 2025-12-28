import mongoose from 'mongoose';

const resumeAlertSchema = new mongoose.Schema({
  employer: {
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true,
  },
  criteria: {
    categories: {
      type: [String],
      default: [],
    },
    location: {
      country: { type: String, default: 'India' },
      city: { type: String },
    },
    salaryRange: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
    },
    experience: {
      type: String,
      enum: ['Less than 1 year', '1-3 years', '3-5 years', '5-10 years', '10+ years'],
    },
    educationLevels: {
      type: [String],
      enum : [ '10th', '12th', 'Diploma', 'Bachelor', 'Master', 'Doctorate', 'Other' ]
      // enum: ['High School', 'Diploma', "Bachelor's Degree", "Master's Degree", 'PhD', 'Professional Certification'],
    },
    skills: {
      type: [String],
      default: [],
    },
    diversity: {
      gender: {
        type: String,
        enum: ['Male', 'Female', 'Other', 'No Preference'],
        default: 'No Preference',
      },
      ageRange: {
        min: { type: Number, min: 18 },
        max: { type: Number, max: 65 },
      },
    },
    remoteWork: {
      type: String,
      enum: ['On-site', 'Hybrid', 'Remote', 'Any'],
      default: 'Any'
    },
    keywords: {
      type: [String],
      default: [],
    },
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  frequency: {
    type: String,
    enum: ['Daily', 'Weekly', 'Instant'],
    default: 'Daily',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  matchingCount: {
    type: Number,
    default: 0,
  },
  stats: {
    // Added for tracking alert performance
    emailsSent: { type: Number, default: 0 },
    totalMatches: { type: Number, default: 0 },
    lastMatch: { type: Date },
  },
}, { timestamps: true });

// Indexes for efficient querying
resumeAlertSchema.index({ employer: 1 });
resumeAlertSchema.index({ 'criteria.categories': 1 });
resumeAlertSchema.index({ 'criteria.skills': 1 });
resumeAlertSchema.index({ 'criteria.location.city': 1 });

const ResumeAlert = mongoose.model('ResumeAlert', resumeAlertSchema);

export default ResumeAlert;