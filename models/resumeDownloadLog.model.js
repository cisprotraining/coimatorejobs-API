import mongoose from "mongoose";

const resumeDownloadLogSchema = new mongoose.Schema(
  {
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    dayKey: {
      type: String,
      required: true,
      index: true,
    },
    downloadedAt: {
      type: Date,
      default: Date.now,
    },
    downloadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

resumeDownloadLogSchema.index({ employer: 1, dayKey: 1, downloadedAt: -1 });

const ResumeDownloadLog = mongoose.model("ResumeDownloadLog", resumeDownloadLogSchema);

export default ResumeDownloadLog;
