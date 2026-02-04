// admin.routes.js
import { Router } from 'express';
import adminController from '../controller/admin.controller.js';
import contactController from '../controller/contact.controller.js';
import RoleSuggestion from '../models/roleSuggestion.model.js';
import Role from '../models/role.model.js';
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


// for contact us form
adminRouter.post('/contact-form/submit', contactController.submitContactForm);


// View suggestions
adminRouter.get(
  '/role-suggestions',
  authorize(['hr-admin', 'superadmin']),
  async (req, res) => {
    const data = await RoleSuggestion.find({ approved: false }).sort({ count: -1 });
    res.json({ success: true, data });
  }
);

// Approve suggestion
adminRouter.post(
  '/role-suggestions/:id/approve',
  authorize(['superadmin']),
  async (req, res) => {
    const { functionalAreaId } = req.body;

    const suggestion = await RoleSuggestion.findById(req.params.id);
    if (!suggestion) throw new Error('Suggestion not found');

    const role = await Role.create({
      name: suggestion.title,
      slug: suggestion.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      functionalArea: functionalAreaId,
      keywords: [`${suggestion.title.toLowerCase()} jobs`]
    });

    suggestion.approved = true;
    await suggestion.save();

    res.json({ success: true, role });
  }
);


export default adminRouter;