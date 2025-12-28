// auth.controller.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { JWT_SECRET, JWT_EXPIRES_IN, SUPERADMIN_EMAIL, THROTTLING_RETRY_DELAY_BASE } from "../config/env.js";
import crypto from 'crypto';
import { sendPasswordResetEmail, sendWelcomeEmail, sendSuperadminAlertEmail } from '../utils/mailer.js';

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
        // Only allow candidate or employer roles on signup
        const safeRole = ['candidate', 'employer'].includes(role) ? role : 'candidate';

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

        // Create new user with optional role (defaults to 'candidate' in schema)
        const newUser = new User({ name, email, password: hashedPassword, role: safeRole });
        await newUser.save({ session });

        // Generate JWT token
        const token = jwt.sign({ userId: newUser._id, role: newUser.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // Commit transaction and end session
        await session.commitTransaction();
        session.endSession();

        // Send welcome email to new user
        await sendWelcomeEmail({ recipient: email, name });

        // Send alert to superadmin
        await sendSuperadminAlertEmail({ 
          superadminEmail: SUPERADMIN_EMAIL, 
          newUserEmail: email, 
          newUserRole: safeRole 
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
                role: newUser.role
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
                role: user.role
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

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save token and expiry in user doc
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 mins
    await user.save();

    // Send reset email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
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
 * Signs out the user (client-side token invalidation only)
 * @param {Object} req - Request object (not used)
 * @param {Object} res - Response object to confirm sign-out
 */
authentication.signout = (req, res) => {
    // Note: JWT is stateless; client should remove token locally
    // Future enhancement: Implement server-side token blacklisting if needed
    return res.status(200).json({ success: true, message: "User signed out successfully" });
};

export default authentication;