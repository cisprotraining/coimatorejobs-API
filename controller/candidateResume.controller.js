import puppeteer from 'puppeteer';
import natural from 'natural';
import CandidateResume from '../models/candidateResume.model.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import fs from 'fs';
import path from 'path';
// import { candidateUpload } from '../utils/candidateFileUpload.js'; // For portfolio uploads

const candidateResumeController = {};

/**
 * Creates a new resume for the authenticated candidate.
 * @param {Object} req - Request object with form data
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
candidateResumeController.createResume = async (req, res, next) => {
    try {
        const candidateId = req.user.id;
        const {
            title, description, template, personalInfo, education, experience, awards, skills, preferences, isPrimary, isActive, profile
        } = req.body;

        // Validate required fields
        if (!title || !description || !profile) {
            throw new BadRequestError('Title, description and profile are required');
        }

        // Limit resumes per candidate (e.g., max 5)
        const resumeCount = await CandidateResume.countDocuments({ candidate: candidateId });
        if (resumeCount >= (req.user.subscription?.resumeLimit || 2)) {
            throw new BadRequestError(`Maximum ${req.user.subscription?.resumeLimit || 2} resumes allowed per candidate`);
        }

        // Handle portfolio uploads
        const files = req.files || {};
        const portfolio = [];
        if (files.portfolio) {
            for (const file of files.portfolio) {
                portfolio.push({
                    file: `/uploads/candidate/${file.filename}`,
                    title: req.body[`portfolioTitle_${file.fieldname}`] || 'Untitled',
                    description: req.body[`portfolioDesc_${file.fieldname}`] || '',
                });
            }
        }

        // Parse arrays and objects if stringified
        const parsedPersonalInfo = typeof personalInfo === 'string' ? JSON.parse(personalInfo) : personalInfo;
        const parsedEducation = typeof education === 'string' ? JSON.parse(education) : education;
        const parsedExperience = typeof experience === 'string' ? JSON.parse(experience) : experience;
        const parsedAwards = typeof awards === 'string' ? JSON.parse(awards) : awards;
        const parsedSkills = typeof skills === 'string' ? JSON.parse(skills) : skills;
        const parsedPreferences = typeof preferences === 'string' ? JSON.parse(preferences) : preferences;


        const parsedIsPrimary = (isPrimary === 'true' || isPrimary === '1' || isPrimary === true);
        const parsedIsActive = (isActive === 'true' || isActive === '1' || isActive === true);


        // If primary, unset other resumes
        if (parsedIsPrimary) {
            await CandidateResume.updateMany(
                { candidate: candidateId },
                { $set: { isPrimary: false } }
            );
        }

        const newResume = new CandidateResume({
            candidate: candidateId,
            profile: profile,
            title,
            description,
            template: template || 'professional',
            personalInfo: parsedPersonalInfo,
            education: parsedEducation,
            experience: parsedExperience,
            awards: parsedAwards,
            skills: parsedSkills,
            portfolio,
            preferences: parsedPreferences,
            isPrimary: parsedIsPrimary || false,
        });

        await newResume.save();

        // Calculate ATS score (simple implementation)
        newResume.atsScore = calculateAtsScore(newResume);
        await newResume.save();

        return res.status(201).json({
            success: true,
            message: 'Resume created successfully',
            resume: newResume,
        });
    } catch (error) {
        // Cleanup portfolio files if error
        if (req.files?.portfolio) {
            for (const file of req.files.portfolio) {
                const filePath = path.join(process.cwd(), 'public', `/uploads/candidate/${file.filename}`);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
        }
        next(error);
    }
};

/**
 * Updates a resume for the authenticated candidate.
 * @param {Object} req - Request object with form data
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
candidateResumeController.updateResume = async (req, res, next) => {
    try {
        const candidateId = req.user.id;
        const resumeId = req.params.id;
        const {
            title, description, template, personalInfo, education, experience, awards, skills, preferences, isPrimary, isActive, profile
        } = req.body;

        const resume = await CandidateResume.findById(resumeId);
        if (!resume || resume.candidate.toString() !== candidateId.toString()) {
            throw new NotFoundError('Resume not found or not yours');
        }

        // Handle portfolio uploads
        const files = req.files || {};
        if (files.portfolio) {
            // Delete old portfolio files
            resume.portfolio.forEach(item => {
                const oldFilePath = path.join(process.cwd(), 'public', item.file);
                if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
            });
            // Add new portfolio
            const newPortfolio = [];
            for (const file of files.portfolio) {
                newPortfolio.push({
                    file: `/uploads/candidate/${file.filename}`,
                    title: req.body[`portfolioTitle_${file.fieldname}`] || 'Untitled',
                    description: req.body[`portfolioDesc_${file.fieldname}`] || '',
                });
            }
            resume.portfolio = newPortfolio;
        }

        // Parse arrays and objects if stringified
        const parsedPersonalInfo = typeof personalInfo === 'string' ? JSON.parse(personalInfo) : personalInfo;
        const parsedEducation = typeof education === 'string' ? JSON.parse(education) : education;
        const parsedExperience = typeof experience === 'string' ? JSON.parse(experience) : experience;
        const parsedAwards = typeof awards === 'string' ? JSON.parse(awards) : awards;
        const parsedSkills = typeof skills === 'string' ? JSON.parse(skills) : skills;
        const parsedPreferences = typeof preferences === 'string' ? JSON.parse(preferences) : preferences;
        // Correctly parse boolean values
        const parsedIsPrimary = (isPrimary === 'true' || isPrimary === '1' || isPrimary === true);
        const parsedIsActive = (isActive === 'true' || isActive === '1' || isActive === true);



        // Update fields
        resume.profile = profile || resume.profile;
        resume.title = title || resume.title;
        resume.description = description || resume.description;
        resume.template = template || resume.template;
        resume.personalInfo = parsedPersonalInfo || resume.personalInfo;
        resume.education = parsedEducation || resume.education;
        resume.experience = parsedExperience || resume.experience;
        resume.awards = parsedAwards || resume.awards;
        resume.skills = parsedSkills || resume.skills;
        resume.preferences = parsedPreferences || resume.preferences;

        // Update booleans properly
        if (isPrimary !== undefined) {
            resume.isPrimary = parsedIsPrimary;
            if (parsedIsPrimary) {
                // Unset other resumes for this candidate
                await CandidateResume.updateMany(
                    { candidate: candidateId, _id: { $ne: resume._id } },
                    { $set: { isPrimary: false } }
                );
            }
        }
        if (isActive !== undefined) {
            resume.isActive = parsedIsActive;
        }

        await resume.save();

        // Recalculate ATS score
        resume.atsScore = calculateAtsScore(resume);
        await resume.save();

        return res.status(200).json({
            success: true,
            message: 'Resume updated successfully',
            resume,
        });
    } catch (error) {
        // Cleanup portfolio files if error
        if (req.files?.portfolio) {
            for (const file of req.files.portfolio) {
                const filePath = path.join(process.cwd(), 'public', `/uploads/candidate/${file.filename}`);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
        }
        next(error);
    }
};

/**
 * Lists resumes for the authenticated candidate.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
candidateResumeController.listResumes = async (req, res, next) => {
    try {
        const candidateId = req.user.id;

        // ✅ Debugging: check what resumes exist in DB for this candidate
        const allResumes = await CandidateResume.find({ candidate: candidateId });
        console.log("All resumes for candidate:", allResumes);



        const resumes = await CandidateResume.find({ candidate: candidateId, isActive: true })
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            resumes,
            debugCount: {
                total: allResumes.length,
                active: resumes.length
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Retrieves a single resume for the authenticated candidate.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
candidateResumeController.getResume = async (req, res, next) => {
    try {
        const candidateId = req.user.id;
        const resumeId = req.params.id;

        const resume = await CandidateResume.findById(resumeId);
        if (!resume || resume.candidate.toString() !== candidateId.toString()) {
            throw new NotFoundError('Resume not found or not yours');
        }

        return res.status(200).json({
            success: true,
            resume,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Deletes a resume for the authenticated candidate.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
candidateResumeController.deleteResume = async (req, res, next) => {
    try {
        const candidateId = req.user.id;
        const resumeId = req.params.id;

        const resume = await CandidateResume.findById(resumeId);
        if (!resume || resume.candidate.toString() !== candidateId.toString()) {
            throw new NotFoundError('Resume not found or not yours');
        }

        // Delete portfolio files
        resume.portfolio.forEach(item => {
            const filePath = path.join(process.cwd(), 'public', item.file);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });

        await resume.deleteOne();

        return res.status(200).json({
            success: true,
            message: 'Resume deleted successfully',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Generates PDF CV from resume data.
 * @param {Object} req - Request object with resume ID
 * @param {Object} res - Response object (sends PDF file)
 * @param {Function} next - Next middleware function
 */
