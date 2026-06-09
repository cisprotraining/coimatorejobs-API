import mongoose from "mongoose";

const employerResumeDownloadLogSchema = new mongoose.Schema(
  {
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    jobPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobPost",
      required: true,
      index: true,
    },
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
      required: true,
      index: true,
    },
    monthKey: {
      type: String,
      required: true,
      index: true,
    },
    downloadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

employerResumeDownloadLogSchema.index({ employer: 1, jobPost: 1, monthKey: 1, downloadedAt: -1 });

const EmployerResumeDownloadLog = mongoose.model(
  "EmployerResumeDownloadLog",
  employerResumeDownloadLogSchema
);

export default EmployerResumeDownloadLog;
