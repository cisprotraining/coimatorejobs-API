import mongoose from "mongoose";
import CandidateProfile from "../models/candidateProfile.model.js";
import User from '../models/user.model.js';
import JobPost from '../models/jobs.model.js';
import JobApply from "../models/jobApply.model.js";
import SavedJob from '../models/savedJob.model.js';
import { ForbiddenError, BadRequestError, NotFoundError } from "../utils/errors.js";
import { sendCandidateProfileStatusEmail, sendSuperadminAlertEmail, sendProfileDeletionEmail } from '../utils/mailer.js';
import { SUPERADMIN_EMAIL } from "../config/env.js";
import fs from 'fs';
import path from 'path';
import natural from 'natural';

const candidateController = {};

// Helper to handle Array/JSON parsing from FormData consistently
const parseField = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    return [val];
  }
};

candidateController.getAllCandidateProfiles = async (req, res, next) => {
  try {
    const profiles = await CandidateProfile.find().select('-__v');
    return res.status(200).json({ success: true, profiles });
  } catch (error) {
    next(error);
  }
};

candidateController.createCandidateProfile = async (req, res, next) => {
  try {
    const loggedInUserId = req.user?._id || req.user?.id;
    const { role } = req.user;

    if (!loggedInUserId) throw new BadRequestError('User session not found');
    
    // Parse the 'data' blob sent from frontend
    let profileData = req.body.data ? JSON.parse(req.body.data) : req.body;
    
    let candidateId = (['hr-admin', 'superadmin'].includes(role) && profileData.candidateId) 
                      ? profileData.candidateId 
                      : loggedInUserId;
    
    const targetUser = await User.findById(candidateId);
    if (!targetUser || targetUser.role !== 'candidate') throw new BadRequestError('Invalid target user');
    if (targetUser.status !== 'approved') throw new BadRequestError('Candidate not approved');
    
    const existingProfile = await CandidateProfile.findOne({ candidate: candidateId });
    if (existingProfile) throw new BadRequestError('Profile already exists');
    
    const files = req.files || {};
    const profilePhoto = files.profilePhoto ? `/uploads/candidate/${files.profilePhoto[0].filename}` : null;
    const resume = files.resume ? `/uploads/candidate/${files.resume[0].filename}` : null;

    const isAdminCreator = ['hr-admin', 'superadmin'].includes(role);

    const newProfile = new CandidateProfile({
      candidate: candidateId,
      createdBy: loggedInUserId, // This satisfies the "createdBy required" validation
      status: isAdminCreator ? 'approved' : 'pending',
      approvedBy: isAdminCreator ? loggedInUserId : null,
      approvedAt: isAdminCreator ? new Date() : null,
      fullName: profileData.fullName,
      jobTitle: profileData.jobTitle,
      phone: profileData.phone,
      email: profileData.email,
      website: profileData.website,
      currentSalary: profileData.currentSalary,
      expectedSalary: profileData.expectedSalary,
      experience: profileData.experience,
      age: profileData.age,
      gender: profileData.gender,
      description: profileData.description,
      jobType: profileData.jobType,
      allowInSearch: profileData.allowInSearch ?? true,
      educationLevels: parseField(profileData.educationLevels),
      languages: parseField(profileData.languages),
      categories: parseField(profileData.categories),
      socialMedia: typeof profileData.socialMedia === 'string' ? JSON.parse(profileData.socialMedia) : (profileData.socialMedia || {}),
      location: typeof profileData.location === 'string' ? JSON.parse(profileData.location) : (profileData.location || {}),
      profilePhoto,
      resume
    });

    await newProfile.save();

    await sendCandidateProfileStatusEmail({
      recipient: targetUser.email,
      name: targetUser.name,
      status: newProfile.status,
      dashboardUrl: `${process.env.FRONTEND_URL}/candidate/dashboard`
    });

    return res.status(201).json({ success: true, message: 'Created successfully', profile: newProfile });
  } catch (error) {
    if (req.files) {
      Object.values(req.files).flat().forEach(file => {
        const filePath = path.join(process.cwd(), 'public', 'uploads', 'candidate', file.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }
    next(error);
  }
};

candidateController.updateCandidateProfile = async (req, res, next) => {
  try {
    const profileId = req.params.id;
    const loggedInUserId = req.user?._id || req.user?.id;

    // IMPORTANT: Parse the 'data' blob first
    let profileData = req.body.data ? JSON.parse(req.body.data) : req.body;

    const profile = await CandidateProfile.findById(profileId);
    if (!profile) throw new NotFoundError('Candidate profile not found');

    // Permission check
    if (req.user.role !== 'superadmin' && req.user.role !== 'hr-admin' && profile.candidate.toString() !== loggedInUserId.toString()) {
      throw new ForbiddenError('No permission to update this profile');
    }

    // Explicitly set these to ensure Mongoose validation passes
    profile.createdBy = profile.createdBy || loggedInUserId;

    // Handle File replacements
    const files = req.files || {};
    if (files.profilePhoto) {
      if (profile.profilePhoto) {
        const oldPath = path.join(process.cwd(), 'public', profile.profilePhoto);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      profile.profilePhoto = `/uploads/candidate/${files.profilePhoto[0].filename}`;
    }
    if (files.resume) {
      if (profile.resume) {
        const oldPath = path.join(process.cwd(), 'public', profile.resume);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      profile.resume = `/uploads/candidate/${files.resume[0].filename}`;
    }

    // Update fields from profileData
    const fields = ['fullName', 'jobTitle', 'phone', 'email', 'website', 'currentSalary', 'expectedSalary', 'experience', 'age', 'gender', 'jobType', 'description', 'allowInSearch'];
    fields.forEach(field => {
      if (profileData[field] !== undefined) profile[field] = profileData[field];
    });

    // Update parsed objects and arrays
    if (profileData.educationLevels) profile.educationLevels = parseField(profileData.educationLevels);
    if (profileData.languages) profile.languages = parseField(profileData.languages);
    if (profileData.categories) profile.categories = parseField(profileData.categories);
    
    profile.socialMedia = typeof profileData.socialMedia === 'string' ? JSON.parse(profileData.socialMedia) : (profileData.socialMedia || profile.socialMedia);
    profile.location = typeof profileData.location === 'string' ? JSON.parse(profileData.location) : (profileData.location || profile.location);

    await profile.save();

    return res.status(200).json({ success: true, message: 'Updated successfully', profile });
  } catch (error) {
    if (req.files) {
      Object.values(req.files).flat().forEach(file => {
        const filePath = path.join(process.cwd(), 'public', 'uploads', 'candidate', file.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }
    next(error);
  }
};

candidateController.getCandidateProfile = async (req, res, next) => {
  try {
    const profileId = req.params.id;
    const profile = await CandidateProfile.findById(profileId).select('-__v');
    if (!profile) throw new NotFoundError('Candidate profile not found');

    if (req.user.role !== 'superadmin' && req.user.role !== 'employer' && req.user.role !== 'hr-admin' && profile.candidate.toString() !== req.user.id.toString()) {
      throw new ForbiddenError('Access denied');
    }

    return res.status(200).json({ success: true, profile });
  } catch (error) {
    next(error);
  }
};

candidateController.getCandidateProfilesForCandidate = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const profiles = await CandidateProfile.find({ candidate: candidateId }).select('-__v');
    return res.status(200).json({ success: true, profiles });
  } catch (error) {
    next(error);
  }
};

candidateController.deleteCandidateProfile = async (req, res, next) => {
  try {
    const profileId = req.params.id;
    const profile = await CandidateProfile.findById(profileId);
    if (!profile) throw new NotFoundError('Profile not found');

    const isAdmin = ['superadmin', 'hr-admin'].includes(req.user.role);
    const isOwner = profile.candidate.toString() === req.user.id.toString();
    if (!isAdmin && !isOwner) throw new ForbiddenError('Permission denied');

    if (profile.profilePhoto) {
      const p = path.join(process.cwd(), 'public', profile.profilePhoto);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    if (profile.resume) {
      const r = path.join(process.cwd(), 'public', profile.resume);
      if (fs.existsSync(r)) fs.unlinkSync(r);
    }

    await CandidateProfile.findByIdAndDelete(profileId);
    return res.status(200).json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    next(error);
  }
};

candidateController.approveCandidateProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const profile = await CandidateProfile.findById(id);
    if (!profile) throw new NotFoundError('Profile not found');

    profile.status = status;
    profile.approvedBy = req.user.id;
    profile.approvedAt = new Date();
    profile.rejectionReason = status === 'rejected' ? rejectionReason : null;

    await profile.save();
    return res.status(200).json({ success: true, message: `Profile ${status}`, profile });
  } catch (error) {
    next(error);
  }
};

candidateController.getPendingCandidateProfiles = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const filter = { status: 'pending' };
    const profiles = await CandidateProfile.find(filter)
      .populate('candidate', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await CandidateProfile.countDocuments(filter);
    return res.status(200).json({ success: true, profiles, total });
  } catch (error) {
    next(error);
  }
};

candidateController.getAllJobPosts = async (req, res, next) => {
  try {
    const jobPosts = await JobPost.find({ status: 'Published' }).populate('companyProfile', 'companyName logo');
    return res.status(200).json({ success: true, jobPosts });
  } catch (error) {
    next(error);
  }
};

candidateController.applyToJob = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const jobPostId = req.params.jobId;
    const jobPost = await JobPost.findById(jobPostId);
    
    if (!jobPost || jobPost.status !== 'Published') throw new NotFoundError('Job not available');
    
    const profile = await CandidateProfile.findOne({ candidate: candidateId });
    if (!profile) throw new BadRequestError('Create a profile first');

    const application = new JobApply({
      jobPost: jobPostId,
      candidate: candidateId,
      candidateProfile: profile._id,
      resume: profile.resume,
      description: req.body.description
    });

    await application.save();
    jobPost.applicantCount += 1;
    await jobPost.save();

    return res.status(201).json({ success: true, message: 'Applied successfully' });
  } catch (error) {
    next(error);
  }
};

candidateController.saveJob = async (req, res, next) => {
  try {
    const newSave = new SavedJob({ jobPost: req.params.jobId, candidate: req.user.id });
    await newSave.save();
    return res.status(201).json({ success: true, message: 'Job saved' });
  } catch (error) {
    next(error);
  }
};

candidateController.getAppliedJobs = async (req, res, next) => {
  try {
    const applied = await JobApply.find({ candidate: req.user.id }).populate('jobPost');
    return res.status(200).json({ success: true, appliedJobs: applied });
  } catch (error) {
    next(error);
  }
};

candidateController.getSavedJobs = async (req, res, next) => {
  try {
    const saved = await SavedJob.find({ candidate: req.user.id }).populate('jobPost');
    return res.status(200).json({ success: true, savedJobs: saved });
  } catch (error) {
    next(error);
  }
};

candidateController.deleteAppliedJob = async (req, res, next) => {
  try {
    await JobApply.findByIdAndDelete(req.params.applicationId);
    return res.status(200).json({ success: true, message: 'Application removed' });
  } catch (error) {
    next(error);
  }
};

candidateController.deleteSavedJob = async (req, res, next) => {
  try {
    await SavedJob.findByIdAndDelete(req.params.savedJobId);
    return res.status(200).json({ success: true, message: 'Saved job removed' });
  } catch (error) {
    next(error);
  }
};

candidateController.getApplicationStatus = async (req, res, next) => {
  try {
    const app = await JobApply.findById(req.params.applicationId).select('status');
    return res.status(200).json({ success: true, status: app?.status });
  } catch (error) {
    next(error);
  }
};

candidateController.getRecommendedJobs = async (req, res, next) => {
  try {
    const profile = await CandidateProfile.findOne({ candidate: req.user.id });
    const jobs = await JobPost.find({ status: 'Published', specialisms: { $in: profile?.categories || [] } });
    return res.status(200).json({ success: true, recommendedJobs: jobs });
  } catch (error) {
    next(error);
  }
};

candidateController.getTrendingJobs = async (req, res, next) => {
  try {
    const jobs = await JobPost.find({ status: 'Published' }).sort({ applicantCount: -1 }).limit(10);
    return res.status(200).json({ success: true, trendingJobs: jobs });
  } catch (error) {
    next(error);
  }
};

candidateController.getAssignedCandidateProfiles = async (req, res, next) => {
  try {
    const profiles = await CandidateProfile.find({ createdBy: req.user.id });
    res.status(200).json({ success: true, data: profiles });
  } catch (error) {
    next(error);
  }
};

export default candidateController;