candidateResumeController.generatePDF = async (req, res, next) => {
    try {
        const candidateId = req.user.id;
        const resumeId = req.params.id;

        const resume = await CandidateResume.findById(resumeId);
        if (!resume || resume.candidate.toString() !== candidateId.toString()) {
            throw new NotFoundError('Resume not found or not yours');
        }

        // Launch Puppeteer
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        // Generate HTML template
        const htmlContent = generateHTMLTemplate(resume);

        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });

        await browser.close();

        // Set headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${resume.title}.pdf"`);

        return res.send(pdfBuffer);
    } catch (error) {
        next(error);
    }
};

/**
 * Simple ATS score calculation (can be enhanced with AI later).
 * @param {Object} resume - The resume data
 * @returns {Number} ATS score (0-100)
 */
function calculateAtsScore(resume, jobDescription = '') {
  let score = 0;
  if (resume.personalInfo?.summary) score += 20;
  if (resume.education.length > 0) score += 20;
  if (resume.experience.length > 0) score += 20;
  if (resume.skills.length > 0) score += 20;
  if (resume.portfolio.length > 0) score += 20;
  // Keyword matching
  const tokenizer = new natural.WordTokenizer();
  const resumeText = `${resume.personalInfo?.summary || ''} ${resume.skills.join(' ')}`;
  const resumeTokens = tokenizer.tokenize(resumeText.toLowerCase());
  const jobTokens = tokenizer.tokenize(jobDescription.toLowerCase());
  const matches = resumeTokens.filter(token => jobTokens.includes(token)).length;
  score += Math.min(matches * 2, 20); // Add up to 20 points for keyword matches
  return Math.min(score, 100);
}

