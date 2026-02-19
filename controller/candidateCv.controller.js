// controller/candidateCv.controller.js
import CandidateCv from '../models/candidateCv.model.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import path from 'path';
import fs from 'fs';

const candidateCvController = {};

/**
 * Uploads a raw CV file (PDF/DOC/DOCX) for the authenticated candidate.
 * @route POST /api/v1/candidate-dashboard/cvs/upload
 * @access Private (Candidate only)
 * @param {Object} req - Request object (expects single file field 'cv')
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
candidateCvController.uploadCv = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new BadRequestError('No file uploaded');
    }

    const candidateId = req.user.id;

    const newCv = new CandidateCv({
      candidate: candidateId,
      // file: `/uploads/candidate/${req.file.filename}`, //old
      file: req.file.location, // S3 URL
      originalName: req.file.originalname,
    });

    await newCv.save();

    return res.status(201).json({
      success: true,
      message: 'CV uploaded successfully',
      cv: newCv,
    });
  } catch (error) {
    // Cleanup uploaded file on error
    if (req.file) {
      const filePath = path.join(process.cwd(), 'public', `/uploads/candidate/${req.file.filename}`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    next(error);
  }
};

/**
 * Lists all uploaded CVs for the authenticated candidate.
 * @route GET /api/v1/candidate-dashboard/cvs/list
 * @access Private (Candidate only)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
candidateCvController.listCvs = async (req, res, next) => {
  try {
    const candidateId = req.user.id;

    const cvs = await CandidateCv.find({ candidate: candidateId })
      .select('-__v')
      .sort({ uploadedAt: -1 });

    return res.status(200).json({
      success: true,
      cvs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deletes an uploaded CV for the authenticated candidate.
 * @route DELETE /api/v1/candidate-dashboard/cvs/delete/:id
 * @access Private (Candidate only)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
candidateCvController.deleteCv = async (req, res, next) => {
  try {
    const candidateId = req.user.id;
    const cvId = req.params.id;

    const cv = await CandidateCv.findById(cvId);
    if (!cv || cv.candidate.toString() !== candidateId.toString()) {
      throw new NotFoundError('CV not found or not yours');
    }

    // File deletion handled by post('deleteOne') hook in model
    await cv.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'CV deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export default candidateCvController;