import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
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
  functionalArea: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FunctionalArea',
    required: [true, 'Functional area is required'],
  },
  keywords: {
    type: [String],
    default: [],
  },
}, { timestamps: true });

const Role = mongoose.model('Role', roleSchema);

export default Role;