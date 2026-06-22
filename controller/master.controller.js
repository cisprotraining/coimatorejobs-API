import mongoose from 'mongoose';
import Industry from '../models/industry.model.js';
import FunctionalArea from '../models/functionalArea.model.js';
import Role from '../models/role.model.js';
import Skill from '../models/skill.model.js';
import Location from '../models/location.model.js';
import JobPost from '../models/jobs.model.js';
import User from '../models/user.model.js';
import { commonRoles, industrySpecificRoles } from '../seeds/categories.seed.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';

const toSafeString = (value) => String(value ?? '').trim();
const slugifyValue = (value) =>
  toSafeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const createUniqueSlug = async (Model, baseValue) => {
  const base = slugifyValue(baseValue) || `custom-${Date.now()}`;
  let candidate = base;
  let index = 1;
  while (await Model.exists({ slug: candidate })) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
};

const seededRoleNameSet = new Set(
  [...commonRoles, ...industrySpecificRoles]
    .map((role) => String(role?.name || '').trim().toLowerCase())
    .filter(Boolean)
);

const resolveIndustryId = async (industryValue) => {
  const normalized = toSafeString(industryValue);
  if (!normalized) throw new BadRequestError('Industry is required');

  if (mongoose.Types.ObjectId.isValid(normalized)) {
    const found = await Industry.findById(normalized).select('_id');
    if (found) return found._id;
  }

  const regex = new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const existing = await Industry.findOne({ name: regex }).select('_id');
  if (existing) return existing._id;

  const slug = await createUniqueSlug(Industry, normalized);
  const created = await Industry.create({ name: normalized, slug, isActive: true });
  return created._id;
};

const resolveFunctionalAreaId = async (functionalAreaValue, industryId) => {
  const normalized = toSafeString(functionalAreaValue);
  if (!normalized) throw new BadRequestError('Functional area is required');

  if (mongoose.Types.ObjectId.isValid(normalized)) {
    const found = await FunctionalArea.findById(normalized).select('_id');
    if (found) return found._id;
  }

  const regex = new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  let existing = await FunctionalArea.findOne({ name: regex, industry: industryId }).select('_id');
  if (!existing) {
    existing = await FunctionalArea.findOne({ name: regex, isGlobal: true }).select('_id');
  }
  if (!existing) {
    existing = await FunctionalArea.findOne({ name: regex }).select('_id');
  }
  if (existing) return existing._id;

  const slug = await createUniqueSlug(FunctionalArea, normalized);
  const created = await FunctionalArea.create({
    name: normalized,
    slug,
    industry: industryId,
    isGlobal: false,
    isActive: true,
  });
  return created._id;
};

const resolveRoleDocument = async (roleValue, functionalAreaId, actorId) => {
  const normalized = toSafeString(roleValue);
  if (!normalized) throw new BadRequestError('Role is required');

  if (mongoose.Types.ObjectId.isValid(normalized)) {
    const found = await Role.findById(normalized);
    if (found) return found;
  }

  const regex = new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const existing = await Role.findOne({ name: regex, functionalArea: functionalAreaId })
    .sort({ isActive: -1, createdAt: 1 });
  if (existing) {
    if (!existing.isActive) {
      existing.isActive = true;
      existing.isCustom = true;
      if (!existing.createdBy && actorId) {
        existing.createdBy = actorId;
      }
      await existing.save();
    }
    return existing;
  }

  const slug = await createUniqueSlug(Role, normalized);
  return Role.create({
    name: normalized,
    slug,
    functionalArea: functionalAreaId,
    isGlobal: false,
    isActive: true,
    isCustom: true,
    createdBy: actorId,
  });
};

const getDefaultCustomRoleFunctionalAreaId = async () => {
  const preferredNames = ['Operations', 'Administration', 'Human Resources'];

  for (const name of preferredNames) {
    const functionalArea = await FunctionalArea.findOne({
      name,
      isActive: true,
      isGlobal: true,
    }).select('_id');

    if (functionalArea?._id) {
      return functionalArea._id;
    }
  }

  const fallbackFunctionalArea = await FunctionalArea.findOne({
    isActive: true,
  }).sort({ isGlobal: -1, name: 1 }).select('_id');

  if (!fallbackFunctionalArea?._id) {
    throw new NotFoundError('No functional area found to create custom role');
  }

  return fallbackFunctionalArea._id;
};

