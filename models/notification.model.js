import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['application_submitted', 'application_reviewed', 'application_selected', 'application_rejected', 'job_alert', 'profile_update', 'email_update'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    jobPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobPost',
    },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobApplication',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    actionUrl: {
      type: String,
    },
    icon: {
      type: String,
      default: 'la-bell',
    },
    color: {
      type: String,
      default: '#2563eb',
    },
  },
  { timestamps: true }
);

// Index for faster queries
notificationSchema.index({ user: 1, isRead: -1, createdAt: -1 });
// Auto-delete notifications after 30 days (MongoDB TTL monitor runs periodically).
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
