import mongoose from "mongoose";
import JobPost from '../models/jobs.model.js';
import CompanyProfile from '../models/companyProfile.model.js';
import Role from '../models/role.model.js';
import Location from '../models/location.model.js';
import Skill from '../models/skill.model.js';
import Industry from '../models/industry.model.js';
import FunctionalArea from '../models/functionalArea.model.js';
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
    const { id: loggedInUserId, role: userRole } = req.user;

    /**
     * Resolve employerId & companyProfile
     * -----------------------------------
     * employer     → own company only
     * hr-admin     → must pass employerId
     * superadmin   → must pass employerId
     */

    let employerId = loggedInUserId;

    // For hr-admin and superadmin, employerId must be provided in body
    if (['hr-admin', 'superadmin'].includes(userRole)) {
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
      // specialisms,
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
      role, // singular ID
      skills = [],
      functionalAreas = [], // required array of IDs
    } = req.body;

    // Validate required fields
    const requiredFields = [
      'title', 'description', 'contactEmail', 'jobType',
      'offeredSalary', 'careerLevel', 'experience', 'qualification',
      'applicationDeadline', 'positions', 'location', 'role', 'functionalAreas'
    ];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      throw new BadRequestError(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // console.log("Creating job post with data:", req.body);
    
    // Validate location object
    if (!location?.country || !location?.city || !location?.completeAddress) {
      throw new BadRequestError('Complete location details are required (country, city, completeAddress)');
    }

    // commented out old specialism  for now
    // Validate specialisms
    // if (!Array.isArray(specialisms) || specialisms.length === 0) {
    //   throw new BadRequestError('At least one specialism is required');
    // }

    // Validate functionalAreas (array of IDs)
    if (!Array.isArray(functionalAreas) || functionalAreas.length === 0) throw new BadRequestError('functionalAreas required (array)');
    for (const id of functionalAreas) {
      if (!mongoose.Types.ObjectId.isValid(id) || !(await FunctionalArea.findById(id))) {
        throw new BadRequestError(`Invalid/missing functional area: ${id}`);
      }
    }

    // Validate industry
    if (!mongoose.Types.ObjectId.isValid(industry) || !(await Industry.findById(industry))) {
      throw new BadRequestError('Invalid or missing industry');
    }

    // Validate role
    if (!mongoose.Types.ObjectId.isValid(role) || !(await Role.findById(role))) {
      throw new BadRequestError('Invalid or missing role');
    }

    // Validate skills
    for (const id of skills) {
      if (!mongoose.Types.ObjectId.isValid(id) || !(await Skill.findById(id))) {
        throw new BadRequestError(`Invalid/missing skill: ${id}`);
      }
    }

   if (!positions || !positions.total || Number(positions.total) < 1) {
      throw new BadRequestError('Positions must be at least 1');
    }


    // Validate companyProfile if provided explicitly
    if (companyProfile && !mongoose.Types.ObjectId.isValid(companyProfile)) {
      throw new BadRequestError('Invalid companyProfile ID');
    }


    // Validate skills
    if (skills && Array.isArray(skills)) {
      for (const id of skills) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new BadRequestError(`Invalid skill ID: ${id}`);
        }
        if (!(await Skill.findById(id))) {
          throw new NotFoundError(`Skill not found: ${id}`);
        }
      }
    }

    // Validate location.city (prefer seeded, but allow custom)
    const cityLocation = await Location.findOne({ name: location.city });
    if (!cityLocation) {
      console.warn(`Custom city added: ${location.city}`); // For analytics
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
      // specialisms,
      jobType,
      offeredSalary,
      careerLevel,
      experience,
      gender: gender || 'No Preference',
      functionalAreas,
      industry,
      role,
      skills,
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

    // Validate functional areas
    if (!Array.isArray(functionalAreas) || functionalAreas.length === 0) {
      throw new BadRequestError('At least one functional area is required');
    }

    for (const faId of functionalAreas) {
      if (!mongoose.Types.ObjectId.isValid(faId)) {
        throw new BadRequestError(`Invalid functional area ID: ${faId}`);
      }
      if (!(await FunctionalArea.findById(faId))) {
        throw new NotFoundError('Functional area not found');
      }
    }


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
    const { role: userRole, id: userId } = req.user; 

    // Build base query
    let query = {};

    // Restrict to employer's own job posts unless superadmin, hr-admin
    if (userRole === 'employer') {
      // Employer → jobs of their company
      query.employer = userId;
    }

    if (userRole === 'hr-admin') {
      // HR-Admin → jobs they posted
      query.postedBy = userId;
    }
    

    // Query and populate related company profile (only name and logo)
    const jobPosts = await JobPost.find(query)
      .populate('companyProfile', 'companyName logo')
      .populate('functionalAreas', 'name slug')
      .populate('industry', 'name slug')
      .populate('role', 'name slug')
      .populate('skills', 'name')
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
    const { role: userRole, id: userId } = req.user;

    // Base MongoDB query
    let query = {};

    /**
     * EMPLOYER
     * ------------------------------------------------
     * Employers should see ONLY the jobs
     * created under their own employer account.
     */
    if (userRole === 'employer') {
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
    if (['hr-admin', 'superadmin'].includes(userRole)) {
      query.$expr = { $eq: ['$postedBy', '$employer'] };
    }

    // Fetch jobs with minimal required fields
    const jobPosts = await JobPost.find(query)
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
    const { role: userRole, id: userId } = req.user;

    // Base query for admin-created jobs
    let query = {
      $expr: { $ne: ['$postedBy', '$employer'] }
    };

    /**
     * HR-ADMIN
     * ------------------------------------------------
     * HR-Admin can only see jobs posted by themselves.
     */
    if (userRole === 'hr-admin') {
      query.postedBy = userId;
    }

    /**
     * SUPERADMIN
     * ------------------------------------------------
     * Superadmin can see ALL admin-created jobs.
     * No additional filters required.
     */

    const jobPosts = await JobPost.find(query)
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

    const jobPost = await JobPost.findById(jobPostId)
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
    const { role: userRole, id: userId } = req.user;
    const jobPostId = req.params.id;

    // commented out old destructuring for now
    // const {
    //   title,
    //   description,
    //   contactEmail,
    //   contactUsername,
    //   // specialisms,
    //   jobType,
    //   offeredSalary,
    //   careerLevel,
    //   experience,
    //   gender,
    //   functionalAreas,
    //   industry,
    //   role,
    //   skills,
    //   qualification,
    //   applicationDeadline,
    //   location,
    //   status,
    //   positions
    // } = req.body;

    const jobPost = await JobPost.findById(jobPostId);
    if (!jobPost) {
      throw new NotFoundError('Job post not found');
    }

    // Check permissions
    const isOwner = jobPost.employer.toString() === userId.toString();
    const isPoster = jobPost.postedBy.toString() === userId.toString();
    const isAdmin = ['hr-admin', 'superadmin'].includes(userRole);

    if (!isOwner && !isPoster && !isAdmin) {
      throw new ForbiddenError('You do not have permission to modify this job post');
    }

    // commented out old specialisms for now
    // Parse specialisms if string
    // let parsedSpecialisms = specialisms;
    // if (typeof specialisms === 'string') {
    //   try {
    //     parsedSpecialisms = JSON.parse(specialisms);
    //   } catch {
    //     throw new BadRequestError('Invalid specialisms format');
    //   }
    // }

    const updateData = {};

    // Simple fields
    ['title', 'description', 'contactEmail', 'contactUsername', 'jobType',
     'offeredSalary', 'careerLevel', 'experience', 'gender', 'qualification',
     'applicationDeadline', 'remoteWork', 'status'].forEach(field => {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    });

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

    // commented out old update for now
    // Update fields
    // const updateData = {
    //   title: title || jobPost.title,
    //   description: description || jobPost.description,
    //   contactEmail: contactEmail || jobPost.contactEmail,
    //   contactUsername: contactUsername || jobPost.contactUsername,
    //   specialisms: parsedSpecialisms ? (Array.isArray(parsedSpecialisms) ? parsedSpecialisms : [parsedSpecialisms]) : jobPost.specialisms,
    //   jobType: jobType || jobPost.jobType,
    //   offeredSalary: offeredSalary || jobPost.offeredSalary,
    //   careerLevel: careerLevel || jobPost.careerLevel,
    //   experience: experience || jobPost.experience,
    //   gender: gender || jobPost.gender,
    //   industry: industry || jobPost.industry,
    //   qualification: qualification || jobPost.qualification,
    //   applicationDeadline: applicationDeadline || jobPost.applicationDeadline,
    //   status: status || jobPost.status,
    // };

    if (parsedLocation) {
      updateData.location = {
        country: parsedLocation.country || jobPost.location.country,
        city: parsedLocation.city || jobPost.location.city,
        completeAddress: parsedLocation.completeAddress || jobPost.location.completeAddress,
      };
    }

    // Taxonomy fields
    // Handle arrays / refs if provided
    if (req.body.functionalAreas) {
      // Validate array of IDs
      for (const id of req.body.functionalAreas) {
        if (!mongoose.Types.ObjectId.isValid(id) || !(await FunctionalArea.findById(id))) {
          throw new BadRequestError(`Invalid functional area: ${id}`);
        }
      }
      updateData.functionalAreas = req.body.functionalAreas;
    }

    if (req.body.role) {
      if (!mongoose.Types.ObjectId.isValid(req.body.role) || !(await Role.findById(req.body.role))) {
        throw new BadRequestError('Invalid role');
      }
      updateData.role = req.body.role;
    }

    if (req.body.skills) {
      for (const id of req.body.skills) {
        if (!mongoose.Types.ObjectId.isValid(id) || !(await Skill.findById(id))) {
          throw new BadRequestError(`Invalid skill: ${id}`);
        }
      }
      updateData.skills = req.body.skills;
    }

    if (req.body.industry) {
      if (!mongoose.Types.ObjectId.isValid(req.body.industry) || !(await Industry.findById(req.body.industry))) {
        throw new BadRequestError('Invalid industry');
      }
      updateData.industry = req.body.industry;
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
    const updatedJobPost = await JobPost.findByIdAndUpdate(
      jobPostId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('functionalAreas role industry skills companyProfile').select('-__v -applicantCount');

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
    const { role: userRole, id: userId } = req.user;
    const jobPostId = req.params.id;

    const jobPost = await JobPost.findById(jobPostId);
    if (!jobPost) {
      throw new NotFoundError('Job post not found');
    }

    // Check permissions
    const isOwner = jobPost.employer.toString() === userId.toString();
    const isPoster = jobPost.postedBy.toString() === userId.toString();
    const isAdmin = ['hr-admin', 'superadmin'].includes(userRole);

    if (!isOwner && !isPoster && !isAdmin) {
      throw new ForbiddenError('You do not have permission to modify this job post');
    }

    // Delete job post
    await JobPost.findByIdAndDelete(jobPostId);

    return res.status(200).json({
      success: true,
      message: 'Job post deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// common pagination function
const paginate = (req) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Number(req.query.limit || 20));
  return { skip: (page - 1) * limit, limit };
};

// New SEO-focused APIs
jobsController.getJobsByLocation = async (req, res, next) => {
  try {
    const { city } = req.params;
    const { skip, limit } = paginate(req);

    const jobs = await JobPost.find({ status: 'Published', 'location.city': { $regex: new RegExp(`^${city}$`, 'i') } })
      .populate('companyProfile', 'companyName logo')
      .populate('functionalAreas', 'name slug')
      .populate('industry', 'name slug')
      .populate('role', 'name slug')
      .populate('skills', 'name')
      .select('title role location status createdAt slug seoKeywords')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    res.json({ success: true, jobs });
  } catch (error) {
    next(error);
  }
};

jobsController.getJobsByCategory = async (req, res, next) => {
  try {
    const { categorySlug } = req.params;
    const functionalArea = await FunctionalArea.findOne({ slug: categorySlug });
    if (!functionalArea) throw new NotFoundError('Category not found');
    const jobs = await JobPost.find({ status: 'Published', functionalAreas: functionalArea._id })
      .populate('companyProfile', 'companyName logo')
      .populate('functionalAreas', 'name slug')
      .populate('industry', 'name slug')
      .populate('role', 'name slug')
      .populate('skills', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, jobs });
  } catch (error) {
    next(error);
  }
};

jobsController.getJobsByRole = async (req, res, next) => {
  try {
    const { roleSlug } = req.params;
    const role = await Role.findOne({ slug: roleSlug });
    if (!role) throw new NotFoundError('Role not found');
    const jobs = await JobPost.find({ status: 'Published', role: role._id })
      .populate('companyProfile', 'companyName logo')
      .populate('functionalAreas', 'name slug')
      .populate('industry', 'name slug')
      .populate('role', 'name slug')
      .populate('skills', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, jobs });
  } catch (error) {
    next(error);
  }
};


jobsController.getJobsByRoleAndCity = async (req, res, next) => {
  try {
    const { roleSlug, city } = req.params;

    const role = await Role.findOne({ slug: roleSlug });
    if (!role) throw new NotFoundError('Role not found');

    const jobs = await JobPost.find({
      role: role._id,
      status: 'Published',
      'location.city': { $regex: new RegExp(`^${city}$`, 'i') }
    })
      .populate('companyProfile', 'companyName logo')
      .populate('functionalAreas', 'name slug')
      .populate('industry', 'name slug')
      .populate('role', 'name slug')
      .sort({ createdAt: -1 });

    res.json({ success: true, jobs });
  } catch (err) {
    next(err);
  }
};


export default jobsController;