// models/roleSuggestion.model.js
import mongoose from 'mongoose';

const roleSuggestionSchema = new mongoose.Schema({
  title: { type: String, required: true, unique: true },
  normalizedTitle: { type: String, index: true },
  count: { type: Number, default: 1 },
  approved: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('RoleSuggestion', roleSuggestionSchema);
