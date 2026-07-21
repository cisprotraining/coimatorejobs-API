import mongoose from 'mongoose';

const fcmTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    platform: {
      type: String,
      enum: ['web', 'android', 'ios'],
      default: 'web',
    },
    userAgent: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

fcmTokenSchema.index({ user: 1, token: 1 });

const FcmToken = mongoose.model('FcmToken', fcmTokenSchema);

export default FcmToken;
