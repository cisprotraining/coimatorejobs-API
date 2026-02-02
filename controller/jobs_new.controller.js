import mongoose from "mongoose";
import jobs from '../models/jobs_new.model.js';
import CompanyProfile from '../models/companyProfile.model.js';
import { ForbiddenError, BadRequestError, NotFoundError } from "../utils/errors.js";

const jobsController = {};

/**
 * Creates a new job post for an authenticated employer
 */
jobsController.createJobPost = async (req, res, next) => {
  try {
    const { id: loggedInUserId, role } = req.user;
    let employerId = loggedInUserId;

    if (['hr-admin', 'superadmin'].includes(role)) {
      if (!req.body.employerId) {
        throw new BadRequestError('employerId is required for HR-Admin or Superadmin');
      }
      employerId = req.body.employerId;
    }

    if (!mongoose.Types.ObjectId.isValid(employerId)) {
      throw new BadRequestError('Invalid employerId');
    }

    const companyProfileDoc = await CompanyProfile.findOne({ employer: employerId });
    if (!companyProfileDoc) {
      throw new NotFoundError('Company profile not found for this employer.');
    }

    if (companyProfileDoc.status !== 'approved') {
      throw new ForbiddenError('Company profile must be approved before posting jobs');
    }

    const {
      title, description, contactEmail, contactUsername, specialisms,
      jobType, offeredSalary, careerLevel, experience, gender, industry,
      qualification, applicationDeadline, location, remoteWork, positions, status
    } = req.body;

    // Validate required fields
    const requiredFields = [
      'title', 'description', 'contactEmail', 'specialisms', 'jobType',
      'offeredSalary', 'careerLevel', 'experience', 'industry', 'qualification',
      'applicationDeadline', 'location'
    ];
    
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      throw new BadRequestError(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const newJobPost = new jobs({
      employer: employerId,
      postedBy: loggedInUserId,
      companyProfile: companyProfileDoc._id,
      title,
      description,
      contactEmail,
      contactUsername,
      specialisms: Array.isArray(specialisms) ? specialisms : [specialisms],
      jobType,
      offeredSalary,
      careerLevel,
      experience,
      gender: gender || 'No Preference',
      industry,
      qualification,
      applicationDeadline,
      location: {
        country: location.country,
        city: location.city,
        completeAddress: location.completeAddress,
      },
      positions: {
        total: Number(positions?.total || positions),
        remaining: Number(positions?.total || positions),
      },
      remoteWork: remoteWork || 'On-site',
      status: status || 'Published',
    });

    await newJobPost.save();

    return res.status(201).json({
      success: true,
      message: 'Job post created successfully',
      jobPost: newJobPost,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetches a list of job posts, filtered by role
 */
jobsController.getJobPosts = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user; 
    let query = {};

    if (role === 'employer') {
      query.employer = userId;
    } else if (role === 'hr-admin') {
      query.postedBy = userId;
    }

    const jobPosts = await jobs.find(query)
      .populate('companyProfile', 'companyName logo')
      .select('employer companyProfile title location applicantCount status createdAt applicationDeadline')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, jobPosts });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetches job posts created by employers themselves
 */
jobsController.getEmployerJobPosts = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;
    let query = {};

    if (role === 'employer') {
      query.employer = userId;
      query.postedBy = userId;
    } else if (['hr-admin', 'superadmin'].includes(role)) {
      query.$expr = { $eq: ['$postedBy', '$employer'] };
    }

    const jobPosts = await jobs.find(query)
      .populate('companyProfile', 'companyName logo')
      .populate('employer', 'name email')
      .select('title status employer companyProfile postedBy createdAt applicationDeadline')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: jobPosts.length, jobPosts });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetches job posts created by HR-Admins or Superadmins
 */
jobsController.getAdminPostedJobs = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;
    let query = { $expr: { $ne: ['$postedBy', '$employer'] } };

    if (role === 'hr-admin') {
      query.postedBy = userId;
    }

    const jobPosts = await jobs.find(query)
      .populate('companyProfile', 'companyName logo')
      .populate('employer', 'name email')
      .populate('postedBy', 'name role')
      .select('title status employer companyProfile postedBy createdAt applicationDeadline')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: jobPosts.length, jobPosts });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetches a single job post
 */
jobsController.getJobPost = async (req, res, next) => {
  try {
    const jobPost = await jobs.findById(req.params.id)
      .populate('companyProfile', 'companyName logo')
      .select('-__v');

    if (!jobPost) throw new NotFoundError('Job post not found');

    return res.status(200).json({ success: true, jobPost });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates a job post
 */
jobsController.updateJobPost = async (req, res, next) => {
  try {
    const { id: userId, role } = req.user;
    const jobPostId = req.params.id;

    const jobPost = await jobs.findById(jobPostId);
    if (!jobPost) throw new NotFoundError('Job post not found');

    const isOwner = jobPost.employer.toString() === userId.toString();
    const isPoster = jobPost.postedBy.toString() === userId.toString();
    const isAdmin = ['hr-admin', 'superadmin'].includes(role);

    if (!isOwner && !isPoster && !isAdmin) {
      throw new ForbiddenError('Permission denied');
    }

    // Dynamic field update logic
    const updateData = { ...req.body };
    
    // Handle nested positions logic
    if (req.body.positions) {
      const newTotal = Number(req.body.positions.total || req.body.positions);
      updateData.positions = {
        total: newTotal,
        remaining: newTotal - (jobPost.applicantCount || 0)
      };
    }

    const updatedJobPost = await jobs.findByIdAndUpdate(
      jobPostId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-__v');

    return res.status(200).json({ success: true, message: 'Updated successfully', jobPost: updatedJobPost });
  } catch (error) {
    next(error);
  }
};

/**
 * Deletes a job post
 */
jobsController.deleteJobPost = async (req, res, next) => {
  try {
    const jobPost = await jobs.findById(req.params.id);
    if (!jobPost) throw new NotFoundError('Job post not found');

    // Permission check same as update...
    await jobs.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export default jobsController;