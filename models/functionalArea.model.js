import mongoose from 'mongoose';

const functionalAreaSchema = new mongoose.Schema({
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
  industry: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Industry',
    required: [true, 'Industry is required'], // For hierarchy: Function under Industry
  },
  keywords: {
    type: [String],
    default: [],
  },
}, { timestamps: true });

const FunctionalArea = mongoose.model('FunctionalArea', functionalAreaSchema);

export default FunctionalArea;