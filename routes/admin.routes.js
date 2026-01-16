// admin.routes.js
import { Router } from 'express';
import adminController from '../controller/admin.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const adminRouter = Router();

// userRouter.get('/profile', authenticate, authorize(['candidate', 'admin', 'superadmin']), userController.getProfile);

// Employer or superadmin access
adminRouter.get('/dashboard', authenticate, authorize(['employer','admin','superadmin']), adminController.getAdminDashboard);
adminRouter.get('/candidates', authenticate, authorize(['employer','admin','superadmin']), adminController.getAllCandidates);

// Superadmin-only routes
adminRouter.get('/superadmin/dashboard', authenticate, authorize(['superadmin']), adminController.getSuperadminDashboard);
adminRouter.get('/superadmin/users', authenticate, authorize(['superadmin']), adminController.getAllUsers);
adminRouter.patch('/superadmin/users/:id/toggle-activation', authenticate, authorize(['superadmin']), adminController.toggleUserActivation);

// Featured Jobs (Curated Content)
adminRouter.put('/featured-jobs', authenticate, authorize(['hr-admin', 'superadmin']), adminController.updateFeaturedJobs);
adminRouter.get('/featured-jobs/fetch-all', adminController.getFeaturedJobs); // Publicly accessible for Home Page

// Featured Companies (Curated Content)
adminRouter.put('/featured-company', authenticate, authorize(['hr-admin', 'superadmin']), adminController.updateFeaturedCompanies);
adminRouter.get('/featured-company/fetch-all', adminController.getFeaturedCompanies); // Publicly accessible for Home Page


export default adminRouter;