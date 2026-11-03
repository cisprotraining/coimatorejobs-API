import test from 'node:test';
import assert from 'node:assert/strict';
import { toPublicJob } from '../utils/publicJobSerializer.js';

test('public job response keeps listing fields and removes internal and contact data', () => {
  const result = toPublicJob({
    _id: 'job-id',
    employer: 'employer-user-id',
    postedBy: 'poster-user-id',
    closedBy: 'closer-user-id',
    contactEmail: 'private@example.com',
    contactUsername: 'Private recruiter',
    viewerIds: ['viewer-id'],
    uniqueViewers: ['viewer-id'],
    jobApprovalRespondedBy: 'reviewer-id',
    salaryNorm: { min: 100, max: 200 },
    applicantCount: 12,
    title: 'Frontend Developer',
    slug: 'frontend-developer-jobs-in-coimbatore-acme',
    status: 'Published',
    companyProfile: {
      _id: 'company-profile-id',
      companyName: 'Acme',
      logo: '/acme.png',
      slug: 'acme',
      phone: 'private phone',
    },
    location: { city: ['Coimbatore'], country: 'India', completeAddress: 'private address' },
    positions: { total: 2, remaining: 1, applicantIds: ['candidate-id'] },
    industry: { _id: 'industry-id', name: 'IT', internalNote: 'private' },
  });

  assert.equal(result.title, 'Frontend Developer');
  assert.equal(result.companyProfile.companyName, 'Acme');
  assert.deepEqual(result.location, { city: ['Coimbatore'], country: 'India' });
  assert.deepEqual(result.positions, { total: 2, remaining: 1 });
  assert.deepEqual(result.industry, { _id: 'industry-id', name: 'IT' });
  for (const forbidden of [
    'employer', 'postedBy', 'closedBy', 'contactEmail', 'contactUsername',
    'viewerIds', 'uniqueViewers', 'jobApprovalRespondedBy', 'salaryNorm',
    'applicantCount',
  ]) {
    assert.equal(Object.hasOwn(result, forbidden), false, `${forbidden} must not be public`);
  }
  assert.equal(Object.hasOwn(result.companyProfile, 'phone'), false);
  assert.equal(Object.hasOwn(result.location, 'completeAddress'), false);
  assert.equal(Object.hasOwn(result.positions, 'applicantIds'), false);
});