const masterController = {
  /**
   * Get all industries (SEO: sorted, active only)
   */
  getIndustries: async (req, res) => {
    try {
      const data = await Industry.find({ isActive: true })
        .select('name slug')
        .sort({ name: 1 })
        .lean(); // Fast, no Mongoose overhead

      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch industries', error: error.message });
    }
  },

/**
 * Get functional areas (SEO: global + industry-specific)
*/
getFunctionalAreas: async (req, res) => {
  try {
    const { industryId } = req.query;

    // Base filter
    let filter = { isActive: true };

    /**
     * Industry filter
     */
    if (industryId) {
      if (!mongoose.Types.ObjectId.isValid(industryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid industryId',
        });
      }

      // Fetch active industry
      const industry = await Industry.findOne({
        _id: industryId,
        isActive: true,
      })
        .select('slug')
        .lean();

      if (!industry) {
        return res.status(404).json({
          success: false,
          message: 'Industry not found',
        });
      }

      // "Other" industry → all functional areas (SEO catch-all)
      if (industry.slug !== 'other') {
        filter.$or = [
          { industry: industryId },
          { isGlobal: true },
        ];
      }
      // else: keep base filter (all active)
    } else {
      // No industry → only global functional areas
      filter.isGlobal = true;
    }

    const data = await FunctionalArea.find(filter)
      .select('name slug isGlobal priority')
      .sort({
        isGlobal: 1,     // global first
        priority: -1,    // higher priority first
        name: 1,         // alphabetical
      })
      .lean();

    return res.json({ success: true, data });
  } catch (error) {
    console.error('❌ getFunctionalAreas error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch functional areas',
    });
  }
},

  /**
   * Get roles (SEO: search, trending, priority; global + filtered)
   */
  getRoles: async (req, res) => {
    try {
      const {
        functionalAreaId,
        industryId,
        search,
        includeGlobal = 'true',
        seedOnly = 'false',
        uniqueByName = 'false',
      } = req.query;

      const andConditions = [{ isActive: true }];

      // Functional Area filter
      if (functionalAreaId) {
        if (!mongoose.Types.ObjectId.isValid(functionalAreaId)) {
          return res.status(400).json({ success: false, message: 'Invalid functionalAreaId' });
        }

        andConditions.push({ functionalArea: functionalAreaId });
      }

      // Industry filter (get FAs for industry + global)
      if (industryId) {
        if (!mongoose.Types.ObjectId.isValid(industryId)) {
          return res.status(400).json({ success: false, message: 'Invalid industryId' });
        }
        const faIds = await FunctionalArea.find({
          isActive: true,
          $or: [{ industry: industryId }, { isGlobal: true }],
        }).distinct('_id');

        andConditions.push({ functionalArea: { $in: faIds } });
      }

      // Search filter (SEO: keywords, alt names)
      if (search?.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        andConditions.push({
          $or: [{ name: regex }, { keywords: regex }, { alternativeNames: regex }],
        });
      }

      const baseFilter = { $and: andConditions };

      let finalFilter = baseFilter;
      if (includeGlobal !== 'false') {
        if (functionalAreaId) {
          // For FA-specific dropdowns, include:
          // 1) roles from selected FA
          // 2) all global roles
          // Then dedupe by name so roles like Faculty won't repeat.
          finalFilter = {
            $or: [
              { functionalArea: functionalAreaId, isActive: true },
              { isGlobal: true, isActive: true },
            ],
          };
        } else {
          finalFilter = {
            $or: [{ isGlobal: true, isActive: true }, baseFilter],
          };
        }
      }

      // Keep role dropdown complete in dashboard forms.
      // Hard 100-limit was truncating A-Z list around "Faculty".
      const rawData = await Role.find(finalFilter)
        .select('name slug priority isGlobal isCustom createdBy defaultCollarCategory searchVolume isTrending keywords alternativeNames functionalArea')
        .populate({
          path: 'functionalArea',
          select: 'name industry',
          populate: {
            path: 'industry',
            select: 'name slug',
          },
        })
        .sort({ name: 1 }) // Keep dropdown roles in consistent A-Z order
        .lean();

      // Defensive dedupe:
      // - for FA-specific requests with global merge: dedupe by role name
      // - otherwise: dedupe by role name + functional area
      const dedupedMap = new Map();
      for (const role of rawData) {
        const faId =
          role.functionalArea && typeof role.functionalArea === 'object'
            ? String(role.functionalArea._id || '')
            : String(role.functionalArea || '');
        const roleNameKey = String(role.name || '').trim().toLowerCase();
        const key = functionalAreaId ? roleNameKey : `${roleNameKey}__${faId}`;
        if (!dedupedMap.has(key)) {
          dedupedMap.set(key, role);
        }
      }
      let data = Array.from(dedupedMap.values());
      if (seedOnly === 'true') {
        data = data.filter((role) =>
          role?.isCustom === true ||
          seededRoleNameSet.has(String(role?.name || '').trim().toLowerCase())
        );
      }
      const roleIds = data
        .map((role) => role?._id)
        .filter((id) => mongoose.Types.ObjectId.isValid(id));

      let collarByRoleId = new Map();
      if (roleIds.length) {
        const latestRoleCollars = await JobPost.aggregate([
          {
            $match: {
              role: { $in: roleIds },
              collarCategory: { $exists: true, $ne: null, $ne: '' },
            },
          },
          { $sort: { updatedAt: -1, createdAt: -1 } },
          {
            $group: {
              _id: '$role',
              collarCategory: { $first: '$collarCategory' },
            },
          },
        ]);

        collarByRoleId = new Map(
          latestRoleCollars.map((item) => [String(item._id), item.collarCategory])
        );
      }

      const enrichedData = data.map((role) => ({
          ...role,
          collarCategory: role.defaultCollarCategory || collarByRoleId.get(String(role._id)) || '',
      }));

      let responseData = enrichedData;
      if (uniqueByName === 'true') {
        const groupedByName = new Map();

        for (const role of enrichedData) {
          const roleNameKey = String(role?.name || '').trim().toLowerCase();
          const existing = groupedByName.get(roleNameKey);

          if (!existing) {
            groupedByName.set(roleNameKey, {
              ...role,
              roleIds: [role._id],
            });
            continue;
          }

          existing.roleIds.push(role._id);
          if (!existing.collarCategory && role.collarCategory) {
            existing.collarCategory = role.collarCategory;
            existing.defaultCollarCategory = role.defaultCollarCategory;
          }
        }

        responseData = Array.from(groupedByName.values()).sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || ''))
        );
      }

      res.json({
        success: true,
        data: responseData,
      });
    } catch (error) {
      console.error('Roles fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch roles' });
    }
  },

  getUsedRoles: async (req, res, next) => {
    try {
      const { role: userRole, id: userId } = req.user;
      const scope = String(req.query.scope || 'assigned').trim().toLowerCase();
      const now = new Date();
      let query = {};

      if (userRole === 'employer') {
        query = { employer: userId };
      }

      if (userRole === 'hr-admin' || userRole === 'superadmin') {
        if (scope === 'assigned') {
          let assignedEmployerIds = [];

          if (userRole === 'hr-admin') {
            const currentHrAdmin = await User.findById(userId).select('employerIds');
            assignedEmployerIds = (currentHrAdmin?.employerIds || []).map((id) => id.toString());
          } else {
            const hrAdmins = await User.find({ role: 'hr-admin', isActive: true }).select('employerIds');
            assignedEmployerIds = [
              ...new Set(
                hrAdmins.flatMap((hr) => (hr.employerIds || []).map((id) => id.toString()))
              ),
            ];
          }

          const createdEmployers = await User.find({
            role: 'employer',
            createdBy: userId,
            isDeleted: { $ne: true },
          }).select('_id');
          const createdEmployerIds = createdEmployers.map((user) => user._id.toString());

          const effectiveEmployerIds = [
            ...new Set([...assignedEmployerIds, ...createdEmployerIds]),
          ]
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id));

          query = {
            $or: [
              { employer: { $in: effectiveEmployerIds } },
              { postedBy: userId },
            ],
          };
        } else {
          query = {};
        }
      }

      if (userRole !== 'hr-admin' && userRole !== 'superadmin' && userRole !== 'employer') {
        query.applicationDeadline = { $gte: now };
      }

      const usedRoleIds = await JobPost.distinct('role', {
        ...query,
        role: { $ne: null },
      });

      const activeRoleIds = usedRoleIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (!activeRoleIds.length) {
        return res.json({ success: true, data: [] });
      }

      const roles = await Role.find({
        _id: { $in: activeRoleIds },
        isActive: true,
      })
        .select('name isCustom createdBy defaultCollarCategory functionalArea')
        .populate({
          path: 'functionalArea',
          select: 'name industry',
          populate: {
            path: 'industry',
            select: 'name',
          },
        })
        .sort({ name: 1 })
        .lean();

      const latestRoleCollars = await JobPost.aggregate([
        {
          $match: {
            role: { $in: roles.map((role) => role._id) },
            collarCategory: { $exists: true, $ne: null, $ne: '' },
          },
        },
        { $sort: { updatedAt: -1, createdAt: -1 } },
        {
          $group: {
            _id: '$role',
            collarCategory: { $first: '$collarCategory' },
          },
        },
      ]);

      const collarByRoleId = new Map(
        latestRoleCollars.map((item) => [String(item._id), item.collarCategory])
      );

      return res.json({
        success: true,
        data: roles.map((role) => ({
          ...role,
          collarCategory:
            role.defaultCollarCategory || collarByRoleId.get(String(role._id)) || '',
        })),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get skills (SEO: searchable, paginated)
   */
  getSkills: async (req, res) => {
    try {
      const q = req.query.q?.trim() || '';
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 200, 1000); // Cap at 1000
      const skip = (page - 1) * limit;

      const filter = { isActive: true };
      if (q) {
        const regex = new RegExp(q, 'i');
        filter.$or = [{ name: regex }, { keywords: regex }];
      }

      const total = await Skill.countDocuments(filter);

      const data = await Skill.find(filter)
        .select('name slug keywords')
        .skip(skip)
        .limit(limit)
        .sort({ name: 1 })
        .lean();

      res.json({
        success: true,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        data,
      });
    } catch (error) {
      console.error('Skills fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch skills' });
    }
  },

  /**
   * Get popular roles (SEO: dynamic trending page)
   */
  getPopularRoles: async (req, res) => {
    try {
      const data = await Role.find({ isActive: true })
        .select('name slug searchVolume isTrending')
        .sort({ searchVolume: -1, isTrending: -1 })
        .limit(20)
        .lean();

      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch popular roles', error: error.message });
    }
  },

  /**
   * Get skill categories (SEO: category pages)
   */