/**
 * Helper function to generate HTML template for PDF.
 * @param {Object} resume - The resume data
 * @returns {string} HTML string
 */
function generateHTMLTemplate(resume) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${resume.title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { text-align: center; }
        h2 { color: #333; border-bottom: 2px solid #333; }
        ul { list-style-type: disc; padding-left: 20px; }
        .section { margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <h1>${resume.personalInfo?.fullName || 'Candidate Resume'}</h1>
      <p><strong>Professional Title:</strong> ${resume.personalInfo?.professionalTitle || ''}</p>
      <p><strong>Email:</strong> ${resume.personalInfo?.email || ''} | <strong>Phone:</strong> ${resume.personalInfo?.phone || ''}</p>
      <p><strong>LinkedIn:</strong> ${resume.personalInfo?.linkedInUrl || ''} | <strong>GitHub:</strong> ${resume.personalInfo?.githubUrl || ''}</p>
      
      <div class="section">
        <h2>Summary</h2>
        <p>${resume.personalInfo?.summary || 'No summary available.'}</p>
      </div>

      <div class="section">
        <h2>Experience</h2>
        <ul>
          ${resume.experience.map(exp => `<li><strong>${exp.position}</strong> at ${exp.company} (${exp.years || ''})<br>${exp.description || ''}</li>`).join('')}
        </ul>
      </div>

      <div class="section">
        <h2>Education</h2>
        <ul>
          ${resume.education.map(edu => `<li><strong>${edu.degree}</strong> from ${edu.institution} (${edu.years || ''})<br>${edu.description || ''}</li>`).join('')}
        </ul>
      </div>

      <div class="section">
        <h2>Skills</h2>
        <ul>
          ${resume.skills.map(skill => `<li>${skill}</li>`).join('')}
        </ul>
      </div>

      <div class="section">
        <h2>Awards</h2>
        <ul>
          ${resume.awards.map(award => `<li><strong>${award.title}</strong> (${award.years || ''})<br>${award.description || ''}</li>`).join('')}
        </ul>
      </div>

      <div class="section">
        <h2>Portfolio</h2>
        <ul>
          ${resume.portfolio.map(item => `<li><strong>${item.title}</strong>: <a href="${item.file}">${item.file}</a><br>${item.description || ''}</li>`).join('')}
        </ul>
      </div>
    </body>
    </html>
  `;
}

export default candidateResumeController;