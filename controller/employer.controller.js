import mongoose from "mongoose";
import CompanyProfile from "../models/companyProfile.model.js";
import CandidateProfile from "../models/candidateProfile.model.js";
import SavedCandidate from "../models/savedCandidate.model.js";
import JobPost from "../models/jobs.model.js";
import User from "../models/user.model.js";
import { ForbiddenError, BadRequestError, NotFoundError } from "../utils/errors.js";
import { sendCompanyProfileStatusEmail, sendSuperadminAlertEmail, sendProfileDeletionEmail } from '../utils/mailer.js';
import { SUPERADMIN_EMAIL, THROTTLING_RETRY_DELAY_BASE } from "../config/env.js";
import fs from 'fs';
import path from 'path';

const employerController = {};

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
 * Retrieves all company profiles (accessible to admins and superadmins)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
employerController.getAllCompanyProfiles = async (req, res, next) => {
  try {
    // Fetch all company profiles, excluding the version key
    const profiles = await CompanyProfile.find().select('-__v');
    return res.status(200).json({
      success: true,
      profiles
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Creates a company profile for an authenticated employer, hr-admin, or superadmin
 * @param {Object} req - Request object containing employer data
 * @param {Object} res - Response object to send back the result
 * @param {Function} next - Next middleware function
 */
employerController.createCompanyProfile = async (req, res, next) => {
  try {
    const { role, id: loggedInUserId } = req.user;

    // Parse the nested data from req.body.data
    let profileData = {};
    if (req.body.data) {
      try {
        profileData = JSON.parse(req.body.data);
      } catch (err) {
        throw new BadRequestError("Invalid JSON in 'data' field");
      }
    } else {
      profileData = req.body; // Fallback in case data isn’t nested
    }

    /**
     * 2: Resolved employerId
     * -----------------------------------
     * employer   → can create ONLY own company
     * hr-admin   → can create company ONLY for employers (ACTIVE)
     * superadmin → same as hr-admin
     */

     // Resolve employerId correctly
    let employerId = loggedInUserId;
    
    if (['hr-admin', 'superadmin'].includes(role)) {
      if (!profileData.employerId.toString()) {
        throw new BadRequestError('employerId is required for HR-Admin or Superadmin');
      }
      employerId = profileData.employerId;
    }

    const { industry, functionalAreas } = profileData;

    /**
     *  FUTURE FEATURE (COMMENTED)
     * Allow HR-Admin to create OWN company
     */
    /*
    if (role === 'hr-admin' && !profileData.employerId) {
      employerId = loggedInUserId;
    }
    */

    /**
     * 3️: Validate employer user
     * -----------------------------------
     * - Must exist
     * - Must have role = employer
     * - Must be approved
     */
    const employerUser = await User.findById(employerId);
    if (!employerUser) {
      throw new BadRequestError('Employer not found');
    }

    if (employerUser.role !== 'employer') {
      throw new BadRequestError('Provided user is not an employer');
    }

    if (employerUser.status !== 'approved') {
      throw new BadRequestError(
        'Employer is not approved yet'
      );
    }

    // console.log("esggsg", employerUser);

    if (industry && !(await mongoose.model('Industry').findById(industry))) throw new BadRequestError('Invalid Industry');

    const faIds = parseField(functionalAreas);

    if (faIds.length > 0) {
      const faCount = await mongoose.model('FunctionalArea').countDocuments({ _id: { $in: faIds } });
      if (faCount !== faIds.length) throw new BadRequestError('One or more Functional Areas are invalid');
    }
    
    // Prevent duplicate company for same employer (business rule)
    const existingProfile = await CompanyProfile.findOne({ employer: employerId });
    if (existingProfile) {
      throw new BadRequestError('Company profile already exists for this employer');
    }

    // console.log("rgrdddddddd", existingProfile, employerUser);
    

    const { 
      companyName, email, phone, website, establishedSince, 
      teamSize, categories, allowInSearch, description, 
      socialMedia, location, companyType, culture, 
      revenue, founders, branches, isHiring
    } = profileData;

    // Validate required fields
    // const requiredFields = ['companyName', 'email', 'phone', 'establishedSince', 
    //                        'teamSize', 'categories', 'description', 'industry', 'companyType'];

    const requiredFields = ['companyName', 'email', 'phone', 'establishedSince', 
    'teamSize', 'description'];
    
    const missingFields = requiredFields.filter(field => !profileData[field]);
    if (missingFields.length > 0) {
      throw new BadRequestError(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // Determine initial status
    const isAdminCreator = ['hr-admin', 'superadmin'].includes(role);

    // Handle file uploads
    const files = req.files || {};
    const logo = files.logo ? `/uploads/company/${files.logo[0].filename}` : null;
    const coverImage = files.coverImage ? `/uploads/company/${files.coverImage[0].filename}` : null;

    // Create new profile
    const newProfile = new CompanyProfile({
      employer: employerId,
      createdBy: loggedInUserId, // HR/Admin or Employer

      status: isAdminCreator ? 'approved' : 'pending',
      approvedBy: isAdminCreator ? loggedInUserId : null,
      approvedAt: isAdminCreator ? new Date() : null,

      industry: profileData.industry,
      functionalAreas: parseField(profileData.functionalAreas),

      companyName,
      email,
      phone,
      website,
      establishedSince,
      teamSize,
      categories: Array.isArray(categories) ? categories : [categories],
      allowInSearch: allowInSearch !== undefined ? allowInSearch : true,
      description,
      socialMedia: typeof socialMedia === 'string' ? JSON.parse(socialMedia) : (socialMedia || {}),
      location: typeof location === 'string' ? JSON.parse(location) : (location || {}),
      industry,
      companyType,
      culture: typeof culture === 'string' ? JSON.parse(culture) : (culture || []),
      revenue,
      founders: typeof founders === 'string' ? JSON.parse(founders) : (founders || []),
      branches: typeof branches === 'string' ? JSON.parse(branches) : (branches || []),
      isHiring: isHiring !== undefined ? isHiring : false,
      logo,
      coverImage
    });

    await newProfile.save();

    // Send notification emails
    await sendCompanyProfileStatusEmail({
      recipient: employerUser.email,
      name: employerUser.name,
      companyName: newProfile.companyName,
      status: newProfile.status,
      dashboardUrl: `${process.env.FRONTEND_URL}employer-dashboard/dashboard`
    });

      // WAIT 6 SECONDS (Mailtrap throttle workaround)
    await new Promise(resolve => setTimeout(resolve, 8000)); //remove when in production

    // Alert superadmin
    await sendSuperadminAlertEmail({
      superadminEmail: SUPERADMIN_EMAIL,
      eventType: 'create_profile',
      newUserEmail: employerUser.email,
      newUserRole: 'employer',
      message: `New company profile created for ${employerUser.email} by ${loggedInUserId}`
    });

    return res.status(201).json({
      success: true,
      message: 'Company profile created successfully',
      profile: newProfile
    });
  } catch (error) {

    // Cleanup uploaded files if an error occurs after upload
    if (req.files) {
      const files = req.files;
      if (files.logo && files.logo[0]) {
        const logoPath = path.join(process.cwd(), 'public', `/uploads/company/${files.logo[0].filename}`);
        if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
      }
      if (files.coverImage && files.coverImage[0]) {
        const coverPath = path.join(process.cwd(), 'public', `/uploads/company/${files.coverImage[0].filename}`);
        if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
      }
    }

    next(error);
  }
};

/**
 * Get all pending company profiles
 * Accessible by HR-Admin and Superadmin
 *
 * HR-Admin:
 *  - Sees only company profiles created by employers assigned to them
 *
 * Superadmin:
 *  - Sees all pending company profiles
 */
employerController.getPendingCompanyProfiles = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Base filter: only pending profiles
    const filter = {
      status: 'pending',
    };

    // Optional future: restrict HR-Admin to assigned employers
    // const user = req.user;
    // if (user.role === 'hr-admin') {
    //   if (!user.employerIds || user.employerIds.length === 0) {
    //     return res.status(200).json({ success: true, profiles: [], pagination: { ... } });
    //   }
    //   filter.employer = { $in: user.employerIds };
    // }

    // Fetch pending company profiles
    const profiles = await CompanyProfile.find(filter)
      .populate('employer', 'name email')     // ref: 'User'
      .populate('createdBy', 'name email')    // ref: 'User'
      .sort({ createdAt: -1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit))
      .select('-__v');

    // Total count for pagination
    const total = await CompanyProfile.countDocuments(filter);

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
 * Get all company profiles (Admin / Superadmin)
 */
// employerController.getAllCompanyProfiles = async (req, res, next) => {
//   try {
//     const profiles = await CompanyProfile.find()
//       .populate('employer', 'name email')
//       .populate('approvedBy', 'name role')
//       .select('-__v');

//     return res.status(200).json({
//       success: true,
//       profiles
//     });
//   } catch (error) {
//     next(error);
//   }
// };


//new update company profile after next js check
// Update company profile
employerController.updateCompanyProfile = async (req, res, next) => {
  try {
    const user = req.user;
    const profileId = req.params.id;
    // const updateData = req.body;
    // const updateData = req.body.data ? JSON.parse(req.body.data) : {};
    const files = req.files || {};

// Parse updateData from req.body.data if it exists
    let updateData = {};
    if (req.body.data) {
      try {
        updateData = JSON.parse(req.body.data);
      } catch (err) {
        throw new BadRequestError("Invalid JSON in 'data' field");
      }
    } else {
      updateData = req.body; // Fallback, though unlikely with FormData
    }

    const loggedInUserId = typeof user.id === 'object' && user.id.toHexString ? user.id.toHexString() : (user.id || user._id)?.toString();

    // Find the profile by ID
    const profile = await CompanyProfile.findById(profileId);
    if (!profile) {
      throw new NotFoundError('Company profile not found');
    }


    /**
     * Permission rules
     * ---------------------------------
     * employer   → can update ONLY own profile
     * hr-admin   → can update any profile
     * superadmin → can update any profile
     */
    const profileOwnerId = profile.employer?.toString();
    const isSuperAdmin = user.role === 'superadmin' || user.role === 'hr-admin'; // hr-admin and superadmin can edit any profile
    const isOwner = loggedInUserId === profileOwnerId;

    if (!isSuperAdmin && !isOwner) {
      throw new ForbiddenError('You do not have permission to update this profile');
    }

    // Employer restriction
    // Additional check: Employers can only edit APPROVED profiles
    if (user.role === 'employer' && profile.status !== 'approved' ) {
      throw new ForbiddenError('Company profile must be approved before editing' );
    }

     /**
     * Prevent sensitive fields from being updated
     * -----------------------------------------------
     * Approval & ownership fields must be immutable here
     */
    delete updateData.status;
    delete updateData.approvedBy;
    delete updateData.approvedAt;
    delete updateData.rejectionReason;
    delete updateData.createdBy;
    delete updateData.employer;

    // Handle file uploads only if provided
    if (files.logo) {
      if (profile.logo) {
        const oldLogoPath = path.join(process.cwd(), 'public', profile.logo);
        if (fs.existsSync(oldLogoPath)) fs.unlinkSync(oldLogoPath);
      }
      updateData.logo = `/uploads/company/${files.logo[0].filename}`;
    }

    if (files.coverImage) {
      if (profile.coverImage) {
        const oldCoverPath = path.join(process.cwd(), 'public', profile.coverImage);
        if (fs.existsSync(oldCoverPath)) fs.unlinkSync(oldCoverPath);
      }
      updateData.coverImage = `/uploads/company/${files.coverImage[0].filename}`;
    }

    //  Parse JSON fields
    // const jsonFields = ['socialMedia', 'location', 'culture', 'founders', 'branches'];
    // jsonFields.forEach(field => {
    //   if (updateData[field] && typeof updateData[field] === 'string') {
    //     try {
    //       updateData[field] = JSON.parse(updateData[field]);
    //     } catch (e) {
    //       throw new BadRequestError(`Invalid format for ${field}`);
    //     }
    //   }
    // });

    if (updateData.industry) {
      if (!(await mongoose.model('Industry').findById(updateData.industry))) throw new BadRequestError('Invalid Industry');
      profile.industry = updateData.industry;
    }

    if (updateData.functionalAreas) {
      const faIds = parseField(updateData.functionalAreas);
      const faCount = await mongoose.model('FunctionalArea').countDocuments({ _id: { $in: faIds } });
      if (faCount !== faIds.length) throw new BadRequestError('Invalid Functional Areas');
      updateData.functionalAreas = faIds;
    }

    //  Handle categories array
    // if (updateData.categories) {
    //   updateData.categories = Array.isArray(updateData.categories)
    //     ? updateData.categories
    //     : [updateData.categories];
    // }

    // Update the profile
    const updatedProfile = await CompanyProfile.findByIdAndUpdate(
      profileId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Company profile updated successfully',
      profile: updatedProfile
    });
  } catch (error) {
    //  Cleanup uploaded files if an error occurs
    if (req.files) {
      const files = req.files;
      if (files.logo && files.logo[0]) {
        const logoPath = path.join(process.cwd(), 'public', `/uploads/company/${files.logo[0].filename}`);
        if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
      }
      if (files.coverImage && files.coverImage[0]) {
        const coverPath = path.join(process.cwd(), 'public', `/uploads/company/${files.coverImage[0].filename}`);
        if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
      }
    }
    next(error);
  }
};


// Get company profile
employerController.getCompanyProfile = async (req, res, next) => {
  try {
    const profileId = req.params.id;
    const { role, id: loggedInUserId } = req.user;

    const profile = await CompanyProfile.findById(profileId)
    .populate('industry', 'name')
    .populate('functionalAreas', 'name');
    if (!profile) {
      throw new NotFoundError('Company profile not found');
    }

    const profileOwnerId = profile.employer.toString();
    const isOwner = loggedInUserId.toString() === profileOwnerId;
    const isAdmin = ['hr-admin', 'superadmin'].includes(role);

    /**
     * Visibility rules
     * -----------------------------
     * candidate           → approved only
     * employer (owner)    → always allowed
     * employer (others)  → approved only
     * hr-admin/superadmin→ always allowed
     */
    // if ( profile.status !== 'approved' && !isOwner && !isAdmin ) {
    //   throw new ForbiddenError('Company profile is not approved yet');
    // }

    // Visibility Rules:
    // candidate           → approved only
    // employer (owner)    → always allowed
    // employer (others)  → ❌ not allowed
    // hr-admin/superadmin→ always allowed

    if (role === 'employer' && !isOwner) {
      throw new ForbiddenError('Access denied');
    }

    if (role === 'candidate' && profile.status !== 'approved') {
      throw new ForbiddenError('Company profile is not approved yet');
    }

    // Count active jobs for this company
    const activeJobsCount = await JobPost.countDocuments({
      companyProfile: profileId,
      status: 'Published',
      applicationDeadline: { $gte: new Date() }
    });

    return res.status(200).json({
      success: true,
      profile,
      activeJobsCount
    });

  } catch (error) {
    next(error);
  }
};


/**
 * Retrieves company profiles for the logged-in employer
 * @param {Object} req - Request object, with authenticated user info in req.user
 * @param {Object} res - Response object to send the result
 * @param {Function} next - Next middleware function for error handling
 */
employerController.getCompanyProfilesForEmployer = async (req, res, next) => {
  try {
    const employerId = req.user.id;

    // Fetch only company profiles that belong to this employer
    const profiles = await CompanyProfile
      .find({ employer: employerId })
      .select('-__v');

    // No profiles found
    if (!profiles || profiles.length === 0) {
      return res.status(200).json({
        success: true,
        profiles: [],
        message: "No company profile found for this employer",
      });
    }

    return res.status(200).json({
      success: true,
      profiles,
    });
  } catch (error) {
    next(error);
  }
};




/**
 * Deletes a company profile and associated files
 * @param {Object} req - Request object containing profile ID and user info
 * @param {Object} res - Response object to send back the result
 * @param {Function} next - Next middleware function
 */
employerController.deleteCompanyProfile = async (req, res, next) => {
  try {
    const user = req.user;
    const profileId = req.params.id;

    // Find the profile by ID
    const profile = await CompanyProfile.findById(profileId);
    if (!profile) {
      throw new NotFoundError('Company profile not found');
    }

    // Fetch employer user from users collection
    const employerUser = await User.findById(profile.employer).select('name email');

    // Check permissions: allow if user is superadmin or the original creator (employer)
    const isAdmin = ['superadmin', 'hr-admin'].includes(req.user.role);
    const isOwner = profile.employer._id.toString() === user.id.toString();

    if (!isAdmin && !isOwner) {
      throw new ForbiddenError('You do not have permission to delete this profile');
    }


     // Determine name & email from user table
    const employerName = employerUser?.name || profile.companyName;
    const employerEmail = employerUser?.email || profile.email;

     // Fetch deleting user
    const deletingUser = await User.findById(user.id).select('email role');

     let deletedByLabel = '';
    let superadminMessage = '';

    if (isOwner) {
      deletedByLabel = employerEmail; // candidate/employer email
      superadminMessage = `Employer ${employerEmail} deleted their own company profile`;
    } else {
      deletedByLabel =
        deletingUser?.email ||
        (deletingUser?.role === 'superadmin' ? 'Super Admin' : 'HR Admin');

      superadminMessage = `Company profile deleted for ${employerEmail} by ${deletedByLabel}`;
    }

    // Delete associated files if they exist
    if (profile.logo) {
      const logoPath = path.join(process.cwd(), 'public', profile.logo);
      try {
        await fs.unlink(logoPath);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error(`Failed to delete logo: ${err.message}`);
        }
      }
    }

    // if (profile.coverImage) {
    //   const coverPath = path.join(process.cwd(), 'public', profile.coverImage);
    //   try {
    //     await fs.unlink(coverPath);
    //   } catch (err) {
    //     if (err.code !== 'ENOENT') {
    //       console.error(`Failed to delete cover image: ${err.message}`);
    //     }
    //   }
    // }

    // Delete the profile from the database
    await CompanyProfile.findByIdAndDelete(profileId);

    // Email employer
    await sendProfileDeletionEmail({
      recipient: employerEmail,
      name: employerName,
      role: 'employer',
      deletedBy: deletedByLabel
    });

    // Mailtrap throttle workaround
    await new Promise(resolve => setTimeout(resolve, 8000)); //remove when in production

    // Notify superadmin
    await sendSuperadminAlertEmail({
      superadminEmail: SUPERADMIN_EMAIL,
      eventType: 'deleted',
      newUserEmail: employerEmail,
      newUserRole: 'employer',
      message: superadminMessage,
      actorEmail: deletedByLabel
    });

    return res.status(200).json({
      success: true,
      message: 'Company profile deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve or reject company profile
 * HR-Admin / Superadmin only
 */
employerController.approveCompanyProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const adminId = req.user.id;

    if (!['approved', 'rejected'].includes(status)) {
      throw new BadRequestError('Invalid status value');
    }

    const profile = await CompanyProfile.findById(id);
    if (!profile) {
      throw new NotFoundError('Company profile not found');
    }

     // Fetch employer user from users table
    const employerUser = await User.findById(profile.employer).select("name email");

    profile.status = status;
    profile.approvedBy = adminId;
    profile.approvedAt = new Date();
    profile.rejectionReason =
      status === 'rejected' ? rejectionReason : null;

    await profile.save();

    // Who approved
    const adminUser = await User.findById(req.user.id).select('email role');
    const actionBy = adminUser?.email || (adminUser?.role === 'superadmin' ? 'Super Admin' : 'HR Admin');

    const employerName = employerUser?.name || profile.companyName;
    const employerEmail = employerUser?.email || profile.email;

    // Send email to employer
    await sendCompanyProfileStatusEmail({
      recipient: employerEmail,
      name: employerName,
      companyName: profile.companyName,
      status,
      rejectionReason,
      dashboardUrl: `${process.env.FRONTEND_URL}employer-dashboard/dashboard`,
      actionBy
    });

    // Mailtrap throttle workaround
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Notify superadmin
    await sendSuperadminAlertEmail({
      superadminEmail: SUPERADMIN_EMAIL,
      eventType: status === 'approved' ? 'approved' : 'rejected',
      newUserEmail: employerEmail,
      newUserRole: 'employer',
      message: `Company profile ${status} for ${employerEmail} by ${actionBy}`,
      actorEmail: actionBy
    });

    return res.status(200).json({
      success: true,
      message: `Company profile ${status} successfully`,
      profile
    });
  } catch (error) {
    next(error);
  }
};


// employer.controller.js (add these)

/**
 * Save a candidate profile to employer's talent pool
 * @route POST /api/employer/saved-candidates/:candidateId
 */
employerController.saveCandidate = async (req, res, next) => {
  try {
    const employerId = req.user.id;
    const candidateId = req.params.candidateId;

    const candidateProfile = await CandidateProfile.findOne({ candidate: candidateId });
    if (!candidateProfile) throw new NotFoundError('Candidate not found');

    const existingSave = await SavedCandidate.findOne({ employer: employerId, candidate: candidateId });
    if (existingSave) throw new BadRequestError('Candidate already saved');

    const newSave = new SavedCandidate({
      employer: employerId,
      candidate: candidateId,
      candidateProfile: candidateProfile._id,
      notes: req.body.notes || '',
      folder: req.body.folder || 'General',
    });

    await newSave.save();

    // Increment savedCount on profile
    await CandidateProfile.updateOne({ _id: candidateProfile._id }, { $inc: { savedCount: 1 } });

    res.status(201).json({
      success: true,
      message: 'Candidate saved to talent pool',
      savedCandidate: newSave
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Unsave a candidate from talent pool
 * @route DELETE /api/employer/saved-candidates/:savedId
 */
employerController.unsaveCandidate = async (req, res, next) => {
  try {
    const employerId = req.user.id;
    const savedId = req.params.savedId;

    // console.log("testtttt", savedId);
    

    const saved = await SavedCandidate.findById(savedId);
    if (!saved || saved.employer.toString() !== employerId.toString()) throw new NotFoundError('Saved candidate not found');

    const candidateProfileId = saved.candidateProfile;

    await saved.deleteOne();

    // Decrement savedCount
    await CandidateProfile.updateOne({ _id: candidateProfileId }, { $inc: { savedCount: -1 } });

    res.status(200).json({
      success: true,
      message: 'Candidate removed from talent pool'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get employer's saved candidates with filters
 * @route GET /api/employer/saved-candidates?folder=General&search=John&page=1&limit=10
 */
employerController.getSavedCandidates = async (req, res, next) => {
  try {
    const employerId = req.user.id;
    const { folder, search, page = 1, limit = 10 } = req.query;

    let query = { employer: employerId };
    if (folder) query.folder = folder;

    const total = await SavedCandidate.countDocuments(query);

    const saved = await SavedCandidate.find(query)
      .populate({
        path: 'candidateProfile',
        select: 'fullName jobTitle location profilePhoto expectedSalary categories'
      })
      .populate('candidate', 'name email')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      savedCandidates: saved,
      pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total, limit: parseInt(limit) }
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Get all active (Published) jobs posted by a specific employer/company
 * @route GET /api/employer-dashboard/company/:id/jobs?limit=10&page=1
 * @access Public
 */
employerController.getActiveJobsByEmployer = async (req, res, next) => {
  try {
    const companyId = req.params.id;

    // Validate company exists
    const company = await CompanyProfile.findById(companyId);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const { limit = 10, page = 1 } = req.query;

    const jobs = await JobPost.find({
      companyProfile: companyId,
      status: 'Published',
      applicationDeadline: { $gte: new Date() }
    })
      .select('title location jobType offeredSalary positions remoteWork createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await JobPost.countDocuments({
      companyProfile: companyId,
      status: 'Published',
      applicationDeadline: { $gte: new Date() }
    });

    res.status(200).json({
      success: true,
      companyName: company.companyName,
      totalJobs: total,
      jobs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Fetch company profiles created by hr-admin or all for superadmin
 */
employerController.getAssignedCompanyProfiles = async (req, res, next) => {
  try {
    const loggedInUser = await User.findById(req.user.id)
      .select('role employerIds');

    if (!loggedInUser) {
      return res.status(401).json({ message: 'User not found' });
    }

    let query = {};

    /**
     * HR-ADMIN rules
     * -------------------------
     * 1. Profiles created by hr-admin
     * 2. Profiles belonging to assigned employers
     */
    if (loggedInUser.role === 'hr-admin') {
      query = {
        $or: [
          { createdBy: loggedInUser._id },
          { employer: { $in: loggedInUser.employerIds || [] } }
        ]
      };
    }

    // SUPERADMIN → sees all
    const profiles = await CompanyProfile.find(query)
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



// employerDashboardController.getSummary = async (req, res, next) => {
//   try {
//     const employerId = req.user.id;

//     const jobs = await JobPost.find({ employer: employerId });
//     const jobIds = jobs.map(j => j._id);

//     const totalJobs = jobs.length;

//     const applicationsAgg = await Application.aggregate([
//       { $match: { jobPost: { $in: jobIds } } },
//       {
//         $group: {
//           _id: "$status",
//           count: { $sum: 1 }
//         }
//       }
//     ]);

//     const totalApplications = applicationsAgg.reduce((a, b) => a + b.count, 0);
//     const shortlisted = await Application.countDocuments({
//       jobPost: { $in: jobIds },
//       shortlisted: true
//     });

//     const recentApplicants = await Application.find({
//       jobPost: { $in: jobIds }
//     })
//       .populate("candidate", "name profilePhoto")
//       .populate("candidateProfile", "jobTitle")
//       .populate("jobPost", "title")
//       .sort({ createdAt: -1 })
//       .limit(5);

//     res.json({
//       success: true,
//       metrics: {
//         totalJobs,
//         totalApplications,
//         shortlisted,
//       },
//       recentApplicants
//     });
//   } catch (err) {
//     next(err);
//   }
// };


export default employerController;