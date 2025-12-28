import { Router } from 'express';
import employerController from '../controller/employer.controller.js';
import employerApplicantsController from '../controller/employerApplicants.controller.js';
import resumeAlertController from '../controller/resumeAlert.controller.js';
import jobsController from '../controller/jobs.controller.js';
import employerDashboardController from '../controller/employerDashboard.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import companyUpload from '../utils/fileUpload.js';  
import normalizeBody from '../utils/normalizeBody.js';
import trackView from '../middleware/trackView.js';
import trackJobView from '../middleware/trackJobView.js';

const employerRouter = Router();


// Route to get all company profiles (accessible to admins and superadmins)
employerRouter.get('/company-profile/fetch-all',  employerController.getAllCompanyProfiles);
// Route to create a company profile
// Only authenticated employers can access this route
// Create company profile (with file upload)
employerRouter.post('/company-profile/create',authenticate,authorize(['employer', 'admin', 'superadmin']),companyUpload,employerController.createCompanyProfile);
// Update company profile (with file upload)
employerRouter.put( '/company-profile/update/:id',authenticate,authorize(['employer', 'admin', 'superadmin']), companyUpload,employerController.updateCompanyProfile);
// Get company profile
employerRouter.get('/company-profile/get/:id', authenticate, authorize(['employer', 'admin', 'superadmin', 'candidate']), trackView, employerController.getCompanyProfile);

// Get company profiles for logged-in employer
employerRouter.get('/company-profile/my-profiles', authenticate, authorize(['employer']), employerController.getCompanyProfilesForEmployer);

// Delete company profile
employerRouter.delete('/company-profile/delete/:id',authenticate,authorize(['employer', 'admin', 'superadmin']),employerController.deleteCompanyProfile);


// post job

// Route to create a job post (accessible to employers, admins, and superadmins)
employerRouter.post('/jobs/create', authenticate, authorize(['employer', 'admin', 'superadmin']), companyUpload, normalizeBody, jobsController.createJobPost);  //we have added companyUpload to handle file uploads for job posts and normalizeBody to handle FormData parsing

// Get all job posts (filtered by employer for non-superadmins)
employerRouter.get('/jobs/fetch-all', authenticate, authorize(['employer', 'admin', 'superadmin', 'candidate']),jobsController.getJobPosts);

// Get a single job post for editing
employerRouter.get('/jobs/fetch/:id',authenticate, authorize(['employer', 'admin', 'superadmin', 'candidate']), trackJobView, jobsController.getJobPost);

// Update a job post
employerRouter.put('/jobs/update/:id',authenticate, authorize(['employer', 'admin', 'superadmin']), companyUpload, normalizeBody, jobsController.updateJobPost);

// Delete a job post
employerRouter.delete('/jobs/delete/:id',authenticate, authorize(['employer', 'admin', 'superadmin']),jobsController.deleteJobPost);

// Get active jobs posted by a specific employer (public)
employerRouter.get('/company/:id/jobs', employerController.getActiveJobsByEmployer);


// Get applicants for a specific job post

// Get all applicants for a specific job with filters
employerRouter.get('/applicants/:jobId', authenticate, authorize(['employer', 'admin', 'superadmin']), employerApplicantsController.getApplicantsByJob);

// Get all applicants across all jobs by employer
employerRouter.get('/applicants', authenticate, authorize(['employer', 'admin', 'superadmin']), employerApplicantsController.getAllApplicants);

// Update applicant status (approve/reject)
employerRouter.put('/applicants/:applicationId/status', authenticate, authorize(['employer', 'admin', 'superadmin']), employerApplicantsController.updateApplicantStatus);

// Delete an application
employerRouter.delete('/applicants/delete/:applicationId', authenticate, authorize(['employer', 'admin', 'superadmin']), employerApplicantsController.deleteApplicant);

// View applicant details
employerRouter.get('/applicants/get/:applicationId', authenticate, authorize(['employer', 'admin', 'superadmin']), employerApplicantsController.viewApplicant);

// Bulk update applicant statuses
employerRouter.put('/applicants/bulk-status', authenticate, authorize(['employer', 'admin', 'superadmin']), employerApplicantsController.bulkUpdateStatus);

// Shortlist an applicant
employerRouter.put('/applicants/:applicationId/shortlist', authenticate, authorize(['employer', 'admin', 'superadmin']), employerApplicantsController.shortlistApplicant);

// Unshortlist an applicant
employerRouter.put('/applicants/:applicationId/unshortlist', authenticate, authorize(['employer', 'admin', 'superadmin']), employerApplicantsController.unshortlistApplicant);

// Get shortlisted resumes
employerRouter.get('/shortlisted-resumes', authenticate, authorize(['employer', 'admin', 'superadmin']), employerApplicantsController.getShortlistedResumes);

// candidate save for future use
// Save candidate profile
employerRouter.post('/saved-candidates/save/:candidateId', authenticate, authorize(['employer']), employerController.saveCandidate);

// Unsave candidate
employerRouter.delete('/saved-candidates/:savedId', authenticate, authorize(['employer']), employerController.unsaveCandidate);

// Get saved candidates (with filters)
employerRouter.get('/saved-candidates', authenticate, authorize(['employer']), employerController.getSavedCandidates);

// resume alert routes
// Create resume alert
employerRouter.post('/resume-alerts/create', authenticate, authorize(['employer']), resumeAlertController.createResumeAlert);

// Update resume alert
employerRouter.put('/resume-alerts/update/:id', authenticate, authorize(['employer']), resumeAlertController.updateResumeAlert);

// Delete resume alert
employerRouter.delete('/resume-alerts/delete/:id', authenticate, authorize(['employer']), resumeAlertController.deleteResumeAlert);

// List resume alerts
employerRouter.get('/resume-alerts/get-all', authenticate, authorize(['employer']), resumeAlertController.listResumeAlerts);

// Get matches for specific alert
employerRouter.get('/resume-alerts/:id/matches', authenticate, authorize(['employer', 'admin', 'superadmin']), resumeAlertController.getAlertMatches);


// Employer dashboard routes
// Dashboard stats and analytics routes
employerRouter.get('/stats', authenticate, authorize(['employer', 'admin', 'superadmin']), employerDashboardController.getDashboardStats);

// get profile views data
employerRouter.get('/profile-views', authenticate, authorize(['employer', 'admin', 'superadmin']), employerDashboardController.getProfileViewsData);

// get recent activities
employerRouter.get('/recent-activities', authenticate, authorize(['employer', 'admin', 'superadmin']), employerDashboardController.getRecentActivity);

// employerRouter.get('/message-stats', authenticate, authorize(['employer', 'admin', 'superadmin']), 
//   employerDashboardController.getMessageStats);

// get application trends
employerRouter.get('/application-trends', authenticate, authorize(['employer', 'admin', 'superadmin']), employerDashboardController.getApplicationTrends);

// get top applicants
employerRouter.get('/job-status-distribution', authenticate, authorize(['employer', 'admin', 'superadmin']), employerDashboardController.getJobStatusDistribution);



export default employerRouter;