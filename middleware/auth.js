// middleware/auth.js
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import User from '../models/user.model.js';
import { isEmployerLike, isPlatformAdmin } from '../utils/roleHelper.js';

// Authenticate user
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized - No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // const user = await User.findById(decoded.userId);
    
    // Fetch full user context
    const user = await User.findById(decoded.userId).select(
      '_id role employerIds candidateIds isActive'
    );

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Unauthorized - User is not active or not found' });
    }

    req.user = { id: user._id, role: user.role, employerIds: user.employerIds || [], candidateIds: user.candidateIds || [] };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// General role authorization
export const authorize = (allowedRoles = []) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden - Insufficient permissions' });
  }
  next();
};

// Shortcut: Any employer-like role (employer, hr-admin, superadmin)
export const authorizeEmployerLike = () => (req, res, next) => {
    // console.log("tttttttttttttttttt", req.user);
    
  if (!req.user || !isEmployerLike(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden - Employer or HR access required' });
  }
  next();
};

// Superadmin only
export const authorizePlatformAdmin = () => (req, res, next) => {
  if (!req.user || !isPlatformAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden - Superadmin access required' });
  }
  next();
};