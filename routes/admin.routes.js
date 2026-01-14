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

// // Manage Top Companies
// adminRouter.get(
//     '/superadmin/company-profile/all', 
//     authenticate, 
//     authorize(['superadmin', 'admin']), 
//     adminController.getAllCompanyProfiles
// );

// adminRouter.put(
//     '/superadmin/company-profile/update/:id', 
//     authenticate, 
//     authorize(['superadmin', 'admin']), 
//     adminController.updateCompanyTopStatus
// );



// Public route - Put this BEFORE any auth middleware if you want the public to see the homepage
adminRouter.get('/homepage/settings', adminController.getHomepageSettings);

// CMS Update route - Restricted to superadmin
adminRouter.post(
    '/homepage/update', 
    authenticate, 
    authorize(['superadmin']), 
    adminController.updateHomepageCMS
);

export default adminRouter;