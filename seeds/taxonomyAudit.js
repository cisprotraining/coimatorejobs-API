// seeds/taxonomyAudit.js
// ---------------------------------------------------------------------------
// READ-ONLY audit of duplicate / synonymous industry and role records.
//
// Normalization is done at resolution time (utils/taxonomyCanonical.js +
// utils/jobTaxonomyResolver.js): every record in a canonical group resolves to
// the whole group, so no job reference is rewritten and no record is deleted
// or deactivated. (Deactivating a role would also HIDE its jobs, because role
// resolution excludes inactive roles.)
//
// This script reports, per group, which master records exist and how many
// jobs / live jobs reference each — plus any remaining same-name duplicates
// that are not yet grouped. It never writes.
//
// Usage: node seeds/taxonomyAudit.js
// ---------------------------------------------------------------------------
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectToDatabase from '../database/mongodb.js';
import JobPost from '../models/jobs.model.js';
import Industry from '../models/industry.model.js';
import Role from '../models/role.model.js';
import { INDUSTRY_CANONICAL_GROUPS, ROLE_CANONICAL_GROUPS, taxonomyKey } from '../utils/taxonomyCanonical.js';

dotenv.config();

const audit = async () => {
  await connectToDatabase();
  const now = new Date();
  const live = { status: 'Published', applicationDeadline: { $gte: now } };

  const countsBy = async (field) => {
    const rows = await JobPost.aggregate([
      { $group: { _id: `$${field}`, all: { $sum: 1 }, live: { $sum: { $cond: [{ $and: [{ $eq: ['$status', live.status] }, { $gte: ['$applicationDeadline', now] }] }, 1, 0] } } } },
    ]);
    return new Map(rows.map((row) => [String(row._id), row]));
  };

  const report = async (label, Model, groups, field, filter = {}) => {
    const rows = await Model.find(filter).select('_id name slug').lean();
    const counts = await countsBy(field);
    let records = 0;
    console.log(`\n${label.toUpperCase()} GROUPS`);
    groups.forEach((group) => {
      const names = new Set([group.canonical, ...group.members].map(taxonomyKey));
      const members = rows.filter((row) => names.has(taxonomyKey(row.name)));
      const canonical = members.filter((row) => taxonomyKey(row.name) === taxonomyKey(group.canonical));
      records += members.length - canonical.length;
      console.log(`  ${group.canonical}  (${members.length} records, ${members.length - canonical.length} normalized onto it)`);
      members.forEach((row) => {
        const c = counts.get(String(row._id)) || { all: 0, live: 0 };
        console.log(`    ${row.name.padEnd(48)} ${row.slug.padEnd(44)} jobs=${c.all} live=${c.live}`);
      });
    });

    const byName = new Map();
    rows.forEach((row) => byName.set(taxonomyKey(row.name), [...(byName.get(taxonomyKey(row.name)) || []), row]));
    const sameName = [...byName.values()].filter((list) => list.length > 1);
    console.log(`  Same-name records (resolved together automatically): ${sameName.length} names, ${sameName.reduce((sum, list) => sum + list.length, 0)} records`);
    sameName.forEach((list) => console.log(`    ${list.map((row) => `${row.name} [${row.slug}]`).join(' | ')}`));
    return { grouped: records, sameName };
  };

  const industries = await report('industry', Industry, INDUSTRY_CANONICAL_GROUPS, 'industry');
  const roles = await report('role', Role, ROLE_CANONICAL_GROUPS, 'role', { isActive: true });
  console.log(`\nIndustry records normalized onto a canonical record: ${industries.grouped}`);
  console.log(`Role records normalized onto a canonical record: ${roles.grouped} (+ ${roles.sameName.reduce((sum, list) => sum + list.length - 1, 0)} same-name records)`);
  console.log('READ-ONLY — nothing was written.');
  await mongoose.connection.close();
};

audit()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Taxonomy audit FAILED:', error);
    process.exit(1);
  });
