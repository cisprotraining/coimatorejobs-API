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
  keywords: {
    type: [String],
    default: [],
  },
}, { timestamps: true });

const Skill = mongoose.model('Skill', skillSchema);

export default Skill;