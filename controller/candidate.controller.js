import mongoose from "mongoose";
import CandidateProfile from "../models/candidateProfile.model.js";
import User from '../models/user.model.js';
import JobPost from '../models/jobs.model.js';
import JobApply from "../models/jobApply.model.js";
import SavedJob from '../models/savedJob.model.js';
import CandidateResume from '../models/candidateResume.model.js';
import { ForbiddenError, BadRequestError, NotFoundError } from "../utils/errors.js";
import { sendCandidateProfileStatusEmail, sendSuperadminAlertEmail, sendProfileDeletionEmail } from '../utils/mailer.js';
import { SUPERADMIN_EMAIL, THROTTLING_RETRY_DELAY_BASE } from "../config/env.js";
import fs from 'fs';
import path from 'path';
import natural from 'natural';  //library (for TF-IDF / cosine similarity)

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

/**
 * Retrieves all candidate profiles (accessible to admins and superadmins)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
candidateController.getAllCandidateProfiles = async (req, res, next) => {
  try {
    // Fetch all candidate profiles, excluding the version key
    const profiles = await CandidateProfile.find().select('-__v');
    return res.status(200).json({
      success: true,
      profiles
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Creates a candidate profile for an authenticated candidate
 * @param {Object} req - Request object containing candidate data
 * @param {Object} res - Response object to send back the result
 * @param {Function} next - Next middleware function
 */
// candidateController.createCandidateProfile = async (req, res, next) => {
//   try {
//     const candidateId = req.user.id;

//     // Use req.body directly (normalized by middleware)
//     const profileData = req.body;

//     const { 
//       fullName, jobTitle, phone, email, website, currentSalary, expectedSalary, experience, age, gender, educationLevels, languages, categories, allowInSearch, description,jobType, socialMedia, location
//     } = profileData;

//     // Validate required fields
//     const requiredFields = ['fullName', 'jobTitle', 'phone', 'email', 'educationLevels', 'languages', 'categories', 'description', 'jobType', 'age', 'gender', 'location'];
//     const missingFields = requiredFields.filter(field => !profileData[field] || (field === 'location' && (!profileData[field].city || !profileData[field].completeAddress)));
//     if (missingFields.length > 0) {
//       throw new BadRequestError(`Missing or incomplete required fields: ${missingFields.join(', ')}`);
//     }

//     // Check if profile already exists
//     const existingProfile = await CandidateProfile.findOne({ candidate: candidateId });
//     if (existingProfile) {
//       throw new BadRequestError('Candidate profile already exists for this user');
//     }

//     // Handle file uploads
//     const files = req.files || {};
//     const profilePhoto = files.profilePhoto ? `/uploads/candidate/${files.profilePhoto[0].filename}` : null;
//     const resume = files.resume ? `/uploads/candidate/${files.resume[0].filename}` : null;

//     // Create new profile
//     const newProfile = new CandidateProfile({
//       candidate: candidateId,
//       fullName,
//       jobTitle,
//       phone,
//       email,
//       website,
//       currentSalary,
//       expectedSalary,
//       experience,
//       age,
//       gender,
//       educationLevels: Array.isArray(educationLevels) ? educationLevels : (typeof educationLevels === 'string' ? JSON.parse(educationLevels) : [educationLevels]),
//       languages: Array.isArray(languages) ? languages : (typeof languages === 'string' ? JSON.parse(languages) : [languages]),
//       categories: Array.isArray(categories) ? categories : (typeof categories === 'string' ? JSON.parse(categories) : [categories]),
//       allowInSearch: allowInSearch !== undefined ? allowInSearch : true,
//       description,
//       jobType,
//       socialMedia: typeof socialMedia === 'object' ? socialMedia : (socialMedia ? JSON.parse(socialMedia) : {}),
//       location: typeof location === 'object' ? location : (location ? JSON.parse(location) : {}),
//       profilePhoto,
//       resume
//     });

//     // console.log("Creating candidate profile with data:", newProfile);
    

//     await newProfile.save();

//     return res.status(201).json({
//       success: true,
//       message: 'Candidate profile created successfully',
//       profile: newProfile
//     });
//   } catch (error) {
//     // Cleanup uploaded files if an error occurs after upload
//     if (req.files) {
//       const files = req.files;
//       if (files.profilePhoto && files.profilePhoto[0]) {
//         const photoPath = path.join(process.cwd(), 'public', `/uploads/candidate/${files.profilePhoto[0].filename}`);
//         if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
//       }
//       if (files.resume && files.resume[0]) {
//         const resumePath = path.join(process.cwd(), 'public', `/uploads/candidate/${files.resume[0].filename}`);
//         if (fs.existsSync(resumePath)) fs.unlinkSync(resumePath);
//       }
//     }

