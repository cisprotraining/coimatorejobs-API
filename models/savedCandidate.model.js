// models/savedCandidate.model.js
import mongoose from 'mongoose';

const savedCandidateSchema = new mongoose.Schema({
  employer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  candidateProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CandidateProfile',
    required: true,
  },
  notes: {  // Optional: Employer adds notes/tags
    type: String,
    trim: true,
  },
  folder: {  // Optional: Group into folders (future talent pools)
    type: String,
    default: 'General',
  },
}, { timestamps: true });

// Prevent duplicates
savedCandidateSchema.index({ employer: 1, candidate: 1 }, { unique: true });

const SavedCandidate = mongoose.model('SavedCandidate', savedCandidateSchema);
export default SavedCandidate;