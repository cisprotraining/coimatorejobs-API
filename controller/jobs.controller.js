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

    // Extract employer ID from authenticated user
    const { id: loggedInUserId, role } = req.user;

    /**
     * Resolve employerId & companyProfile
     * -----------------------------------
     * employer     → own company only
     * hr-admin     → must pass employerId
     * superadmin   → must pass employerId
     */

    let employerId = loggedInUserId;

    // For hr-admin and superadmin, employerId must be provided in body
    if (['hr-admin', 'superadmin'].includes(role)) {
      if (!req.body.employerId) {
        throw new BadRequestError('employerId is required for HR-Admin or Superadmin');
      }
      employerId = req.body.employerId;
    }

    if (!mongoose.Types.ObjectId.isValid(employerId)) {
      throw new BadRequestError('Invalid employerId');
    }

    /**
     * Validate company profile
     */
    const companyProfileDoc = await CompanyProfile.findOne({ employer: employerId });
    if (!companyProfileDoc) {
      throw new NotFoundError('Company profile not found for this employer, Please create a company profile first.');
    }

    if (companyProfileDoc.status !== 'approved') {
      throw new ForbiddenError('Company profile must be approved before posting jobs');
    }

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
      positions,
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

   if (!positions || !positions.total || Number(positions.total) < 1) {
      throw new BadRequestError('Positions must be at least 1');
    }


    // Validate companyProfile if provided explicitly
    if (companyProfile && !mongoose.Types.ObjectId.isValid(companyProfile)) {
      throw new BadRequestError('Invalid companyProfile ID');
    }

    // Create new job post
    const newJobPost = new jobs({
      employer: employerId,        // the actual company owner
      postedBy: req.user.id,           // who is posting (employer or hr-admin)
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
        total: Number(positions.total),
        remaining: Number(positions.total),
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
    const { role, id: userId } = user; 

    // Build base query
    let query = {};

    // Restrict to employer's own job posts unless superadmin, hr-admin
    if (user.role === 'employer') {
      // Employer → jobs of their company
      query.employer = userId;
    }

    if (user.role === 'hr-admin') {
      // HR-Admin → jobs they posted
      query.postedBy = userId;
    }
    

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
 * Fetches job posts created by employers themselves.
 *
 * Access Rules:
 * ----------------------------------------------------
 * employer      → can see ONLY their own job posts
 * hr-admin      → can see ALL employer-created job posts
 * superadmin    → can see ALL employer-created job posts
 *
 * Employer-created job condition:
 * ----------------------------------------------------
 * postedBy === employer
 *
 */
jobsController.getEmployerJobPosts = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;

    // Base MongoDB query
    let query = {};

    /**
     * EMPLOYER
     * ------------------------------------------------
     * Employers should see ONLY the jobs
     * created under their own employer account.
     */
    if (role === 'employer') {
      query.employer = userId;
      query.postedBy = userId; // employer created it themselves
    }

    /**
     * HR-ADMIN / SUPERADMIN
     * ------------------------------------------------
     * Admins can view ALL employer-created jobs.
     * We identify employer-created jobs by checking:
     * postedBy === employer
     */
    if (['hr-admin', 'superadmin'].includes(role)) {
      query.$expr = { $eq: ['$postedBy', '$employer'] };
    }

    // Fetch jobs with minimal required fields
    const jobPosts = await jobs.find(query)
      .populate('companyProfile', 'companyName logo')
      .populate('employer', 'name email')
      .select(
        'title status employer companyProfile postedBy createdAt applicationDeadline'
      )
      .sort({ createdAt: -1 });

    // Success response
    return res.status(200).json({
      success: true,
      count: jobPosts.length,
      jobPosts
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Fetches job posts created by HR-Admins or Superadmins
 * on behalf of employers.
 *
 * Access Rules:
 * ----------------------------------------------------
 * hr-admin      → sees ONLY jobs posted by themselves
 * superadmin    → sees ALL admin-created job posts
 *
 * Admin-created job condition:
 * ----------------------------------------------------
 * postedBy !== employer
 */
jobsController.getAdminPostedJobs = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;

    // Base query for admin-created jobs
    let query = {
      $expr: { $ne: ['$postedBy', '$employer'] }
    };

    /**
     * HR-ADMIN
     * ------------------------------------------------
     * HR-Admin can only see jobs posted by themselves.
     */
    if (role === 'hr-admin') {
      query.postedBy = userId;
    }

    /**
     * SUPERADMIN
     * ------------------------------------------------
     * Superadmin can see ALL admin-created jobs.
     * No additional filters required.
     */

    const jobPosts = await jobs.find(query)
      .populate('companyProfile', 'companyName logo')
      .populate('employer', 'name email')
      .populate('postedBy', 'name role')
      .select(
        'title status employer companyProfile postedBy createdAt applicationDeadline'
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: jobPosts.length,
      jobPosts
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
    const isOwner = jobPost.employer.toString() === user.id.toString();
    const isPoster = jobPost.postedBy.toString() === user.id.toString();
    const isAdmin = ['hr-admin', 'superadmin'].includes(user.role);

    if (!isOwner && !isPoster && !isAdmin) {
      throw new ForbiddenError('You do not have permission to modify this job post');
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
    const isOwner = jobPost.employer.toString() === user.id.toString();
    const isPoster = jobPost.postedBy.toString() === user.id.toString();
    const isAdmin = ['hr-admin', 'superadmin'].includes(user.role);

    if (!isOwner && !isPoster && !isAdmin) {
      throw new ForbiddenError('You do not have permission to modify this job post');
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