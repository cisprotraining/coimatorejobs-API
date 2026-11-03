import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteCompanyProfileRelatedData } from '../utils/companyProfileCascade.js';

function createModel(distinctResult = []) {
  const calls = [];
  return {
    calls,
    distinct: async (...args) => {
      calls.push(['distinct', ...args]);
      return distinctResult;
    },
    deleteMany: async (...args) => {
      calls.push(['deleteMany', ...args]);
      return { deletedCount: 0 };
    },
    updateMany: async (...args) => {
      calls.push(['updateMany', ...args]);
      return { modifiedCount: 0 };
    },
  };
}

test('company profile cascade removes applications, saved jobs, notifications and all job/profile references', async () => {
  const profileId = 'company-1';
  const jobIds = ['job-1', 'job-2'];
  const applicationIds = ['application-1'];
  const JobPost = createModel(jobIds);
  const Application = createModel(applicationIds);
  const SavedJob = createModel();
  const Notification = createModel();
  const EmployerResumeDownloadLog = createModel();
  const DemandCandidate = createModel();
  const Homepage = createModel();

  const result = await deleteCompanyProfileRelatedData({
    profileId,
    JobPost,
    Application,
    SavedJob,
    Notification,
    EmployerResumeDownloadLog,
    DemandCandidate,
    Homepage,
  });

  assert.deepEqual(result, { deletedJobCount: 2, deletedApplicationCount: 1 });
  assert.deepEqual(JobPost.calls, [
    ['distinct', '_id', { companyProfile: profileId }],
    ['deleteMany', { _id: { $in: jobIds } }],
  ]);
  assert.deepEqual(Application.calls, [
    ['distinct', '_id', { jobPost: { $in: jobIds } }],
    ['deleteMany', { jobPost: { $in: jobIds } }],
  ]);
  assert.ok(SavedJob.calls.some(([method, filter]) => method === 'deleteMany' && filter?.jobPost?.$in === jobIds));
  assert.ok(Notification.calls.some(([method, filter]) => method === 'deleteMany' && filter?.application?.$in === applicationIds));
  assert.ok(Notification.calls.some(([method, filter]) => method === 'deleteMany' && filter?.jobPost?.$in === jobIds));
  assert.ok(EmployerResumeDownloadLog.calls.some(([method, filter]) => method === 'deleteMany' && filter?.jobPost?.$in === jobIds));
  assert.ok(DemandCandidate.calls.some(([method, filter]) => method === 'deleteMany' && filter?.companyProfile === profileId));
  assert.ok(Homepage.calls.some(([method, , update]) => method === 'updateMany' && update.$pull.featuredJobs.$in === jobIds));
  assert.ok(Homepage.calls.some(([method, , update]) => method === 'updateMany' && update.$pull.featuredCompanies === profileId));
});

test('company profile cascade skips job-collection deletes when there are no jobs', async () => {
  const JobPost = createModel([]);
  const Application = createModel([]);
  const SavedJob = createModel();
  const Notification = createModel();
  const EmployerResumeDownloadLog = createModel();
  const DemandCandidate = createModel();
  const Homepage = createModel();

  const result = await deleteCompanyProfileRelatedData({
    profileId: 'company-empty',
    JobPost,
    Application,
    SavedJob,
    Notification,
    EmployerResumeDownloadLog,
    DemandCandidate,
    Homepage,
  });

  assert.deepEqual(result, { deletedJobCount: 0, deletedApplicationCount: 0 });
  assert.equal(Application.calls.some(([method]) => method === 'deleteMany'), false);
  assert.equal(SavedJob.calls.length, 0);
  assert.equal(Notification.calls.length, 0);
  assert.equal(EmployerResumeDownloadLog.calls.length, 0);
  assert.equal(JobPost.calls.some(([method]) => method === 'deleteMany'), false);
});
