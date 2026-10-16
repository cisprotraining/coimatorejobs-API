import './helpers/controllerTestEnv.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import JobPost from '../models/jobs.model.js';
import jobsController from '../controller/jobs.controller.js';

const invoke = async (job, param = 'assistant-manager-india-695e01c99b4c5858c1a109df') => {
  const calls = [];
  const originals = { findOne: JobPost.findOne, updateOne: JobPost.updateOne, exists: JobPost.exists };
  const chain = {
    populate: (options) => { calls.push(['populate', options]); return chain; },
    select: (fields) => { calls.push(['select', fields]); return chain; },
    then: (resolve, reject) => Promise.resolve(job).then(resolve, reject),
  };
  JobPost.findOne = (query) => { calls.push(['findOne', query]); return chain; };
  JobPost.updateOne = () => { throw new Error('A public detail GET must not update stored jobs'); };
  JobPost.exists = () => { throw new Error('A public detail GET must not generate a new jobId'); };
  const res = { code: null, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  let error;
  try {
    await jobsController.getJobPost({ params: { id: param }, user: null }, res, (err) => { error = err; });
  } finally {
    Object.assign(JobPost, originals);
  }
  return { res, error, calls };
};

test('closed public job detail is readable without generating or saving a jobId', async () => {
  const row = { _id: '695e01c99b4c5858c1a109df', slug: 'assistant-manager-india-695e01c99b4c5858c1a109df', title: 'Assistant Manager', status: 'Closed', applicationDeadline: '2026-01-31', employer: 'private-employer', contactEmail: 'private@example.invalid' };
  const result = await invoke(row);
  assert.equal(result.error, undefined);
  assert.equal(result.res.code, 200);
  assert.equal(result.res.body.jobPost.status, 'Closed');
  assert.equal(row.jobId, undefined);
  assert.equal(result.res.body.jobPost.employer, undefined);
  assert.equal(result.res.body.jobPost.contactEmail, undefined);
  assert.ok(result.calls.find(([method]) => method === 'select')[1].split(' ').includes('jobId'));
});

test('detail populates tolerate invalid legacy IDs including nested company industry', async () => {
  const result = await invoke({ _id: '695e01c99b4c5858c1a109df', status: 'Published', title: 'Developer' });
  assert.equal(result.error, undefined);
  const populates = result.calls.filter(([method]) => method === 'populate').map(([, options]) => options);
  assert.deepEqual(populates.map((item) => item.path), ['companyProfile', 'functionalAreas', 'industry', 'role', 'skills']);
  assert.ok(populates.every((item) => item.skipInvalidIds === true));
  assert.equal(populates[0].populate.skipInvalidIds, true);
});

test('ObjectId links resolve by ID while nonexistent records still return not-found', async () => {
  const id = '695e01c99b4c5858c1a109df';
  const result = await invoke(null, id);
  assert.deepEqual(result.calls.find(([method]) => method === 'findOne')[1], { _id: id });
  assert.equal(result.error?.statusCode, 404);
});
