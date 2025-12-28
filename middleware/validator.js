/***
 * custom validator middleware for Express.js
 * This middleware validates incoming request data using the indicative library.
 * version: 1.0.0
 */


import { validate } from 'indicative/validator';
import { sanitizer } from 'indicative/sanitizer';
import { errorHandler } from '../utils/errorHandler.js';

export const validateRequest = (rules) => {
  return async (req, res, next) => {
    try {
      // Sanitize the request body
      const sanitizedData = await sanitizer.sanitize(req.body, rules);
      
      // Validate the sanitized data
      await validate(sanitizedData, rules);
      
      // If validation passes, attach sanitized data to request object
      req.body = sanitizedData;
      next();
    } catch (error) {
      // Handle validation errors
      errorHandler(res, error);
    }
  };
}


