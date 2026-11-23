import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  employer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  companyProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyProfile', required: true },
  companyName: { type: String, required: true, maxlength: 200 },
  authorName: { type: String, required: true, maxlength: 100 },
  designation: { type: String, trim: true, maxlength: 80, default: '' },
  rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
  message: { type: String, required: true, trim: true, minlength: 30, maxlength: 200 },
  publishConsent: { type: Boolean, required: true },
  isVisible: { type: Boolean, default: true },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null },
  deletedByEmployer: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ deletedAt: 1, isVisible: 1, rating: 1, createdAt: -1 });
export default mongoose.model('EmployerFeedback', schema);