getSkillCategories: async (req, res) => {
  try {
    const categories = await Skill.distinct('category', {
      category: { $ne: null, $ne: '' },
      isActive: true 
    });

    console.log("ejfbkuf", categories);
    

    res.json({
      success: true,
      data: categories.sort(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch skill categories',
    });
  }
},


  /**
   * Get locations (SEO: city-based job pages)
   */
  getLocations: async (req, res) => {
    try {
      const q = req.query.q || '';
      const filter = { isActive: true };
      if (q) {
        filter.name = { $regex: q, $options: 'i' };
      }

      const locationQuery = Location.find(filter)
        .select('name slug state keywords')
        .sort({ name: 1 });

      if (q) {
        locationQuery.limit(50);
      }

      const data = await locationQuery.lean();

      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch locations', error: error.message });
    }
  },

  deleteCustomRole: async (req, res, next) => {
    try {
      const roleId = String(req.params.id || '').trim();
      const groupByName = req.query?.groupByName === 'true';
      if (!mongoose.Types.ObjectId.isValid(roleId)) {
        throw new BadRequestError('Invalid role id');
      }

      const role = await Role.findById(roleId).select('name isCustom createdBy');
      if (!role) {
        throw new NotFoundError('Role not found');
      }

      if (!role.isCustom) {
        throw new BadRequestError('Only custom roles can be deleted');
      }

      if (!role.createdBy || String(role.createdBy) !== String(req.user.id)) {
        throw new ForbiddenError('You can delete only roles created by you');
      }

      const deleteFilter = groupByName
        ? {
            name: role.name,
            isCustom: true,
            createdBy: req.user.id,
            isActive: true,
          }
        : { _id: role._id };

      const deleteResult = await Role.updateMany(
        deleteFilter,
        {
          $set: {
            isActive: false,
          },
        },
      );

      return res.json({
        success: true,
        message: `Custom role "${role.name}" removed from the dropdown successfully`,
        deletedCount: Number(deleteResult?.modifiedCount || 0),
      });
    } catch (error) {
      next(error);
    }
  },

  createCustomRole: async (req, res, next) => {
    try {
      const roleName = toSafeString(req.body?.name);
      if (!roleName) {
        throw new BadRequestError('Role name is required');
      }

      const regex = new RegExp(`^${roleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

      const existingCustomRole = await Role.findOne({
        name: regex,
        isCustom: true,
        createdBy: req.user.id,
        isActive: true,
      })
        .populate({
          path: 'functionalArea',
          select: 'name industry',
          populate: {
            path: 'industry',
            select: 'name slug',
          },
        });

      if (existingCustomRole) {
        return res.status(200).json({
          success: true,
          message: 'Custom role already exists',
          role: existingCustomRole,
        });
      }

      const functionalAreaId = await getDefaultCustomRoleFunctionalAreaId();
      const createdRole = await resolveRoleDocument(roleName, functionalAreaId, req.user.id);
      const populatedRole = await Role.findById(createdRole._id)
        .populate({
          path: 'functionalArea',
          select: 'name industry',
          populate: {
            path: 'industry',
            select: 'name slug',
          },
        });

      return res.status(201).json({
        success: true,
        message: `Custom role "${createdRole.name}" created successfully`,
        role: populatedRole,
      });
    } catch (error) {
      next(error);
    }
  },

  updateRoleCollarCategory: async (req, res, next) => {
    try {
      const roleId = String(req.params.id || '').trim();
      const collarCategory = String(req.body?.collarCategory || '').trim();
      const syncExistingJobs = req.body?.syncExistingJobs === true;

      if (!mongoose.Types.ObjectId.isValid(roleId)) {
        throw new BadRequestError('Invalid role id');
      }

      if (!collarCategory) {
        throw new BadRequestError('Collar category is required');
      }

      const role = await Role.findById(roleId).select('name isActive');
      if (!role || !role.isActive) {
        throw new NotFoundError('Role not found');
      }

      const siblingRoles = await Role.find({
        name: role.name,
        isActive: true,
      }).select('_id');
      const siblingRoleIds = siblingRoles.map((item) => item._id);

      await Role.updateMany(
        { _id: { $in: siblingRoleIds } },
        { $set: { defaultCollarCategory: collarCategory } }
      );

      let updatedJobsCount = 0;
      if (syncExistingJobs) {
        const updateResult = await JobPost.updateMany(
          { role: { $in: siblingRoleIds } },
          { $set: { collarCategory } }
        );
        updatedJobsCount = Number(updateResult?.modifiedCount || 0);
      }

      return res.json({
        success: true,
        message: `Collar category updated for "${role.name}"`,
        role: {
          _id: role._id,
          defaultCollarCategory: collarCategory,
          updatedRoleCount: siblingRoleIds.length,
        },
        updatedJobsCount,
      });
    } catch (error) {
      next(error);
    }
  },

  saveRoleCollarConfig: async (req, res, next) => {
    try {
      const industryId = await resolveIndustryId(req.body?.industry);
      const functionalAreaId = await resolveFunctionalAreaId(
        req.body?.functionalArea,
        industryId,
      );
      const role = await resolveRoleDocument(
        req.body?.role,
        functionalAreaId,
        req.user.id,
      );

      const collarCategory = String(req.body?.collarCategory || '').trim();
      const syncExistingJobs = req.body?.syncExistingJobs === true;

      if (!collarCategory) {
        throw new BadRequestError('Collar category is required');
      }

      role.defaultCollarCategory = collarCategory;
      await role.save();

      let updatedJobsCount = 0;
      if (syncExistingJobs) {
        const updateResult = await JobPost.updateMany(
          { role: role._id },
          { $set: { collarCategory } }
        );
        updatedJobsCount = Number(updateResult?.modifiedCount || 0);
      }

      return res.json({
        success: true,
        message: `Collar category saved for "${role.name}"`,
        role: {
          _id: role._id,
          name: role.name,
          defaultCollarCategory: role.defaultCollarCategory,
        },
        updatedJobsCount,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default masterController;
