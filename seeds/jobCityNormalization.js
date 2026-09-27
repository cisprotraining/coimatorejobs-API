// seeds/jobCityNormalization.js
// ---------------------------------------------------------------------------
// ONE-TIME DATA MIGRATION — unambiguous job city corrections.
//
// JobPost.location.city is free text. A few values are misspellings or
// case variants of a real master Location ("trippur", "trichy",
// "coimbatore"); jobs carrying them miss their city page. This rewrites ONLY
// those values, and only when the correct city is unambiguous.
//
// Deliberately NOT touched (reported as "left as-is"):
//   * states / regions ("TAMILNADU", "Kerala, Tamil Nadu", "Anywhere in Tamilnadu")
//   * multi-place or district values ("Sankagiri, Salem", "nilagiri")
//   * real cities missing from the master list (e.g. "Karur") — valid as-is
//   * neighbourhoods — they are never converted into locations
//
// SAFETY CONTRACT (same as seeds/experienceNormalization.js)
//   * DRY RUN BY DEFAULT. Writes only with --apply.
//   * Touches ONLY location.city. updateOne + $set, timestamps: false, so no
//     model hook fires: slugs, updatedAt, job alerts and the Google Indexing
//     API are unaffected.
//   * Writes a rollback report (old and new city arrays) BEFORE applying.
//
// Usage:
//   node seeds/jobCityNormalization.js            # dry run
//   node seeds/jobCityNormalization.js --apply
// ---------------------------------------------------------------------------
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import connectToDatabase from '../database/mongodb.js';
import JobPost from '../models/jobs.model.js';
import Location from '../models/location.model.js';
import { correctCityName } from '../utils/cityNormalization.js';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const REPORT_PATH = path.resolve(process.cwd(), `migration-report-city${APPLY ? '' : '-dry-run'}.json`);

const migrate = async () => {
  await connectToDatabase();
  const masterNames = (await Location.find({}).select('name').lean()).map((row) => row.name);

  const jobs = await JobPost.find({ 'location.city.0': { $exists: true } })
    .select('_id title status location.city')
    .lean();

  const changes = [];
  const leftAsIs = new Map();

  jobs.forEach((job) => {
    const oldCities = job.location.city;
    const newCities = oldCities.map((city) => {
      const corrected = correctCityName(city, masterNames);
      if (!corrected && !masterNames.some((name) => name === city)) {
        leftAsIs.set(city, (leftAsIs.get(city) || 0) + 1);
      }
      return corrected || city;
    });
    // De-duplicate in case a job listed both "trippur" and "Tiruppur".
    const deduped = [...new Set(newCities)];
    if (JSON.stringify(deduped) !== JSON.stringify(oldCities)) {
      changes.push({ documentId: String(job._id), title: job.title, status: job.status, oldValues: { city: oldCities }, newValues: { city: deduped } });
    }
  });

  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify({ migration: 'jobCityNormalization', mode: APPLY ? 'apply' : 'dry-run', generatedAt: new Date().toISOString(), fieldsWritten: ['location.city'], documentCount: changes.length, documents: changes, leftAsIs: Object.fromEntries(leftAsIs) }, null, 2),
    'utf8',
  );

  if (APPLY && changes.length) {
    await JobPost.bulkWrite(
      changes.map((change) => ({
        updateOne: {
          filter: { _id: change.documentId, 'location.city': change.oldValues.city },
          update: { $set: { 'location.city': change.newValues.city } },
          timestamps: false,
        },
      })),
      { ordered: false },
    );
  }

  console.log(`Jobs scanned            : ${jobs.length}`);
  console.log(`Jobs ${APPLY ? 'updated' : 'to update'}         : ${changes.length}`);
  changes.forEach((change) =>
    console.log(`  ${change.documentId}  ${JSON.stringify(change.oldValues.city)} -> ${JSON.stringify(change.newValues.city)}  [${change.status}]`),
  );
  console.log('Left as-is (ambiguous or not a master city):');
  [...leftAsIs.entries()].sort((a, b) => b[1] - a[1]).forEach(([city, count]) => console.log(`  ${String(count).padStart(4)}  ${JSON.stringify(city)}`));
  console.log(`Report: ${REPORT_PATH}`);
  if (!APPLY) console.log('DRY RUN — nothing was written. Re-run with --apply to persist.');

  await mongoose.connection.close();
};

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('City normalization FAILED:', error);
    process.exit(1);
  });
