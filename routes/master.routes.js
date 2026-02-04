import express from 'express';
import mongoose from 'mongoose'; 
import Industry from '../models/industry.model.js';
import FunctionalArea from '../models/functionalArea.model.js';
import Role from '../models/role.model.js';
import Skill from '../models/skill.model.js';
import Location from '../models/location.model.js';

const masterRouter = express.Router();

// Industries
masterRouter.get('/industries', async (req, res) => {
  const data = await Industry.find().select('name slug').sort({ name: 1 });;
  res.json({ success: true, data });
});

// Functional areas by industry
masterRouter.get('/functional-areas', async (req, res) => {
  const { industryId } = req.query;
  
  if (industryId && !mongoose.Types.ObjectId.isValid(industryId)) {
    return res.status(400).json({ success: false, message: 'Invalid industryId' });
  }

  const filter = industryId ? { industry: industryId } : {};
  const data = await FunctionalArea.find(filter).select('name slug industry').sort({ name: 1 });
  res.json({ success: true, data });
});

// Roles by functional area
masterRouter.get('/roles', async (req, res) => {
  const { functionalAreaId } = req.query;
  const filter = functionalAreaId ? { functionalArea: functionalAreaId } : {};
  const data = await Role.find(filter).select('name slug functionalArea');
  res.json({ success: true, data });
});

// Skills autocomplete
masterRouter.get('/skills', async (req, res) => {
  const q = req.query.q || '';
  const data = await Skill.find({
    name: { $regex: q, $options: 'i' }
  }).limit(20);
  res.json({ success: true, data });
});

// Location autocomplete
masterRouter.get('/locations', async (req, res) => {
  const q = req.query.q || '';
  const data = await Location.find({
    name: { $regex: q, $options: 'i' }
  }).limit(20);
  res.json({ success: true, data });
});

export default masterRouter;