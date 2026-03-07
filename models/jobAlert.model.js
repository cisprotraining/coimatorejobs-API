import mongoose from 'mongoose';

const jobAlertSchema = new mongoose.Schema({
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  criteria: {
    // In jobAlert.model.js → criteria
    title: { type: String, default: 'Untitled Alert' },
    // categories: {
    //   type: [String],
    //   default: [],
    // },
    // --- REPLACED CATEGORIES WITH RELATIONAL FIELDS ---
    industry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Industry',
      required: true,
    },
    functionalAreas: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FunctionalArea',
    }],
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
    },
    // Inside JobAlert criteria schema
    skills: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill'
    }],
    location: {
      country: { type: String, default: 'India' },
      city: { type: String },
    },
    salaryRange: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
    },
    jobType: {
      type: String,
      enum: ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary'],
    },
    experience: {
      type: String,
      enum: ['Less than 1 year', '1-3 years', '3-5 years', '5-10 years', '10+ years'],
    },
    keywords: {
      type: [String],
      default: [],
    },
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
}, { timestamps: true });

// Indexes for efficient querying
jobAlertSchema.index({ candidate: 1 });
jobAlertSchema.index({ 'criteria.industry': 1 }); // Updated index
jobAlertSchema.index({ 'criteria.location.city': 1 });

const JobAlert = mongoose.model('JobAlert', jobAlertSchema);
export default JobAlert;