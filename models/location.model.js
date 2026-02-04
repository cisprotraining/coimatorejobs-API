import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
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
  state: {
    type: String,
    trim: true,
  },
  keywords: {
    type: [String],
    default: [],
  },
}, { timestamps: true });

const Location = mongoose.model('Location', locationSchema);

export default Location;