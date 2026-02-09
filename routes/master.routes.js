import express from 'express';
import masterController from '../controller/master.controller.js';

const masterRouter = express.Router();

// Industries
masterRouter.get('/industries', masterController.getIndustries);

// Functional Areas
masterRouter.get('/functional-areas', masterController.getFunctionalAreas);

// Roles
masterRouter.get('/roles', masterController.getRoles);

// Skills
masterRouter.get('/skills', masterController.getSkills);

// Popular Roles (SEO)
masterRouter.get('/roles/popular', masterController.getPopularRoles);

// Skill Categories (SEO)
masterRouter.get('/skill-categories', masterController.getSkillCategories);

// Locations
masterRouter.get('/locations', masterController.getLocations);

export default masterRouter;