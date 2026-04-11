// auth.controller.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { JWT_SECRET, JWT_EXPIRES_IN, SUPERADMIN_EMAIL, THROTTLING_RETRY_DELAY_BASE } from "../config/env.js";
import crypto from 'crypto';
import { sendPasswordResetEmail, sendWelcomeEmail, sendSuperadminAlertEmail, sendUserStatusUpdateEmail, sendPasswordResetSuccessEmail, sendAdminPasswordResetEmail, sendProfileDeletionEmail, sendLoginOtpEmail } from '../utils/mailer.js';
import { BadRequestError, ForbiddenError,NotFoundError} from '../utils/errors.js';
import { isValidEmailAddress, normalizeEmail } from "../utils/emailValidation.js";

import { log } from "console";

import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const LOGIN_OTP_EXPIRY_MINUTES = 10;
const LOGIN_OTP_MAX_ATTEMPTS = 5;

// Authentication controller object
const authentication = {};

const generateSixDigitOtp = () => `${crypto.randomInt(100000, 1000000)}`;

const hashLoginOtp = (otp, userId) => {
  return crypto
    .createHash('sha256')
    .update(`${otp}:${String(userId)}:${JWT_SECRET}`)
    .digest('hex');
};

const resolveLoginOtpRecipient = (user) => {
  if (user.role === 'candidate') {
    if (user.isSystemGeneratedEmail) return null;
    return user.email;
  }

  if (user.role === 'employer') {
    if (user.isSystemGeneratedEmail) {
      return user.contactEmail?.trim()?.toLowerCase() || null;
    }
    return user.email;
  }

  return null;
};

/**
 * Registers a new user (candidate or employer) with transaction support
 * @param {Object} req - Request object containing name, email, password, and role
 * @param {Object} res - Response object to send back the result
 * @param {Function} next - Next middleware function for error handling
 */
authentication.signup = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { name, email, password, role } = req.body;
        const normalizedEmail = normalizeEmail(email);
        // Only allow candidate, employer, hr-admin roles on signup
        const safeRole = ['candidate', 'employer', 'hr-admin'].includes(role) ? role : 'candidate';

        // Validate required fields
        if (!name || !normalizedEmail || !password) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'All fields (name, email, password) are required' });
        }

        if (!isValidEmailAddress(normalizedEmail)) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: "Please enter a valid email address" });
        }

        // Check for existing users with the same email.
        // If all existing records are deleted/deactivated, purge them and allow fresh signup.
        const existingUsers = await User.find({ email: normalizedEmail })
          .sort({ createdAt: -1 })
          .session(session);

        if (existingUsers.length > 0) {
            const hasActiveAccount = existingUsers.some(
              (user) => user.isActive && !user.isDeleted
            );

            if (hasActiveAccount) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: "User already exists" });
            }

            await User.deleteMany({ email: normalizedEmail }).session(session);
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // ✅ New: Automatically approve everyone for now
        const status = 'approved';
        
        // old approval logic (we can handle in frontend for now)
         // Approval logic
        // const status = ['candidate', 'employer'].includes(safeRole)
        //   ? 'pending'
        //   : 'approved';

        // Create new user with optional role (defaults to 'candidate' in schema)
        const newUser = new User({
          name,
          email: normalizedEmail,
          password: hashedPassword,
          role: safeRole,
          status
        });
        await newUser.save({ session });

        // Generate JWT token
        const token = jwt.sign({ userId: newUser._id, role: newUser.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // Commit transaction and end session
        await session.commitTransaction();
        session.endSession();

        // Send welcome email to new user
        await sendWelcomeEmail({ recipient: normalizedEmail, name });

        // Small delay for Mailtrap
        await new Promise(resolve => setTimeout(resolve, 6000)); //remove when in production

        await sendSuperadminAlertEmail({
          superadminEmail: SUPERADMIN_EMAIL,
          eventType: 'new_registration',
          userEmail: normalizedEmail,
          userRole: safeRole,
          message: 'New user registration via signup form'
        });

        // Send success response
        return res.status(201).json({
            success: true,
            message: "User created successfully",
            user: {
                token,
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                status: newUser.status
            }
        });
    } catch (error) {
        console.error("Error in authentication.signup:", error);
        await session.abortTransaction();
        session.endSession();
        next(error); // Pass to error middleware
    }
};

