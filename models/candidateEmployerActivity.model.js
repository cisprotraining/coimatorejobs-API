import mongoose from "mongoose";

const candidateEmployerActivitySchema = new mongoose.Schema(
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
      index: true,
    },
    candidateProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CandidateProfile",
      default: null,
      index: true,
    },
    profileViewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastProfileViewedAt: {
      type: Date,
      default: null,
    },
    resumeDownloadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastResumeDownloadedAt: {
      type: Date,
      default: null,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

candidateEmployerActivitySchema.index({ employer: 1, candidate: 1 }, { unique: true });
candidateEmployerActivitySchema.index({ employer: 1, lastActivityAt: -1 });

const CandidateEmployerActivity = mongoose.model(
  "CandidateEmployerActivity",
  candidateEmployerActivitySchema
);

export default CandidateEmployerActivity;