//     next(error);
//   }
// };


candidateController.createCandidateProfile = async (req, res, next) => {
  try {
    // 1. Resolve logged-in User (handle both ._id and .id)
    const loggedInUserId = req.user?._id || req.user?.id;
    const { role } = req.user;

    if (!loggedInUserId) {
      throw new BadRequestError('User session not found');
    }
    
    // 2. Parse nested "data" blob from FormData
    let profileData = {};
    if (req.body.data) {
      try {
        profileData = JSON.parse(req.body.data);
      } catch (err) {
        throw new BadRequestError("Invalid JSON format in 'data' field");
      }
    } else {
      profileData = req.body;
    }
    
    // 3. Resolve Target Candidate Identity
    let candidateId = loggedInUserId;
    if (['hr-admin', 'superadmin'].includes(role)) {
      if (!profileData.candidateId) {
        throw new BadRequestError('candidateId is required for Admin/HR-Admin');
      }
      candidateId = profileData.candidateId;
    }
    
    const { industry, functionalAreas, role: targetRoleId } = profileData;

    // 4. Validate Target User
    const targetUser = await User.findById(candidateId);
    if (!targetUser || targetUser.role !== 'candidate') {
      throw new BadRequestError('Target user must have a candidate role');
    }
    
    if (targetUser.status !== 'approved') {
      throw new BadRequestError(
        'Candidate is not approved yet'
      );
    }

    if (industry && !(await mongoose.model('Industry').findById(industry))) throw new BadRequestError('Invalid Industry');
    if (targetRoleId && !(await mongoose.model('Role').findById(targetRoleId))) throw new BadRequestError('Invalid Role');

    const faIds = parseField(functionalAreas);

    if (faIds.length > 0) {
      const faCount = await mongoose.model('FunctionalArea').countDocuments({ _id: { $in: faIds } });
      if (faCount !== faIds.length) throw new BadRequestError('One or more Functional Areas are invalid');
    }
    
    // 5. Prevent Duplicates
    const existingProfile = await CandidateProfile.findOne({ candidate: candidateId });
    if (existingProfile) {
      throw new BadRequestError('Candidate profile already exists for this user');
    }
    
    // Validate required fields
    const requiredFields = ['fullName', 'jobTitle', 'phone', 'email', 'educationLevels', 'languages', 'description', 'jobType', 'age', 'gender', 'location'];
    const missingFields = requiredFields.filter(field => !profileData[field] || (field === 'location' && (!profileData[field].city || !profileData[field].completeAddress)));
    if (missingFields.length > 0) {
      throw new BadRequestError(`Missing or incomplete required fields: ${missingFields.join(', ')}`);
    }
    
    const isAdminCreator = ['hr-admin', 'superadmin'].includes(role);
    
    // 6. Handle File Paths
    const files = req.files || {};
    // const profilePhoto = files.profilePhoto ? `/uploads/candidate/${files.profilePhoto[0].filename}` : null;
    // const resume = files.resume ? `/uploads/candidate/${files.resume[0].filename}` : null;
    const profilePhoto = files.profilePhoto ? files.profilePhoto[0].location : null;  // S3 URL
    const resume = files.resume ? files.resume[0].location : null;  // S3 URL

    // 7. Create New Profile
    const newProfile = new CandidateProfile({
      candidate: candidateId,
      createdBy: loggedInUserId, // Fixes the "createdBy is required" error


      status: isAdminCreator ? 'approved' : 'pending',
      approvedBy: isAdminCreator ? loggedInUserId : null,
      approvedAt: isAdminCreator ? new Date() : null,

      industry: profileData.industry,
      role: profileData.role,
      functionalAreas: parseField(profileData.functionalAreas),

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
      // educationLevels: Array.isArray(profileData.educationLevels) ? profileData.educationLevels : [],
      // languages: Array.isArray(profileData.languages) ? profileData.languages : [],
      // categories: Array.isArray(profileData.categories) ? profileData.categories : [],
      educationLevels: parseField(profileData.educationLevels),
      languages: parseField(profileData.languages),
      categories: parseField(profileData.categories),
      skills: parseField(profileData.skills),
      allowInSearch: profileData.allowInSearch !== undefined ? profileData.allowInSearch : true,
      description: profileData.description,
      jobType: profileData.jobType,
      // socialMedia: profileData.socialMedia || {},
      // location: profileData.location || {},
      socialMedia: typeof profileData.socialMedia === 'string' ? JSON.parse(profileData.socialMedia) : (profileData.socialMedia || {}),
      location: typeof profileData.location === 'string' ? JSON.parse(profileData.location) : (profileData.location || {}),
      profilePhoto,
      resume
    });

    await newProfile.save();

    // Auto-create first resume from profile data
    const defaultResume = new CandidateResume({
      candidate: candidateId,
      profile: newProfile._id,
      title: "My Primary Resume",
      isPrimary: true,
      personalInfo: {
        fullName: newProfile.fullName,
        jobTitle: newProfile.jobTitle,
        email: newProfile.email,
        phone: newProfile.phone,
        location: newProfile.location,
      },
      education: newProfile.educationLevels || [],
      experience: [], // user can add later
      skills: newProfile.skills || [],
      template: 'professional',
    });

    await defaultResume.save();

    // Send notification emails
    await sendCandidateProfileStatusEmail({
      recipient: targetUser.email,
      name: targetUser.name,
      status: newProfile.status,
      dashboardUrl: `${process.env.FRONTEND_URL}/candidate/dashboard`
    });

    // WAIT 6 SECONDS (Mailtrap throttle workaround)
    await new Promise(resolve => setTimeout(resolve, 6000)); //remove when in production

    // Alert superadmin
    await sendSuperadminAlertEmail({
      superadminEmail: SUPERADMIN_EMAIL,
      eventType: 'create_profile',
      newUserEmail: targetUser.email,
      newUserRole: 'candidate',
      message: `New candidate profile created for ${targetUser.email} by ${loggedInUserId}`
    });

    return res.status(201).json({
      success: true,
      message: 'Candidate profile created successfully',
      profile: newProfile
    });

  } catch (error) {
    // 8. Cleanup uploaded files on failure
    if (req.files) {
      Object.values(req.files).flat().forEach(file => {
        const filePath = path.join(process.cwd(), 'public', 'uploads', 'candidate', file.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }
    console.error("Profile Creation Error:", error);
    next(error);
  }
};


/**
 * Updates a candidate profile for an authenticated candidate
 * @param {Object} req - Request object containing candidate data
 * @param {Object} res - Response object to send back the result
 * @param {Function} next - Next middleware function
 */
candidateController.updateCandidateProfile = async (req, res, next) => {
  try {
    // const candidateId = req.user.id;
    const loggedInUserId = req.user?._id || req.user?.id;
    const profileId = req.params.id;

    // Parse the nested data from req.body.data
    // let profileData = req.body;
    let profileData = req.body.data ? JSON.parse(req.body.data) : req.body;

    const { 
      fullName, jobTitle, phone, email, website, currentSalary, expectedSalary, experience, age, gender, educationLevels, languages, categories, allowInSearch, description, jobType, socialMedia, location
    } = profileData;

    // Find the profile by ID
    const profile = await CandidateProfile.findById(profileId);
    if (!profile) {
      throw new NotFoundError('Candidate profile not found');
    }

    // Check permissions
    // if (req.user.role !== 'superadmin' && req.user.role !== 'hr-admin' && profile.candidate.toString() !== candidateId.toString()) {
    if (req.user.role !== 'superadmin' && req.user.role !== 'hr-admin' && profile.candidate.toString() !== loggedInUserId.toString()) {
      throw new ForbiddenError('You do not have permission to update this profile');
    }

    // Explicitly set these to ensure Mongoose validation passes
    profile.createdBy = profile.createdBy || loggedInUserId;

    // Handle file uploads
    const files = req.files || {};
    // old-local storage
    // if (files.profilePhoto) {
    //   // Delete old photo if exists
    //   if (profile.profilePhoto) {
    //     const oldPhotoPath = path.join(process.cwd(), 'public', profile.profilePhoto);
    //     if (fs.existsSync(oldPhotoPath)) fs.unlinkSync(oldPhotoPath);
    //   }
    //   profile.profilePhoto = `/uploads/candidate/${files.profilePhoto[0].filename}`;
    // }
    // if (files.resume) {
    //   // Delete old resume if exists
    //   if (profile.resume) {
    //     const oldResumePath = path.join(process.cwd(), 'public', profile.resume);
    //     if (fs.existsSync(oldResumePath)) fs.unlinkSync(oldResumePath);
    //   }
    //   profile.resume = `/uploads/candidate/${files.resume[0].filename}`;
    // }

    /**
     * ---------------------------------------------------
     * HANDLE FILE UPLOADS (AWS S3)
     * ---------------------------------------------------
     * multer-s3 gives file URL → file.location
     */
    if (files.profilePhoto) {
      profile.profilePhoto = files.profilePhoto[0].location;
    }

    if (files.resume) {
      profile.resume = files.resume[0].location;
    }


    if (profileData.industry) {
      if (!(await mongoose.model('Industry').findById(profileData.industry))) throw new BadRequestError('Invalid Industry');
      profile.industry = profileData.industry;
    }

    if (profileData.role) {
      if (!(await mongoose.model('Role').findById(profileData.role))) throw new BadRequestError('Invalid Role');
      profile.role = profileData.role;
    }

    if (profileData.functionalAreas) {
      const faIds = parseField(profileData.functionalAreas);
      const faCount = await mongoose.model('FunctionalArea').countDocuments({ _id: { $in: faIds } });
      if (faCount !== faIds.length) throw new BadRequestError('Invalid Functional Areas');
      profile.functionalAreas = faIds;
    }

    if (profileData.skills) {
      profile.skills = parseField(profileData.skills);
    }

    // Update fields if provided
    profile.fullName = fullName || profile.fullName;
    profile.jobTitle = jobTitle || profile.jobTitle;
    profile.phone = phone || profile.phone;
    profile.email = email || profile.email;
    profile.website = website || profile.website;
    profile.currentSalary = currentSalary || profile.currentSalary;
    profile.expectedSalary = expectedSalary || profile.expectedSalary;
    profile.experience = experience || profile.experience;
    profile.age = age || profile.age;
    profile.gender = gender || profile.gender;
    profile.jobType = jobType || profile.jobType;

    // Normalize arrays (support repeated form-data keys or JSON string arrays)
    // profile.educationLevels = educationLevels
    //   ? (Array.isArray(educationLevels)
    //       ? educationLevels
    //       : (typeof educationLevels === "string" ? JSON.parse(educationLevels) : [educationLevels]))
    //   : profile.educationLevels;

    // profile.languages = languages
    //   ? (Array.isArray(languages)
    //       ? languages
    //       : (typeof languages === "string" ? JSON.parse(languages) : [languages]))
    //   : profile.languages;

    // profile.categories = categories
    //   ? (Array.isArray(categories)
    //       ? categories
    //       : (typeof categories === "string" ? JSON.parse(categories) : [categories]))
    //   : profile.categories;

    if (profileData.educationLevels) profile.educationLevels = parseField(profileData.educationLevels);
    if (profileData.languages) profile.languages = parseField(profileData.languages);
    if (profileData.categories) profile.categories = parseField(profileData.categories);

    profile.allowInSearch = allowInSearch !== undefined ? allowInSearch : profile.allowInSearch;
    profile.description = description || profile.description;
    // profile.socialMedia = typeof socialMedia === 'string' ? JSON.parse(socialMedia) : (socialMedia || profile.socialMedia);
    // profile.location = typeof location === 'string' ? JSON.parse(location) : (location || profile.location);

    profile.socialMedia = typeof profileData.socialMedia === 'string' ? JSON.parse(profileData.socialMedia) : (profileData.socialMedia || profile.socialMedia);
    profile.location = typeof profileData.location === 'string' ? JSON.parse(profileData.location) : (profileData.location || profile.location);

    await profile.save();

    return res.status(200).json({
      success: true,
      message: 'Candidate profile updated successfully',
      profile
    });
  } catch (error) {
    // Cleanup uploaded files if an error occurs after upload
    if (req.files) {
      const files = req.files;
      if (files.profilePhoto && files.profilePhoto[0]) {
        const photoPath = path.join(process.cwd(), 'public', `/uploads/candidate/${files.profilePhoto[0].filename}`);
        if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
      }
      if (files.resume && files.resume[0]) {
        const resumePath = path.join(process.cwd(), 'public', `/uploads/candidate/${files.resume[0].filename}`);
        if (fs.existsSync(resumePath)) fs.unlinkSync(resumePath);
      }
    }
    next(error);
  }
};

/**
 * Retrieves a single candidate profile by ID
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
candidateController.getCandidateProfile = async (req, res, next) => {
  try {
    const profileId = req.params.id;
    const profile = await CandidateProfile.findById(profileId)
    .populate('industry', 'name')
    .populate('role', 'name')
    .populate('functionalAreas', 'name')
    .populate('skills', 'name')
    .select('-__v');
    if (!profile) {
      throw new NotFoundError('Candidate profile not found');
    }

    // Check permissions
    if (req.user.role !== 'superadmin' && req.user.role !== 'employer' && req.user.role !== 'hr-admin'  && profile.candidate.toString() !== req.user.id.toString()) {
      throw new ForbiddenError('You do not have permission to access this profile');
    }

    return res.status(200).json({
      success: true,
      profile
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Retrieves candidate profiles for the logged-in candidate
 * @param {Object} req - Request object, with authenticated user info in req.user
 * @param {Object} res - Response object to send the result
 * @param {Function} next - Next middleware function for error handling
 */
candidateController.getCandidateProfilesForCandidate = async (req, res, next) => {
  try {
    const candidateId = req.user.id;

    // Fetch all candidate profiles that belong to this candidate, excluding __v field
    const profiles = await CandidateProfile.find({ candidate: candidateId }).select('-__v');

    return res.status(200).json({
      success: true,
      profiles,
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Deletes a candidate profile by ID
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
candidateController.deleteCandidateProfile = async (req, res, next) => {
  try {
    const profileId = req.params.id;
    const profile = await CandidateProfile.findById(profileId);
    if (!profile) {
      throw new NotFoundError('Candidate profile not found');
    }

     // Permission check
    const isAdmin = ['superadmin', 'hr-admin'].includes(req.user.role);
    const isOwner = profile.candidate.toString() === req.user.id.toString();

    if (!isAdmin && !isOwner) {
      throw new ForbiddenError('You do not have permission to delete this profile');
    }

    // Fetch deleting user (email + role)
    const deletingUser = await User.findById(req.user.id).select('email role');

    //  Determine who deleted
    let deletedByLabel = '';
    let notifySuperadminMessage = '';

    if (isOwner) {
      // Candidate deleted their own profile
      deletedByLabel = 'You';
      notifySuperadminMessage = `Candidate ${profile.email} deleted their own profile`;
    } else {
      // Deleted by admin
      deletedByLabel =
        deletingUser?.email ||
        (deletingUser?.role === 'superadmin'
          ? 'Super Admin'
          : 'HR Admin');

      notifySuperadminMessage = `Candidate profile deleted for ${profile.email} by ${deletedByLabel}`;
    }
    
    // Delete associated files
    if (profile.profilePhoto) {
      const photoPath = path.join(process.cwd(), 'public', profile.profilePhoto);
      if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
    }
    if (profile.resume) {
      const resumePath = path.join(process.cwd(), 'public', profile.resume);
      if (fs.existsSync(resumePath)) fs.unlinkSync(resumePath);
    }

    await CandidateProfile.findByIdAndDelete(profileId);

    // Send deletion confirmation email to candidate
    await sendProfileDeletionEmail({
      recipient: profile.email,
      name: profile.fullName,
      role: 'candidate',
      deletedBy: deletedByLabel
    });

     // WAIT 6 SECONDS (Mailtrap throttle workaround)
    await new Promise(resolve => setTimeout(resolve, 6000)); //remove when in production

    // Send alert to superadmin
    await sendSuperadminAlertEmail({
      superadminEmail: SUPERADMIN_EMAIL,
      eventType: 'deleted',
      newUserEmail: profile.email,
      newUserRole: 'candidate',
      message: notifySuperadminMessage,
      actorEmail: deletedByLabel
    });

    return res.status(200).json({
      success: true,
      message: 'Candidate profile deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve or reject candidate profile
 * HR-Admin / Superadmin only
 */
candidateController.approveCandidateProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const adminId = req.user.id;

    if (!['approved', 'rejected'].includes(status)) {
      throw new BadRequestError('Invalid status value');
    }

    const profile = await CandidateProfile.findById(id);
    if (!profile) {
      throw new NotFoundError('Candidate profile not found');
    }

    profile.status = status;
    profile.approvedBy = adminId;
    profile.approvedAt = new Date();
    profile.rejectionReason =
      status === 'rejected' ? rejectionReason : null;

    await profile.save();

     // Fetch approving user (email + role)
    const approvingUser = await User.findById(req.user.id).select('email role');

    // Send status update email to candidate
    await sendCandidateProfileStatusEmail({
      recipient: profile.email,
      name: profile.fullName,
      status: status,
      rejectionReason: status === 'rejected' ? rejectionReason : null,
      dashboardUrl: `${process.env.FRONTEND_URL}/candidate-dashboard/dashboard`
    });

    // WAIT 5 SECONDS (Mailtrap throttle workaround)
    await new Promise(resolve => setTimeout(resolve, 5000)); //remove when in production

    // Send alert to superadmin
    await sendSuperadminAlertEmail({
      superadminEmail: SUPERADMIN_EMAIL,
      eventType: status === 'approved' ? 'approved' : 'rejected',
      newUserEmail: profile.email,
      newUserRole: 'candidate',
      message: `Candidate profile ${status} for ${profile.email} by ${approvingUser.email}`,
      actorEmail: approvingUser.email
    });

    return res.status(200).json({
      success: true,
      message: `Candidate profile ${status} successfully`,
      profile
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Get all pending candidate profiles
 * Accessible by HR-Admin and Superadmin
 *
 * HR-Admin:
 *  - Sees only candidate profiles created by candidates assigned to them
 *
 * Superadmin:
 *  - Sees all pending candidate profiles
 */
candidateController.getPendingCandidateProfiles = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Base filter: only pending profiles
    const filter = {
      status: 'pending',
    };

    // Optional future: restrict HR-Admin to assigned employers
    // const user = req.user;
    // if (user.role === 'hr-admin') {
    //   if (!user.candidateIds || user.candidateIds.length === 0) {
    //     return res.status(200).json({ success: true, profiles: [], pagination: { ... } });
    //   }
    //   filter.candidate = { $in: user.candidateIds };
    // }

    // Fetch pending candidate profiles
    const profiles = await CandidateProfile.find(filter)
      .populate('candidate', 'name email')     // ref: 'User'
      .populate('createdBy', 'name email')    // ref: 'User'
      .sort({ createdAt: -1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit))
      .select('-__v');

    // Total count for pagination
    const total = await CandidateProfile.countDocuments(filter);

    return res.status(200).json({
      success: true,
      profiles,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / limit),
        total,
        limit: Number(limit),
      },
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Retrieves all published job posts for candidates to view
 * @route GET /api/candidate/jobs
 * @access Public
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
candidateController.getAllJobPosts = async (req, res, next) => {
  try {
    const jobPosts = await JobPost.find({ status: 'Published' })
      .populate('companyProfile', 'companyName logo') // Populate company name and logo
      .select('-__v -applicantCount') // Hide internal fields
      .sort({ createdAt: -1 }); // Sort by newest first

    return res.status(200).json({
      success: true,
      jobPosts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Applies to a specific job post
 * @route POST /api/candidate/jobs/:jobId/apply
 * @access Private (Candidate only)
 * @param {Object} req - Express request object (should include candidate and optional file)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
candidateController.applyToJob = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const jobPostId = req.params.jobId;
    const { description, coverLetter } = req.body;
    const files = req.files || {};

    // Ensure job post exists and is published
    const jobPost = await JobPost.findById(jobPostId);
    if (!jobPost || jobPost.status !== 'Published') {
      throw new NotFoundError('Job post not found or not available');
    }

    if (jobPost.positions.remaining <= 0) {
      throw new BadRequestError('All open positions are closed for this job');
    }

    // Ensure candidate has a profile
    const candidateProfile = await CandidateProfile.findOne({ candidate: candidateId });
    console.log("test", candidateProfile);
    
    if (!candidateProfile) {
      throw new BadRequestError('Please create a candidate profile before applying');
    }
    // console.log("Candidate profile found:", candidateProfile);
    
    // Prevent duplicate applications
    const existingApplication = await JobApply.findOne({ jobPost: jobPostId, candidate: candidateId });
    if (existingApplication) {
      throw new BadRequestError('You have already applied to this job');
    }

    // Application message is required
    if (!description) {
      throw new BadRequestError('Application message (description) is required');
    }

    // Get resume either from profile or from uploaded file
    // let resume = candidateProfile.resume;
    // if (!resume && !files.resume) {
    //   throw new BadRequestError('Resume is required. Please upload a resume in your profile or with this application');
    // } else if (files.resume) {
    //   // Set uploaded resume path
    //   resume = `/uploads/candidate/${files.resume[0].filename}`;
    // }

     /**
     * USE S3 RESUME
     */
    let resume = candidateProfile.resume;

    if (files.resume) {
      resume = files.resume[0].location; // S3 URL
    }

    if (!resume) {
      throw new BadRequestError("Resume required");
    }

    // Create new application
    const newApplication = new JobApply({
      jobPost: jobPostId,
      candidate: candidateId,
      candidateProfile: candidateProfile._id,
      resume,
      coverLetter,
      description,
    });

    await newApplication.save();

    // decrement positions & increment applicantCount (NOTE: This is increamenting already in jobapply model (// Hook to increment applicantCount on save (commented now)))
    // decrement remaining positions
      jobPost.positions.remaining -= 1;

      // increment applicant count
      jobPost.applicantCount += 1;

      // auto close job
      if (jobPost.positions.remaining === 0) {
        jobPost.status = 'Closed';
      }

      // SAVE THE JOB POST 
      await jobPost.save();

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      application: newApplication,
    });
  } catch (error) {
    // Cleanup uploaded file if there’s an error
    if (req.files?.resume?.[0]) {
      const resumePath = path.join(process.cwd(), 'public', `/uploads/candidate/${req.files.resume[0].filename}`);
      if (fs.existsSync(resumePath)) fs.unlinkSync(resumePath);
    }
    next(error);
  }
};

/**
 * Saves (bookmarks) a job post for later
 * @route POST /api/candidate/jobs/:jobId/save
 * @access Private (Candidate only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
candidateController.saveJob = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const jobPostId = req.params.jobId;

    // Ensure job post exists
    const jobPost = await JobPost.findById(jobPostId);
    if (!jobPost) {
      throw new NotFoundError('Job post not found');
    }

    // Prevent duplicate saves
    const existingSave = await SavedJob.findOne({ jobPost: jobPostId, candidate: candidateId });
    if (existingSave) {
      throw new BadRequestError('You have already saved this job');
    }

    const newSave = new SavedJob({
      jobPost: jobPostId,
      candidate: candidateId,
    });

    await newSave.save();

    return res.status(201).json({
      success: true,
      message: 'Job saved successfully',
      savedJob: newSave,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieves all jobs the candidate has applied to
 * @route GET /api/candidate/applied-jobs
 * @access Private (Candidate only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
candidateController.getAppliedJobs = async (req, res, next) => {
  try {
    const candidateId = req.user.id;

    const appliedJobs = await JobApply.find({ candidate: candidateId })
      .populate({
        path: 'jobPost',
        populate: { path: 'companyProfile', select: 'companyName logo' },
        select: '-__v',
      })
      .select('-__v')
      .sort({ createdAt: -1 }); // Latest applications first

    return res.status(200).json({
      success: true,
      appliedJobs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieves all saved jobs for a candidate
 * @route GET /api/candidate/saved-jobs
 * @access Private (Candidate only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
candidateController.getSavedJobs = async (req, res, next) => {
  try {
    const candidateId = req.user.id;

    const savedJobs = await SavedJob.find({ candidate: candidateId })
      .populate({
        path: 'jobPost',
        populate: { path: 'companyProfile', select: 'companyName logo' },
        select: '-__v',
      })
      .select('-__v')
      .sort({ createdAt: -1 }); // Latest saved first

    return res.status(200).json({
      success: true,
      savedJobs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deletes an application (unapply from a job)
 * @route DELETE /api/candidate/applied-jobs/:applicationId
 * @access Private (Candidate only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
candidateController.deleteAppliedJob = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const applicationId = req.params.applicationId;

    const application = await JobApply.findById(applicationId);    

    // Ensure application exists and belongs to candidate
    if (!application || !application.candidate.equals(candidateId)) {
      throw new NotFoundError('Application not found or not yours');
    }

     // fetch job post
    const job = await JobPost.findById(application.jobPost);

    // console.log("testttttttttttttt", job);
    await application.deleteOne();

     // update job counters safely
    if (job) {
      job.applicantCount = Math.max(0, job.applicantCount - 1);
      job.positions.remaining += 1;

      // reopen job if it was closed
      if (job.status === 'Closed') {
        job.status = 'Published';
      }

      await job.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Application deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deletes a saved job (unsave)
 * @route DELETE /api/candidate/saved-jobs/:savedJobId
 * @access Private (Candidate only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
candidateController.deleteSavedJob = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const savedJobId = req.params.savedJobId;

    const savedJob = await SavedJob.findById(savedJobId);
    // Ensure saved job exists and belongs to candidate
    if (!savedJob || savedJob.candidate.toString() !== candidateId.toString()) {
      throw new NotFoundError('Saved job not found or not yours');
    }

    await savedJob.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Saved job deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};


// candidateController.js
candidateController.getApplicationStatus = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const { applicationId } = req.params;

    const application = await JobApply.findOne({ _id: applicationId, candidate: candidateId })
      .populate('jobPost', 'title')
      .select('status shortlisted jobPost');
    if (!application) {
      throw new NotFoundError('Application not found');
    }

    return res.status(200).json({
      success: true,
      status: application.status,
      shortlisted: application.shortlisted,
      jobTitle: application.jobPost.title,
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Get recommended jobs for candidate
 * @route GET /api/candidate/recommended-jobs?limit=10&page=1
 * @access Private (Candidate only)
 */
candidateController.getRecommendedJobs = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const { limit = 10, page = 1 } = req.query;

    const profile = await CandidateProfile.findOne({ candidate: candidateId });
    if (!profile) {
      return res.status(200).json({ success: true, recommendedJobs: [], pagination: { page: parseInt(page), limit: parseInt(limit), total: 0 } });
    }

    // Safe defaults
    const profileCats = Array.isArray(profile.categories) ? profile.categories : [];
    const profileLoc = profile.location?.city || '';
    const profileExp = profile.experience || '';
    const profileJobTypes = Array.isArray(profile.preferences?.jobTypes) ? profile.preferences.jobTypes : [];

    // Get history for similarity
    const applied = await JobApply.find({ candidate: candidateId }).select('jobPost');
    const saved = await SavedJob.find({ candidate: candidateId }).select('jobPost');
    const historyIds = [...applied, ...saved].map(h => h.jobPost);

    const historyJobs = await JobPost.find({ _id: { $in: historyIds } })
      .select('description specialisms location experience jobType offeredSalary');

    // Build match query (using specialisms as categories)
    const match = {
      status: 'Published',
      applicationDeadline: { $gte: new Date() },
      $or: [
        { specialisms: { $in: profileCats } },
        { 'location.city': profileLoc },
        { experience: profileExp },
        { jobType: { $in: profileJobTypes } },
      ].filter(Boolean) // remove empty conditions
    };

    // If no strong filters, fallback to all published
    if (Object.keys(match.$or).length === 0) delete match.$or;

    const jobs = await JobPost.find(match)
      .populate('companyProfile', 'companyName logo')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    // Score and rank
    const scoredJobs = jobs.map(job => {
      let score = 0;

      // Safe arrays
      const jobCats = Array.isArray(job.specialisms) ? job.specialisms : [];
      const jobLoc = job.location?.city || '';
      const jobExp = job.experience || '';
      const jobType = job.jobType || '';

      // Category/specialism match
      const commonCats = jobCats.filter(c => profileCats.includes(c)).length;
      score += commonCats * 20;

      // Location
      if (jobLoc && profileLoc && jobLoc.toLowerCase() === profileLoc.toLowerCase()) score += 25;

      // Experience
      if (jobExp && profileExp && jobExp === profileExp) score += 15;

      // Job Type
      if (profileJobTypes.includes(jobType)) score += 15;

      // Salary (basic)
      const jobSalaryNum = parseFloat(job.offeredSalary?.replace(/[^0-9.]/g, '') || '0');
      const expectedMin = profile.expectedSalary?.min || 0;
      if (jobSalaryNum >= expectedMin) score += 10;

      // Description similarity (NLP)
      const historyDesc = historyJobs.map(h => h.description || '').join(' ');
      const jobDesc = job.description || '';
      const similarity = getSimilarity(historyDesc, jobDesc);
      score += similarity * 15;

      return { 
        job: job.toObject(), 
        matchScore: Math.round(Math.min(score, 100))
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

    return res.status(200).json({
      success: true,
      recommendedJobs: scoredJobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: scoredJobs.length
      }
    });
  } catch (error) {
    console.error('Recommendation error:', error);
    next(error);
  }
};


/**
 * Get trending jobs (public, for non-logged-in)
 * @route GET /api/candidate/trending-jobs?limit=10&page=1
 * @access Public
 */
candidateController.getTrendingJobs = async (req, res, next) => {
  try {
    const { limit = 10, page = 1 } = req.query;

    const jobs = await JobPost.find({ 
      status: 'Published',
      applicationDeadline: { $gte: new Date() }
    })
      .populate('companyProfile', 'companyName logo')
      .sort({ applicantCount: -1, createdAt: -1 }) // Trending: high applies + recent
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Calculate trending score (views + applies * 2 + recency boost)
    const scoredJobs = jobs.map(job => {
      let score = (job.applicantCount * 2) + (job.profileViews || 0);
      
      // Recency boost: +50 if <1 week old
      const ageDays = (Date.now() - new Date(job.createdAt)) / (1000 * 86400);
      if (ageDays < 7) score += 50;
      
      return { 
        job: job.toObject(), 
        trendingScore: Math.min(Math.round(score / 10), 100) // Normalize 0-100
      };
    }).sort((a, b) => b.trendingScore - a.trendingScore);

    res.status(200).json({
      success: true,
      trendingJobs: scoredJobs,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: jobs.length }
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Fetch candidate profiles created by hr-admin or all for superadmin
 */
candidateController.getAssignedCandidateProfiles = async (req, res, next) => {
  try {
    const loggedInUser = await User.findById(req.user.id)
      .select('role candidateIds');

    if (!loggedInUser) {
      return res.status(401).json({ message: 'User not found' });
    }

    let query = {};

    /**
     * HR-ADMIN → only assigned or created candidates
     */
    if (loggedInUser.role === 'hr-admin') {
      query = {
        $or: [
          { createdBy: loggedInUser._id },
          { user: { $in: loggedInUser.candidateIds || [] } }
        ]
      };
    }

    // SUPERADMIN → all
    const profiles = await CandidateProfile.find(query)
      .select('-__v')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: profiles.length,
      data: profiles
    });

  } catch (error) {
    next(error);
  }
};


// Helper: Cosine similarity using natural TF-IDF
function getSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;
  
  const tfidf = new natural.TfIdf();
  tfidf.addDocument(text1);
  tfidf.addDocument(text2);
  
  const doc1 = tfidf.documents[0];
  const doc2 = tfidf.documents[1];
  
  let dotProduct = 0;
  const magnitude1 = Math.sqrt(Object.values(doc1).reduce((sum, val) => sum + val**2, 0));
  const magnitude2 = Math.sqrt(Object.values(doc2).reduce((sum, val) => sum + val**2, 0));

  Object.keys(doc1).forEach(key => {
    if (doc2[key]) dotProduct += doc1[key] * doc2[key];
  });

  return magnitude1 && magnitude2 ? dotProduct / (magnitude1 * magnitude2) : 0;
}

export default candidateController;