/**
 * hr-admin or superadmin creates an employer or candidate account
 * @param {Object} req - Request object containing name, email, password, and role
 * @param {Object} res - Response object to send back the result
 * @param {Function} next - Next middleware function for error handling
 */
authentication.createAdminUser = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { name, email, password, role, assignedHrAdminId } = req.body;
    const creator = req.user; // hr-admin or superadmin

     // Only hr-admin or superadmin can access this API
    if (!['hr-admin', 'superadmin'].includes(creator.role)) {
      return res.status(403).json({ message: 'Not allowed, Only hr-admin or superadmin can create employer accounts' });
    }

    // Basic validation
    if (!name || !password) {
      return res.status(400).json({
        message: 'Name and password are required'
      });
    }

    // ❌ Prevent creating superadmin via API
    if (role === 'superadmin') {
      return res.status(403).json({
        message: 'Superadmin accounts cannot be created via API'
      });
    }

    // Role permission matrix
    const rolePermissions = {
      'hr-admin': ['employer', 'candidate'],
      'superadmin': ['employer', 'candidate', 'hr-admin']
    };

    if (!rolePermissions[creator.role]?.includes(role)) {
      return res.status(403).json({
        message: `You are not allowed to create ${role} accounts`
      });
    }

    /** new requirement for keeping confendicial employers emails */
    // Generate internal email if not provided
    let finalEmail = normalizeEmail(email);

    let isSystemGeneratedEmail = false;

    if (!finalEmail) {
      const randomSuffix = Math.floor(Math.random() * 100000);
      finalEmail = `${role}_${Date.now()}_${randomSuffix}@internal.coimbatorejobs.in`;
      isSystemGeneratedEmail = true;
    }

    if (!isSystemGeneratedEmail && !isValidEmailAddress(finalEmail)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: 'Please enter a valid email address'
      });
    }

    // Check uniqueness
    const existing = await User.findOne({ email: finalEmail }).session(session);
    if (existing) {
      return res.status(400).json({
        message: 'User already exists with this email'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate Login ID
    const loginId = `${role.substring(0,3).toUpperCase()}-${Date.now().toString().slice(-6)}`;

    // Determine creatorId (for assignment)
    let creatorId = creator.id;

   // Auto approved because admin creates
    const [user] = await User.create([{
      name,
      email: finalEmail,
      password: hashedPassword,
      role,
      status: 'approved',
      createdBy: creatorId,
      isSystemGeneratedEmail,
      loginId
    }], { session });

    // AUTO ASSIGN EMPLOYER TO HR-ADMIN
   if (creator.role === 'hr-admin') {
      const updateField =
        role === 'employer'
          ? { employerIds: user._id }
          : { candidateIds: user._id };

      await User.updateOne(
        { _id: creator.id },
        { $addToSet: updateField },
        { session }
      );
    }

    // If Superadmin creates HR Admin → assign to hrAdminIds
    if (creator.role === 'superadmin' && role === 'hr-admin') {
      await User.updateOne(
        { _id: creator.id },
        { $addToSet: { hrAdminIds: user._id } },
        { session }
      );
    }

    // SUPERADMIN creates employer/candidate → assign to selected HR Admin
    if (creator.role === 'superadmin' && ['employer', 'candidate'].includes(role)) {
      if (!assignedHrAdminId) {
        return res.status(400).json({ message: 'HR Admin must be selected for assignment' });
      }

      const hrAdmin = await User.findById(assignedHrAdminId).session(session);
      if (!hrAdmin || hrAdmin.role !== 'hr-admin') {
        return res.status(400).json({ message: 'Invalid HR Admin selected' });
      }

      const updateField = role === 'employer'
        ? { employerIds: user._id }
        : { candidateIds: user._id };

      await User.updateOne({ _id: assignedHrAdminId }, { $addToSet: updateField }, { session });
    }

    await session.commitTransaction();
    session.endSession();

    const createdByLabel = creator.email || (creator.role === 'superadmin' ? 'Super Admin' : 'HR Admin');

     // Send welcome email only if real email provided
    if (!isSystemGeneratedEmail) {
      await sendWelcomeEmail({
        recipient: finalEmail,
        name,
        createdBy: createdByLabel,
        role
      });

      await sendSuperadminAlertEmail({
        superadminEmail: SUPERADMIN_EMAIL,
        eventType: 'new_registration',
        userEmail: finalEmail,
        userRole: role,
        message: `${role} account created by ${createdByLabel}`,
        actorEmail: creator.email || (creator.role === 'superadmin' ? 'Super Admin' : 'HR Admin')
      });
    }

    // Small delay for Mailtrap
    // await new Promise(resolve => setTimeout(resolve, 6000)); //remove when in production

    res.status(201).json({
      success: true,
      message: `${role} created & assigned successfully`,
      data: {
        _id: user._id,
        name: user.name,
        role: user.role,
        email: user.isSystemGeneratedEmail ? null : user.email,
        loginId: user.loginId,
        isSystemGeneratedEmail: user.isSystemGeneratedEmail
      }
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

 
/**
 * Fetch employers/candidates belonging to hr-admin or all for superadmin
 */
authentication.getAssignedUsers = async (req, res, next) => {
  try {
    const { roles } = req.query;
 
    // IMPORTANT: fetch fresh user from DB
    const loggedInUser = await User.findById(req.user.id)
      .select('role employerIds candidateIds');
 
    if (!loggedInUser) {
      return res.status(401).json({ message: 'User not found' });
    }
 
    let roleFilter;

    if (roles) {
      roleFilter = roles.split(',').map(r => r.trim());
    } else {
      // Default behavior
      roleFilter =
        loggedInUser.role === 'superadmin'
          ? ['employer', 'candidate', 'hr-admin']
          : ['employer', 'candidate'];
    }

    const includesHrAdminRole = roleFilter.includes('hr-admin');
    const includesAssignableRole = roleFilter.some((role) => ['employer', 'candidate'].includes(role));
    const shouldApplyAssignedFilter = includesAssignableRole && !includesHrAdminRole;
 
    let query = {
      role: { $in: roleFilter },
      isActive: true,
      $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }]
    };
 
    // console.log("test", query);
   
 
    // HR-ADMIN → ONLY ASSIGNED USERS
    // if (loggedInUser.role === 'hr-admin') {
    //   query.createdBy = loggedInUser.id; 
    // }
    /**
     * HR-ADMIN → ONLY USERS ASSIGNED TO THEM
     */
    if (shouldApplyAssignedFilter) {
      let assignedIds = [];

      // HR-ADMIN -> users assigned to this HR-admin
      if (loggedInUser.role === 'hr-admin') {
        assignedIds = [
          ...(loggedInUser.employerIds || []),
          ...(loggedInUser.candidateIds || [])
        ];
      }

      // SUPERADMIN -> users assigned to any HR-admin
      if (loggedInUser.role === 'superadmin') {
        const hrAdmins = await User.find({ role: 'hr-admin', isActive: true })
          .select('employerIds candidateIds');

        assignedIds = hrAdmins.flatMap((hrAdmin) => ([
          ...(hrAdmin.employerIds || []),
          ...(hrAdmin.candidateIds || [])
        ]));
      }

      query._id = { $in: [...new Set(assignedIds.map((id) => id.toString()))] };
    }
 
    // SUPERADMIN → sees all
    const users = await User.find(query, { password: 0 })
      .sort({ createdAt: -1 });
 
    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
 
  } catch (error) {
    next(error);
  }
};


/**
 * Authenticates a user and returns a JWT token
 * @param {Object} req - Request object containing email and password
 * @param {Object} res - Response object to send back authentication result
 * @param {Function} next - Next middleware function for error handling
 */
authentication.signin = async (req, res, next) => {
    try {
        const { identifier, password, requestedRole } = req.body;
        const normalizedIdentifier = identifier?.trim();
        const normalizedEmailIdentifier = normalizedIdentifier?.toLowerCase();
        const normalizedRequestedRole = requestedRole?.trim()?.toLowerCase();
        // identifier = email OR loginId

        // Validate required fields
        if (!normalizedIdentifier || !password) {
            return res.status(400).json({ message: "Login ID/Email and password are required" });
         }

        if (normalizedIdentifier.includes('@') && !isValidEmailAddress(normalizedEmailIdentifier)) {
          return res.status(400).json({ message: "Please enter a valid email address" });
        }

        // Prefer the latest active account and ignore soft-deleted users.
        let user = await User.findOne({
            isActive: true,
            $or: [
              { isDeleted: false },
              { isDeleted: { $exists: false } }
            ],
            $and: [{
              $or: [
                { email: normalizedEmailIdentifier },
                { loginId: normalizedIdentifier }
              ]
            }]
        }).sort({ createdAt: -1 });

        // If no active user was found, look for any matching record to return a precise message.
        if (!user) {
          user = await User.findOne({
            $or: [
              { email: normalizedEmailIdentifier },
              { loginId: normalizedIdentifier }
            ]
          }).sort({ createdAt: -1 });
        }

        if (!user) {
            const registerLabel = normalizedRequestedRole === 'employer' ? 'Employer' : 'Candidate';
            return res.status(404).json({
              message: `User not found. Please register as ${registerLabel} first.`
            });
        }

        // Check if account active
        if (!user.isActive || user.isDeleted) {
            return res.status(403).json({ message: "User account is deactivated" });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid Password" });
        }

        // Prevent OTP send/login when user attempts with wrong role tab.
        if (normalizedRequestedRole === 'candidate' && user.role !== 'candidate') {
          return res.status(403).json({
            message: `Account is registered as ${user.role}. Please login via Employer tab.`
          });
        }

        if (
          normalizedRequestedRole === 'employer' &&
          !['employer', 'hr-admin', 'superadmin'].includes(user.role)
        ) {
          return res.status(403).json({
            message: `Account is registered as ${user.role}. Please login via Candidate tab.`
          });
        }

        // Check approval status for candidate and employer roles(for now this we can handle in frontend)
        // if (user.status !== 'approved') {
        //   return res.status(403).json({
        //     message: `Account is ${user.status}. Please wait for approval.`
        //   });
        // }


        if (['candidate', 'employer'].includes(user.role)) {
          const otpRecipient = resolveLoginOtpRecipient(user);
          if (!otpRecipient) {
            return res.status(403).json({
              message: `${user.role === 'employer' ? 'Employer' : 'Candidate'} account does not have a valid email for OTP login`
            });
          }

          const otp = generateSixDigitOtp();
          const otpHash = hashLoginOtp(otp, user._id);
          const otpExpiresAt = new Date(Date.now() + LOGIN_OTP_EXPIRY_MINUTES * 60 * 1000);

          user.loginOtpHash = otpHash;
          user.loginOtpExpiresAt = otpExpiresAt;
          user.loginOtpAttempts = 0;
          await user.save({ validateBeforeSave: false });

          await sendLoginOtpEmail({
            recipient: otpRecipient,
            name: user.name,
            otp,
            expiresInMinutes: LOGIN_OTP_EXPIRY_MINUTES,
            role: user.role
          });

          const challengeToken = jwt.sign(
            { userId: user._id, role: user.role, purpose: 'login_otp' },
            JWT_SECRET,
            { expiresIn: `${LOGIN_OTP_EXPIRY_MINUTES}m` }
          );

          return res.status(200).json({
            success: true,
            requiresOtp: true,
            message: 'OTP sent to your email. Please verify to continue.',
            otpExpiresInSeconds: LOGIN_OTP_EXPIRY_MINUTES * 60,
            challengeToken,
            user: {
              id: user._id,
              name: user.name,
              role: user.role,
              status: user.status,
              loginId: user.loginId || null,
              email: user.email,
              isSystemGeneratedEmail: user.isSystemGeneratedEmail
            }
          });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // Send success response
        return res.status(200).json({
            success: true,
            message: "User signed in successfully",
            user: {
                token,
                id: user._id,
                name: user.name,
                role: user.role,
                status: user.status,
                loginId: user.loginId || null,
                // Hide internal email from frontend
                email: user.isSystemGeneratedEmail ? null : user.email,
                isSystemGeneratedEmail: user.isSystemGeneratedEmail

            }
        });
    } catch (error) {
        console.error("Error in authentication.signin:", error);
        next(error);
    }
};

authentication.verifySigninOtp = async (req, res, next) => {
  try {
    const { challengeToken, otp } = req.body;

    if (!challengeToken || !otp) {
      return res.status(400).json({ message: 'challengeToken and otp are required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(challengeToken, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: 'OTP session expired. Please login again.' });
    }

    if (decoded.purpose !== 'login_otp' || !decoded.userId) {
      return res.status(401).json({ message: 'Invalid OTP session. Please login again.' });
    }

    const user = await User.findById(decoded.userId).select('+loginOtpHash +loginOtpExpiresAt');
    if (!user || !['candidate', 'employer'].includes(user.role)) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.isActive || user.isDeleted) {
      return res.status(403).json({ message: 'User account is deactivated' });
    }

    if (!user.loginOtpHash || !user.loginOtpExpiresAt) {
      return res.status(400).json({ message: 'No OTP request found. Please login again.' });
    }

    if (new Date() > new Date(user.loginOtpExpiresAt)) {
      user.loginOtpHash = undefined;
      user.loginOtpExpiresAt = undefined;
      user.loginOtpAttempts = 0;
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({ message: 'OTP expired. Please login again.' });
    }

    if ((user.loginOtpAttempts || 0) >= LOGIN_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ message: 'Too many incorrect OTP attempts. Please login again.' });
    }

    const normalizedOtp = String(otp).trim();
    const incomingHash = hashLoginOtp(normalizedOtp, user._id);

    if (incomingHash !== user.loginOtpHash) {
      user.loginOtpAttempts = (user.loginOtpAttempts || 0) + 1;
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    user.loginOtpHash = undefined;
    user.loginOtpExpiresAt = undefined;
    user.loginOtpAttempts = 0;
    await user.save({ validateBeforeSave: false });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.status(200).json({
      success: true,
      message: 'User signed in successfully',
      user: {
        token,
        id: user._id,
        name: user.name,
        role: user.role,
        status: user.status,
        loginId: user.loginId || null,
        email: user.isSystemGeneratedEmail ? null : user.email,
        isSystemGeneratedEmail: user.isSystemGeneratedEmail
      }
    });
  } catch (error) {
    console.error('Error in authentication.verifySigninOtp:', error);
    next(error);
  }
};

// Backward compatibility
authentication.verifyCandidateSigninOtp = authentication.verifySigninOtp;


/**
 * Allows an authenticated user to change their password
 * @param {Object} req - Request object containing currentPassword, newPassword, and confirmPassword
 * @param {Object} res - Response object to send back the result
 * @param {Function} next - Next middleware function for error handling
 */
authentication.changePassword = async(req, res, next) => {
    try {

        const userId = req.user.id; // Get user ID from authenticated request
        const { currentPassword, newPassword, confirmPassword } = req.body;

        //validate required fields
        if(!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ message: "Current password, new password and confirm password are required" });
        }

        if(newPassword !== confirmPassword) {
            return res.status(400).json({ message: "New password and confirm password do not match" });
        }

        // Find user by ID
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedNewPassword = await bcrypt.hash(newPassword, salt);
        // Update user's password
        user.password = hashedNewPassword;
        await user.save({ validateBeforeSave: false });
        // Send success response
        return res.status(200).json({
            success: true,
            message: "Password changed successfully"
        });

        
    } catch (error) {
        console.error("Error in authentication.changePassword:", error);
        next(error);
    }
} 


/**
 * Allows admin or superadmin to change their password
 * @param {Object} req - Request object containing currentPassword, newPassword, and confirmPassword
 * @param {Object} res - Response object to send back the result
 * @param {Function} next - Next middleware function for error handling
 */
authentication.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return res.status(400).json({ message: 'Email is required' });
    if (!isValidEmailAddress(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+resetPasswordToken +resetPasswordExpire');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Generate one-time nonce + signed reset token
    const resetNonce = crypto.randomBytes(32).toString('hex');
    const resetToken = jwt.sign(
      { purpose: 'password_reset', userId: String(user._id), nonce: resetNonce },
      JWT_SECRET,
      { expiresIn: '10m' }
    );
    const resetTokenHash = crypto.createHash('sha256').update(resetNonce).digest('hex');

    // Save token and expiry in user doc
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 mins
    await user.save();

    // Send reset email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${encodeURIComponent(resetToken)}`;
    await sendPasswordResetEmail({
      recipient: user.email,
      name: user.name || user.email,
      resetUrl
    });

    res.status(200).json({ success: true, message: 'Password reset link sent to your email' });
  } catch (error) {
    console.error('Error in forgotPassword:', error);
    next(error);
  }
};



authentication.resetPasswordWithToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword)
      return res.status(400).json({ message: 'New password and confirm password are required' });

    if (newPassword !== confirmPassword)
      return res.status(400).json({ message: 'Passwords do not match' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(400).json({ message: 'Reset token is invalid or expired' });
    }

    if (decoded?.purpose !== 'password_reset' || !decoded?.userId || !decoded?.nonce) {
      return res.status(400).json({ message: 'Reset token is invalid or expired' });
    }

    // Find user with valid one-time nonce
    const user = await User.findOne({
      _id: decoded.userId,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user)
      return res.status(400).json({ message: 'Reset token is invalid or expired' });

    const expectedHash = crypto.createHash('sha256').update(decoded.nonce).digest('hex');
    if (!user.resetPasswordToken || user.resetPasswordToken !== expectedHash) {
      return res.status(400).json({ message: 'Reset token is invalid or already used' });
    }

    // Set new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    // Send password reset success email
    await sendPasswordResetSuccessEmail({ recipient: user.email, name: user.name });

    res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('Error in resetPasswordWithToken:', error);
    next(error);
  }
};


authentication.adminResetUserPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) return res.status(400).json({ message: 'New password is required' });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    // Send admin reset notification email to user
    await sendAdminPasswordResetEmail({
      recipient: user.email,
      name: user.name,
      adminEmail: req.user.email
    });
    // Send alert to superadmin
    await sendSuperadminAlertEmail({
      superadminEmail: SUPERADMIN_EMAIL,
      eventType: 'password_reset',
      newUserEmail: user.email,
      newUserRole: user.role,
      message: `Admin reset password for user ${user.email} by ${req.user.email}`,
      actorEmail: req.user.email
    });

    res.status(200).json({
      success: true,
      message: `Password reset successfully for user ${user.email}`
    });
  } catch (error) {
    console.error('Error in adminResetUserPassword:', error);
    next(error);
  }
};

