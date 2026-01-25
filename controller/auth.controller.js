// auth.controller.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { JWT_SECRET, JWT_EXPIRES_IN, SUPERADMIN_EMAIL, THROTTLING_RETRY_DELAY_BASE } from "../config/env.js";
import crypto from 'crypto';
import { sendPasswordResetEmail, sendWelcomeEmail, sendSuperadminAlertEmail, sendUserStatusUpdateEmail, sendPasswordResetSuccessEmail, sendAdminPasswordResetEmail, sendProfileDeletionEmail } from '../utils/mailer.js';
import { BadRequestError, ForbiddenError,NotFoundError} from '../utils/errors.js';

import { log } from "console";

import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Authentication controller object
const authentication = {};

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
        // Only allow candidate, employer, hr-admin roles on signup
        const safeRole = ['candidate', 'employer', 'hr-admin'].includes(role) ? role : 'candidate';

        // Validate required fields
        if (!name || !email || !password) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'All fields (name, email, password) are required' });
        }

        // Check for existing user
        const existingUser = await User.findOne({ email }).session(session);
        if (existingUser) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "User already exists" });
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

         // Approval logic
        const status = ['candidate', 'employer'].includes(safeRole)
          ? 'pending'
          : 'approved';

        // Create new user with optional role (defaults to 'candidate' in schema)
        const newUser = new User({ name, email, password: hashedPassword, role: safeRole, status });
        await newUser.save({ session });

        // Generate JWT token
        const token = jwt.sign({ userId: newUser._id, role: newUser.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // Commit transaction and end session
        await session.commitTransaction();
        session.endSession();

        // Send welcome email to new user
        await sendWelcomeEmail({ recipient: email, name });

        // Small delay for Mailtrap
        await new Promise(resolve => setTimeout(resolve, 6000)); //remove when in production

        await sendSuperadminAlertEmail({
          superadminEmail: SUPERADMIN_EMAIL,
          eventType: 'new_registration',
          userEmail: email,
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
  // console.log("hiiiiiiiiiiiiiiiiii", session);
  
  try {
    const { name, email, password, role } = req.body;
    const creator = req.user; // hr-admin or superadmin

    if (!['hr-admin', 'superadmin'].includes(creator.role)) {
      return res.status(403).json({ message: 'Not allowed, Only hr-admin or superadmin can create employer accounts' });
    }

    // validations
    if (!name || !email || !password || !['employer', 'candidate'].includes(role)) {
      return res.status(400).json({
        message: 'name, email, password and valid role (employer/candidate) are required'
      });
    }

    const existing = await User.findOne({ email }).session(session);
    if (existing) {
        return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

   // Auto approved because admin creates
    const [user] = await User.create([{
      name,
      email,
      password: hashedPassword,
      role,
      status: 'approved',
      createdBy: creator.id
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

    await session.commitTransaction();
    session.endSession();

    const createdByLabel = creator.email || (creator.role === 'superadmin' ? 'Super Admin' : 'HR Admin');

    // Welcome email to new user
    await sendWelcomeEmail({
      recipient: email,
      name,
      createdBy: createdByLabel,
      role
    });

    // Small delay for Mailtrap
    await new Promise(resolve => setTimeout(resolve, 6000)); //remove when in production

    // Superadmin alert
    await sendSuperadminAlertEmail({
      superadminEmail: SUPERADMIN_EMAIL,
      eventType: 'new_registration',
      newUserEmail: email,
      newUserRole: role,
      message: `${role} account created by ${createdByLabel}`
    });

    res.status(201).json({
      success: true,
      message: `${role} created & assigned successfully`,
      data: user
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
 
    const roleFilter = roles
      ? roles.split(',').map(r => r.trim())
      : ['employer', 'candidate'];
 
    let query = {
      role: { $in: roleFilter },
      isActive: true,
      $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }]
    };
 
    // console.log("test", query);
   
 
    // HR-ADMIN → ONLY ASSIGNED USERS
    if (loggedInUser.role === 'hr-admin') {
      query.createdBy = loggedInUser.id; 
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
        const { email, password } = req.body;

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "User Not Found" });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid Password" });
        }

        // Check approval status for candidate and employer roles(for now this we can handle in frontend)
        // if (user.status !== 'approved') {
        //   return res.status(403).json({
        //     message: `Account is ${user.status}. Please wait for approval.`
        //   });
        // }


        if (!user.isActive) {
            return res.status(403).json({ message: "User account is deactivated" });
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
                email: user.email,
                role: user.role,
                status: user.status
            }
        });
    } catch (error) {
        console.error("Error in authentication.signin:", error);
        next(error);
    }
};


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
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email }).select('+resetPasswordToken +resetPasswordExpire');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save token and expiry in user doc
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 mins
    await user.save();

    // Send reset email
    const resetUrl = `${process.env.FRONTEND_URL}reset-password/${resetToken}`;
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

    // Hash token for comparison
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user)
      return res.status(400).json({ message: 'Reset token is invalid or expired' });

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
    const { roles } = req.query;
    const loggedInUser = req.user;

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


    console.log("ehfvbekuyfvb", query);
    

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

    const users = await User.find(query, { password: 0 })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
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
        newUserEmail: user.email,
        newUserRole: user.role,
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

    // Soft delete 
    targetUser.isActive = false;
    targetUser.isDeleted = true;
    targetUser.deletedAt = new Date();
    targetUser.deletedBy = loggedInUser.id;

    await targetUser.save();

    // Send deletion confirmation email to user
    await sendProfileDeletionEmail({
      recipient: targetUser.email,
      name: targetUser.name,
      role: targetUser.role,
      deletedBy: loggedInUser.email
    });
    // Send alert to superadmin
    await sendSuperadminAlertEmail({
      superadminEmail: SUPERADMIN_EMAIL,
      newUserEmail: targetUser.email,
      newUserRole: targetUser.role,
      message: `User profile deleted by ${loggedInUser.email}`
    });

    return res.status(200).json({
      success: true,
      message: 'User profile deleted successfully (soft delete)'
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