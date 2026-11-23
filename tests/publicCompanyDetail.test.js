import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import publicRouter from '../routes/public.routes.js';
import CompanyProfile from '../models/companyProfile.model.js';
import JobPost from '../models/jobs.model.js';

test('public company details return only approved whitelisted profiles and proper missing statuses', async (t) => {
  const originalFind = CompanyProfile.findOne;
  const originalCount = JobPost.countDocuments;
  let found = true;
  const id = '111111111111111111111111';
  CompanyProfile.findOne = (filter) => {
    assert.deepEqual(filter, { _id: id, status: 'approved' });
    const query = { select: () => query, populate: () => query, lean: async () => found ? {
      _id: id, companyName: 'Public Company', companyGSTIN: 'secret', panNo: 'secret', employer: 'secret',
      createdBy: 'secret', phone: 'secret', email: 'secret', dailyViews: ['secret'], profileViews: 5,
    } : null };
    return query;
  };
  JobPost.countDocuments = async () => 2;
  const app = express();
  app.use('/api/v1/public', publicRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    CompanyProfile.findOne = originalFind;
    JobPost.countDocuments = originalCount;
    await new Promise(resolve => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/v1/public/companies/`;
  assert.equal((await fetch(url+'invalid-id')).status, 404);
  const response = await fetch(url+id);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, profile: { _id: id, companyName: 'Public Company' }, activeJobsCount: 2 });
  found = false;
  assert.equal((await fetch(url+id)).status, 404);
});
