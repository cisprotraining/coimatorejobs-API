import mongoose from 'mongoose';

const savedJobSchema = new mongoose.Schema({
  jobPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobPost',
    required: true,
  },
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

// Prevent duplicate saves
savedJobSchema.index({ jobPost: 1, candidate: 1 }, { unique: true });

const SavedJob = mongoose.model('SavedJob', savedJobSchema);
export default SavedJob;