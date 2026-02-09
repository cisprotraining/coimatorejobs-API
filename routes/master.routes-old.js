import express from 'express';
import mongoose from 'mongoose';
import Industry from '../models/industry.model.js';
import FunctionalArea from '../models/functionalArea.model.js';
import Role from '../models/role.model.js';
import Skill from '../models/skill.model.js';
import Location from '../models/location.model.js';

const router = express.Router();

/**
 * INDUSTRIES
 */
router.get('/industries', async (_, res) => {
  const data = await Industry.find({ isActive: true })
    .select('name slug')
    .sort({ name: 1 });

  res.json({ success: true, data });
});

/**
 * FUNCTIONAL AREAS
 */
router.get('/functional-areas', async (req, res) => {
  const { industryId } = req.query;

  let filter = { isActive: true };

  if (industryId) {
    if (!mongoose.Types.ObjectId.isValid(industryId)) {
      return res.status(400).json({ success: false, message: 'Invalid industryId' });
    }

    const industry = await Industry.findById(industryId).select('slug');

    // OTHER → ONLY GLOBAL
    if (industry?.slug === 'other') {
      filter.isGlobal = true;
    } else {
      filter.$or = [
        { industry: industryId },
        { isGlobal: true }
      ];
    }
  }

  const data = await FunctionalArea.find(filter)
    .select('name slug isGlobal priority')
    .sort({ isGlobal: 1, priority: -1, name: 1 });

  res.json({ success: true, data });
});

/**
 * GET ROLES 
 */
router.get('/roles', async (req, res) => {
  try {
    const {
      functionalAreaId,
      industryId,
      search,
      includeGlobal = 'true',
    } = req.query;

    const andConditions = [{ isActive: true }]; // always filter active roles

    // ======================
    // Filter by Functional Area
    // ======================
    if (functionalAreaId) {
      if (!mongoose.Types.ObjectId.isValid(functionalAreaId)) {
        return res.status(400).json({ success: false, message: 'Invalid functionalAreaId' });
      }
      andConditions.push({ functionalArea: functionalAreaId });
    }

    // ======================
    // Filter by Industry
    // ======================
    if (industryId) {
      if (!mongoose.Types.ObjectId.isValid(industryId)) {
        return res.status(400).json({ success: false, message: 'Invalid industryId' });
      }

      // Get all functional areas for this industry + global ones
      const faIds = await FunctionalArea.find({
        isActive: true,
        $or: [{ industry: industryId }, { isGlobal: true }],
      }).distinct('_id');

      andConditions.push({ functionalArea: { $in: faIds } });
    }

    // ======================
    // Search filter
    // ======================
    if (search?.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      andConditions.push({
        $or: [
          { name: regex },
          { keywords: regex },
          { alternativeNames: regex }
        ]
      });
    }

    // ======================
    // Base filter
    // ======================
    const baseFilter = { $and: andConditions };

    // ======================
    // Include global roles
    // ======================
    // Only add global roles if includeGlobal !== 'false'
    let finalFilter = baseFilter;
    if (includeGlobal !== 'false') {
      finalFilter = {
        $or: [
          { isGlobal: true, isActive: true }, // global roles
          baseFilter,                        // roles matching your filters
        ]
      };
    }

    // ======================
    // Fetch roles safely
    // ======================
    const roles = await Role.find(finalFilter)
      .select('name slug priority isGlobal') // select only needed fields
      .sort({ priority: -1, name: 1 })
      .limit(100)
      .lean(); // ✅ convert to plain JS objects to avoid Mongoose circular refs

    return res.json({ success: true, data: roles });
  } catch (error) {
    console.error('❌ /roles endpoint error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


/**
 * SKILLS (SEARCHABLE + PAGINATION)
 */
router.get('/skills', async (req, res) => {
  try {
    const q = req.query.q?.trim() || '';
    const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
    const limit = parseInt(req.query.limit) > 0 ? parseInt(req.query.limit) : 20;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = { isActive: true };
    if (q) {
      const regex = new RegExp(q, 'i'); // case-insensitive search
      filter.$or = [
        { name: regex },
        { keywords: regex }
      ];
    }

    // Fetch total count for pagination
    const total = await Skill.countDocuments();

    // Fetch paginated data
    // const data = await Skill.find(filter)
    const data = await Skill.find()
      .select('name slug keywords')
      .skip(skip)
      .limit(limit)
      .sort({ name: 1 }) // sort alphabetically
      .lean();

    // Return paginated response
    return res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data
    });
  } catch (error) {
    console.error('❌ /skills endpoint error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


/**
 * Get popular roles (based on search volume and trending status)
 * @route GET /api/master/roles/popular
 * @returns {Object} Top 20 popular roles
 * 
 * Sample Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "_id": "507f1f77bcf86cd799439015",
 *       "name": "Manager",
 *       "slug": "manager",
 *       "searchVolume": 3000,
 *       "isTrending": true
 *     }
 *   ]
 * }
 */
router.get('/roles/popular', async (req, res) => {
  try {
    const data = await Role.find({ isActive: true })
      .select('name slug searchVolume isTrending')
      .sort({ searchVolume: -1, isTrending: -1 })
      .limit(20);   
    
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch popular roles',
      error: error.message
    });
  }
});

/**
 * Get all skill categories
 * @route GET /api/master/skill-categories
 * @returns {Object} List of unique skill categories
 * 
 * Sample Response:
 * {
 *   "success": true,
 *   "data": [
 *     "Programming",
 *     "Database",
 *     "Cloud",
 *     "Soft Skills",
 *     "Business"
 *   ]
 * }
 */
router.get('/skill-categories', async (req, res) => {
  try {
    const categories = await Skill.distinct('category', { 
      category: { $ne: null, $ne: '' },
      isActive: true 
    });
    
    res.json({ 
      success: true, 
      data: categories.sort() 
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch skill categories',
      error: error.message
    });
  }
});


/**
 * LOCATIONS
 */
router.get('/locations', async (req, res) => {
  const q = req.query.q || '';

  const data = await Location.find({
    name: { $regex: q, $options: 'i' }
  })
    .select('name slug')
    .limit(20);

  res.json({ success: true, data });
});

export default router;