/**
 * Fetch users based on role filters
 * Accessible only to HR-Admin and Superadmin
 *
 * Query Params:
 * roles=employer
 * roles=candidate
 * roles=employer,candidate
 */
authentication.getUsersByRole = async (req, res, next) => {
  try {
    const { roles, page = 1, limit = 20, status, search } = req.query;

    // Default roles
    let roleFilter = ['candidate', 'employer'];
    if (roles) {
      roleFilter = roles.split(',').map(r => r.trim());
    }

    // Base query
    let query = {
      role: { $in: roleFilter },
      isActive: true,
      $or: [
        { isDeleted: false },
        { isDeleted: { $exists: false } }
      ]
    };

    // Optional status filter
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (normalizedStatus && normalizedStatus !== 'all') {
      const allowedStatuses = ['pending', 'approved', 'rejected'];
      if (allowedStatuses.includes(normalizedStatus)) {
        if (normalizedStatus === 'pending') {
          // Backward compatibility: old users may have missing/null status; treat them as pending.
          query.$and = query.$and || [];
          query.$and.push({
            $or: [
              { status: 'pending' },
              { status: { $exists: false } },
              { status: null },
            ],
          });
        } else {
          query.status = normalizedStatus;
        }
      }
    }

    // Optional keyword search across key fields
    const normalizedSearch = String(search || '').trim();
    if (normalizedSearch) {
      const regex = new RegExp(normalizedSearch, 'i');
      query.$and = [
        {
          $or: [
            { name: regex },
            { email: regex },
            { loginId: regex },
            { contactEmail: regex },
            { role: regex },
            { status: regex },
          ],
        },
      ];
    }

    /**
     * HR-ADMIN RULE:
     * Show only users assigned to this HR-admin
     */
    // if (loggedInUser.role === 'hr-admin') {
    //   query.createdBy = loggedInUser.id; 
    // }

    /**
     * SUPERADMIN:
     * No restriction
     */

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.max(1, parseInt(limit, 10) || 20);
    const skip = (pageNumber - 1) * limitNumber;
    const usersPromise = User.find(query, { password: 0 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    const countPromise = User.countDocuments(query);

    const [users, totalCount] = await Promise.all([usersPromise, countPromise]);

    res.status(200).json({
      success: true,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(totalCount / limitNumber),
      totalCount,
      data: users
    });
  } catch (error) {
    console.error('Error in getUsersByRole:', error);
    next(error);
  }
};
 

/**
 * Approve or reject a user account
 * Accessible only to HR-Admin and Superadmin
 *
 * Body Params:
 * status: 'approved' | 'rejected'
 */
authentication.updateUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    // console.log("statussssssssssssss", status);
    if (!['approved', 'rejected'].includes(status)) {
      throw new Error('Invalid status');
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    // Send status update email to user
    await sendUserStatusUpdateEmail({
      recipient: user.email,
      name: user.name,
      status: status,
      role: user.role
    });
    // Send alert to superadmin (if not superadmin updating)
    if (req.user.role !== 'superadmin') {
      await sendSuperadminAlertEmail({
        superadminEmail: SUPERADMIN_EMAIL,
        eventType: status === 'approved' ? 'approved' : 'rejected',
        userEmail: user.email,
        userRole: user.role,
        message: `User status updated to ${status} by ${req.user.email}`,
        actorEmail: req.user.email
      });
    }

    res.status(200).json({
      success: true,
      message: `User ${status} successfully`
    });
  } catch (error) {
    console.error('Error in updateUserStatus:', error);
    next(error);
  }
};




/**
 * Signs out the user (client-side token invalidation only)
 * @param {Object} req - Request object (not used)
 * @param {Object} res - Response object to confirm sign-out
 */
authentication.signout = (req, res) => {
    // Note: JWT is stateless; client should remove token locally
    // Future enhancement: Implement server-side token blacklisting if needed
    return res.status(200).json({ success: true, message: "User signed out successfully" });
};

/**
 * Soft delete a user profile
 *
 * Who can delete:
 * - Candidate / Employer → their own profile
 * - HR-Admin / Superadmin → any candidate or employer
 *
 * @route DELETE /api/v1/auth/users/:id
 * @access Private
 */
authentication.deleteUserProfile = async (req, res, next) => {
  try {
    const loggedInUser = req.user;
    const targetUserId = req.params.id;

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Permission checks
    const isSelfDelete =
      loggedInUser.id.toString() === targetUserId.toString();

    const isAdmin =
      ['hr-admin', 'superadmin'].includes(loggedInUser.role);

    // Candidates & employers can delete ONLY themselves
    if (!isSelfDelete && !isAdmin) {
      return res.status(403).json({
        message: 'You are not allowed to delete this profile'
      });
    }

    // HR-Admin should delete only candidate/employer
    if (
      loggedInUser.role === 'hr-admin' &&
      !['candidate', 'employer'].includes(targetUser.role)
    ) {
      return res.status(403).json({
        message: 'HR-Admin cannot delete admin accounts'
      });
    }

    const deletedUserSnapshot = {
      email: targetUser.email,
      name: targetUser.name,
      role: targetUser.role
    };

    // Hard delete user so the same email can re-register
    await User.deleteOne({ _id: targetUserId });

    // Send deletion confirmation email to user
    await sendProfileDeletionEmail({
      recipient: deletedUserSnapshot.email,
      name: deletedUserSnapshot.name,
      role: deletedUserSnapshot.role,
      deletedBy: loggedInUser.email
    });
    // Send alert to superadmin
    await sendSuperadminAlertEmail({
      superadminEmail: SUPERADMIN_EMAIL,
      userEmail: deletedUserSnapshot.email,
      userRole: deletedUserSnapshot.role,
      message: `User profile deleted by ${loggedInUser.email}`
    });

    return res.status(200).json({
      success: true,
      message: 'User profile deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

//* Google OAuth2 Login Handler */
authentication.googleLogin = async (req, res, next) => {
    try {
        // 'role' is passed from the frontend Tabs (candidate or employer)
        const { token: googleToken, role } = req.body; 

        // 1. Verify Google Token
        const ticket = await client.verifyIdToken({
            idToken: googleToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { email, name } = payload;

        // 2. Find existing user by email
        let user = await User.findOne({ email });

        if (!user) {
            // 3. AUTO-REGISTER if user doesn't exist
            // Generate a secure random password (required by your schema)
            const salt = await bcrypt.genSalt(10);
            const randomPass = crypto.randomBytes(16).toString('hex');
            const hashedPassword = await bcrypt.hash(randomPass, salt);

            user = new User({
                name: name,
                email: email,
                password: hashedPassword,
                role: role || 'candidate', // Uses the role from the frontend tab
                status: 'pending',        // Auto-approve verified Google users changed to pending
                isActive: true,
                isDeleted: false
            });

            await user.save();

            // Send welcome email to new user
            await sendWelcomeEmail({ recipient: email, name });
            // Send alert to superadmin
            await sendSuperadminAlertEmail({
              superadminEmail: SUPERADMIN_EMAIL,
              newUserEmail: email,
              newUserRole: role || 'candidate'
            });
        }

        // 4. Generate Application JWT (Matches your schema/middleware logic)
        const token = jwt.sign(
            { userId: user._id }, 
            process.env.JWT_SECRET, 
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        // 5. Return success response to frontend
        res.status(200).json({
            success: true,
            user: {
                token,
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status
            }
        });

    } catch (error) {
        console.error("Google Auth Error:", error);
        res.status(401).json({
            success: false,
            message: "Google authentication failed. Please try again."
        });
    }
};

export default authentication;
