import mongoose from 'mongoose';

const functionalAreaSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true },

  industry: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Industry',
    default: null, // global allowed
    index: true,
  },

  isGlobal: {
    type: Boolean,
    default: false,
    index: true,
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },

  priority: {
    type: Number,
    default: 0,
  },

  keywords: { type: [String], default: [] },

}, { timestamps: true });

// Composite unique
functionalAreaSchema.index({ name: 1, industry: 1 }, { unique: true });

/**
 * real-world unique constraint
 * Same FA name allowed in different industries
 */
functionalAreaSchema.index(
  { name: 1, industry: 1 },
  { unique: true }
);

export default mongoose.model('FunctionalArea', functionalAreaSchema);