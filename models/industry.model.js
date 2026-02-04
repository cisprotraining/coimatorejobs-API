import mongoose from 'mongoose';

const industrySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    unique: true,
    trim: true,
  },
  slug: {
    type: String,
    required: [true, 'Slug is required'],
    unique: true,
    trim: true,
  },
  keywords: {
    type: [String],
    default: [],
  },
}, { timestamps: true });

const Industry = mongoose.model('Industry', industrySchema);

export default Industry;