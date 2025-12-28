import mongoose from "mongoose";
import jobs from '../models/jobs.model.js';
import CompanyProfile from '../models/companyProfile.model.js';
import { ForbiddenError, BadRequestError, NotFoundError } from "../utils/errors.js";

const jobsController = {};

/**
 * Creates a new job post for an authenticated employer
 * @param {Object} req - Request object containing job post data
 * @param {Object} res - Response object to send back the result
 * @param {Function} next - Next middleware function
 */
jobsController.createJobPost = async (req, res, next) => {
  try {
    const employerId = req.user.id;
    const {
      title,
      description,
      contactEmail,
      contactUsername,
      specialisms,
      jobType,
      offeredSalary,
      careerLevel,
      experience,
      gender,
      industry,
      qualification,
      applicationDeadline,
      location,
      remoteWork,
      companyProfile, // Added to allow explicit selection if needed
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

    // console.log("Creating job post with data:", req.body);
    
    // Validate location object
    if (!location.country || !location.city || !location.completeAddress) {
      throw new BadRequestError('Complete location details are required (country, city, completeAddress)');
    }

    // Validate specialisms
    if (!Array.isArray(specialisms) || specialisms.length === 0) {
      throw new BadRequestError('At least one specialism is required');
    }

    if (!positions || Number(positions) < 1) {
      throw new BadRequestError('Positions must be at least 1');
    }

    // Check if employer has a company profile
    const companyProfileDoc = await CompanyProfile.findOne({ employer: employerId });
    if (!companyProfileDoc) {
      throw new NotFoundError('Company profile not found. Please create a company profile first.');
    }

    // Validate companyProfile if provided explicitly
    if (companyProfile && !mongoose.Types.ObjectId.isValid(companyProfile)) {
      throw new BadRequestError('Invalid companyProfile ID');
    }

    // Create new job post
    const newJobPost = new jobs({
      employer: employerId,
      companyProfile: companyProfile || companyProfileDoc._id, // Use provided ID or default to employer’s profile
      title,
      description,
      contactEmail,
      contactUsername,
      specialisms,
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
        total: Number(positions),
        remaining: Number(positions),
      },
      remoteWork: remoteWork || 'On-site', // Default to On-site
      status: 'Published', // Default to Published
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
 * Fetches a list of job posts, filtered by employer for non-superadmins
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
jobsController.getJobPosts = async (req, res, next) => {
  try {
    const user = req.user;
    const loggedInUserId = user.id;
    const isSuperAdmin = user.role === 'superadmin';

    // Build base query
    let query = {};

    // Restrict to employer's own job posts unless superadmin
    if (!isSuperAdmin) {
      // query.employer = new mongoose.Types.ObjectId(loggedInUserId);
      query.employer = loggedInUserId;
    }
    
    // console.log("Query for job posts:", query);

    // const jobPosts = await jobs.find(query)
    //   .populate('companyProfile', 'companyName logo')
    //    .select('-__v applicantCount')
    //   .sort({ createdAt: -1 });

    // Query and populate related company profile (only name and logo)
    const jobPosts = await jobs.find(query)
      .populate('companyProfile', 'companyName logo')
      .select('employer companyProfile title location applicantCount status createdAt applicationDeadline')
      .sort({ createdAt: -1 });  // Most recent first

    return res.status(200).json({
      success: true,
      jobPosts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetches a single job post for editing
 * @param {Object} req - Request object containing job post ID
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
jobsController.getJobPost = async (req, res, next) => {
  try {
    const user = req.user;
    const jobPostId = req.params.id;

    const jobPost = await jobs.findById(jobPostId)
      .populate('companyProfile', 'companyName logo')
      // .select('title description contactEmail contactUsername specialisms jobType offeredSalary careerLevel experience gender industry qualification applicationDeadline location remoteWork status companyProfile -__v')
      .select('-__v -applicantCount'); // fix here

    if (!jobPost) {
      throw new NotFoundError('Job post not found');
    }

    // Check permissions
    // if (user.role !== 'superadmin' && jobPost.employer.toString() !== user.id.toString()) {
    //   throw new ForbiddenError('You do not have permission to access this job post');
    // }

    return res.status(200).json({
      success: true,
      jobPost,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates a job post
 * @param {Object} req - Request object containing updated job post data
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
jobsController.updateJobPost = async (req, res, next) => {
  try {
    const user = req.user;
    const jobPostId = req.params.id;
    const {
      title,
      description,
      contactEmail,
      contactUsername,
      specialisms,
      jobType,
      offeredSalary,
      careerLevel,
      experience,
      gender,
      industry,
      qualification,
      applicationDeadline,
      location,
      status,
      positions
    } = req.body;

    const jobPost = await jobs.findById(jobPostId);
    if (!jobPost) {
      throw new NotFoundError('Job post not found');
    }

    // Check permissions
    if (user.role !== 'superadmin' && jobPost.employer.toString() !== user.id.toString()) {
      throw new ForbiddenError('You do not have permission to update this job post');
    }

    // Parse specialisms if string
    let parsedSpecialisms = specialisms;
    if (typeof specialisms === 'string') {
      try {
        parsedSpecialisms = JSON.parse(specialisms);
      } catch {
        throw new BadRequestError('Invalid specialisms format');
      }
    }

    // Parse location if string
    let parsedLocation;
    if (typeof location === 'string') {
      try {
        parsedLocation = JSON.parse(location);
      } catch {
        throw new BadRequestError('Invalid location format');
      }
    } else {
      parsedLocation = location;
    }

    // Update fields
    const updateData = {
      title: title || jobPost.title,
      description: description || jobPost.description,
      contactEmail: contactEmail || jobPost.contactEmail,
      contactUsername: contactUsername || jobPost.contactUsername,
      specialisms: parsedSpecialisms ? (Array.isArray(parsedSpecialisms) ? parsedSpecialisms : [parsedSpecialisms]) : jobPost.specialisms,
      jobType: jobType || jobPost.jobType,
      offeredSalary: offeredSalary || jobPost.offeredSalary,
      careerLevel: careerLevel || jobPost.careerLevel,
      experience: experience || jobPost.experience,
      gender: gender || jobPost.gender,
      industry: industry || jobPost.industry,
      qualification: qualification || jobPost.qualification,
      applicationDeadline: applicationDeadline || jobPost.applicationDeadline,
      status: status || jobPost.status,
    };

    if (parsedLocation) {
      updateData.location = {
        country: parsedLocation.country || jobPost.location.country,
        city: parsedLocation.city || jobPost.location.city,
        completeAddress: parsedLocation.completeAddress || jobPost.location.completeAddress,
      };
    }

    // POSITIONS UPDATE
    if (positions !== undefined) {
      let newTotal;

      // Handle both formats:
      // positions: 50
      // positions: { total: 50 }
      if (typeof positions === 'object') {
        newTotal = Number(positions.total);
      } else {
        newTotal = Number(positions);
      }

      if (isNaN(newTotal) || newTotal < 0) {
        throw new BadRequestError('Invalid positions value');
      }

      // cannot reduce below already applied count
      if (newTotal < jobPost.applicantCount) {
        throw new BadRequestError(
          `Positions cannot be less than applied count (${jobPost.applicantCount})`
        );
      }

      const newRemaining = newTotal - jobPost.applicantCount;

      updateData.positions = {
        total: newTotal,
        remaining: newRemaining,
      };

      // auto close / reopen job
      if (newRemaining === 0) {
        updateData.status = 'Closed';
      } else if (jobPost.status === 'Closed') {
        updateData.status = 'Published';
      }
    }
    

    // Update job post
    const updatedJobPost = await jobs.findByIdAndUpdate(
      jobPostId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-__v -applicantCount');

    return res.status(200).json({
      success: true,
      message: 'Job post updated successfully',
      jobPost: updatedJobPost,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deletes a job post
 * @param {Object} req - Request object containing job post ID
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
jobsController.deleteJobPost = async (req, res, next) => {
  try {
    const user = req.user;
    const jobPostId = req.params.id;

    const jobPost = await jobs.findById(jobPostId);
    if (!jobPost) {
      throw new NotFoundError('Job post not found');
    }

    // Check permissions
    if (user.role !== 'superadmin' && jobPost.employer.toString() !== user.id.toString()) {
      throw new ForbiddenError('You do not have permission to delete this job post');
    }

    // Delete job post
    await jobs.findByIdAndDelete(jobPostId);

    return res.status(200).json({
      success: true,
      message: 'Job post deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export default jobsController;