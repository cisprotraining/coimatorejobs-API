import express from 'express';
import masterController from '../controller/master.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const masterRouter = express.Router();

// Industries
masterRouter.get('/industries', masterController.getIndustries);

// Functional Areas
masterRouter.get('/functional-areas', masterController.getFunctionalAreas);

// Roles
masterRouter.get('/roles', masterController.getRoles);
masterRouter.get('/roles/used', authenticate, authorize(['employer', 'hr-admin', 'superadmin']), masterController.getUsedRoles);
masterRouter.post('/roles/custom', authenticate, authorize(['hr-admin', 'superadmin']), masterController.createCustomRole);
masterRouter.delete('/roles/:id', authenticate, authorize(['hr-admin', 'superadmin']), masterController.deleteCustomRole);
masterRouter.patch('/roles/:id/collar', authenticate, authorize(['hr-admin', 'superadmin']), masterController.updateRoleCollarCategory);
masterRouter.post('/roles/collar-config', authenticate, authorize(['hr-admin']), masterController.saveRoleCollarConfig);

// Skills
masterRouter.get('/skills', masterController.getSkills);

// Popular Roles (SEO)
masterRouter.get('/roles/popular', masterController.getPopularRoles);

// Skill Categories (SEO)
masterRouter.get('/skill-categories', masterController.getSkillCategories);

// Locations
masterRouter.get('/locations', masterController.getLocations);

export default masterRouter;
