import mongoose from 'mongoose';

const skillSchema = new mongoose.Schema({
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
  category: {
    type: String,
    trim: true,
    index: true, // important for SEO & filters
  },
  keywords: {
    type: [String],
    default: [],
  },
  isActive: { type: Boolean, default: true }, 
}, { timestamps: true });

// Full-text for SEO/search
skillSchema.index({ name: 'text', keywords: 'text' });

const Skill = mongoose.model('Skill', skillSchema);

export default Skill;