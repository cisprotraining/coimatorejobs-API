import mongoose from 'mongoose';

const demandCandidateSchema = new mongoose.Schema({
  employer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  companyProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyProfile',
    required: true,
    index: true,
  },
  roleTitle: {
    type: String,
    required: [true, 'Role title is required'],
    trim: true,
    minlength: 2,
    maxlength: 120,
  },
  jobPostTitle: {
    type: String,
    trim: true,
    maxlength: 160,
  },
  similarCandidateRoles: {
    type: [String],
    default: [],
  },
  searchQuery: {
    type: String,
    trim: true,
    maxlength: 250,
  },
  location: {
    type: String,
    trim: true,
    maxlength: 120,
  },
  experience: {
    type: String,
    trim: true,
    maxlength: 80,
  },
  skills: {
    type: [String],
    default: [],
  },
  note: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'candidates_available', 'closed'],
    default: 'pending',
    index: true,
  },
  adminNote: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
  statusUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  statusUpdatedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

demandCandidateSchema.index({ companyProfile: 1, createdAt: -1 });
demandCandidateSchema.index({ employer: 1, status: 1 });

const DemandCandidate = mongoose.model('DemandCandidate', demandCandidateSchema);

export default DemandCandidate;
