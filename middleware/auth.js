// middleware/auth.js
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import User from '../models/user.model.js'; // Import User model to check activity

// Middleware to authenticate user via JWT
export const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized - No token provided' });
        }
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId); // Fetch user from DB
        if (!user || !user.isActive) { // Check if user exists and is active
            return res.status(401).json({ message: 'Unauthorized - User is not active' });
        }
        req.user = { id: user._id, role: user.role }; // Attach minimal user info to request
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
    }
};


// Authorize roles: e.g. ['admin', 'superadmin']
export const authorize = (roles = []) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden - Insufficient permissions' });
  }
  next();
};