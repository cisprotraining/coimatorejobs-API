// models/contactInquiry.model.js
import mongoose from 'mongoose';

const contactInquirySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  subject: { type: String, trim: true, default: 'General Inquiry' },
  message: { type: String, required: true, trim: true },
  formType: { type: String, enum: ['general', 'dashboard', 'other'], default: 'general' },
  ipAddress: String,
  userAgent: String,
  submittedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['new', 'read', 'replied', 'archived'], default: 'new' },
});

const ContactInquiry = mongoose.model('ContactInquiry', contactInquirySchema);

export default ContactInquiry;