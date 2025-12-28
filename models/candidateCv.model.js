// models/candidateCv.model.js
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const candidateCvSchema = new mongoose.Schema({
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  file: {
    type: String,
    required: true, // e.g., /uploads/candidate/abc123.pdf
  },
  originalName: {
    type: String,
    required: true, // Original filename from user
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// Cleanup file on delete
candidateCvSchema.post('deleteOne', { document: true, query: false }, async function () {
  try {
    const filePath = path.join(process.cwd(), 'public', this.file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Error deleting CV file:', err);
  }
});

const CandidateCv = mongoose.model('CandidateCv', candidateCvSchema);

export default CandidateCv;