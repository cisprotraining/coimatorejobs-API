import mongoose from 'mongoose';

const industrySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true, index: true },

  keywords: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },

}, { timestamps: true });

industrySchema.index({ name: 1 });

export default mongoose.model('Industry', industrySchema);
