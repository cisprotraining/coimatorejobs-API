import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_COMPANY_PROFILE_SELECT, toPublicCompanyProfile } from '../utils/publicCompanyProfile.js';

test('public company profile serializer keeps directory/detail fields and drops private fields', () => {
  const result = toPublicCompanyProfile({
    _id: 'company-id',
    companyName: 'Example Co',
    logo: 'https://assets.example/logo.png',
    industry: { _id: 'industry-id', name: 'IT' },
    location: { city: 'Coimbatore', address: 'Public office' },
    status: 'approved',
    allowInSearch: true,
    openJobsCount: 2,
    email: 'private@example.com',
    phone: 'private phone',
    companyGSTIN: 'GST-PRIVATE',
    panNo: 'PAN-PRIVATE',
    employer: 'employer-id',
    createdBy: 'creator-id',
    approvedBy: 'approver-id',
    profileViews: 20,
    dailyViews: [{ date: '2026-11-19', count: 20 }],
    uniqueViewers: ['candidate-id'],
  });

  assert.deepEqual(result, {
    _id: 'company-id',
    companyName: 'Example Co',
    logo: 'https://assets.example/logo.png',
    industry: { _id: 'industry-id', name: 'IT' },
    location: { city: 'Coimbatore', address: 'Public office' },
    status: 'approved',
    allowInSearch: true,
    openJobsCount: 2,
  });
  for (const field of ['email', 'phone', 'companyGSTIN', 'panNo', 'employer', 'createdBy', 'approvedBy', 'profileViews', 'dailyViews', 'uniqueViewers']) {
    assert.equal(result[field], undefined, `${field} must not be in a public response`);
  }
  assert.equal(PUBLIC_COMPANY_PROFILE_SELECT.includes('companyGSTIN'), false);
});

test('public serializer accepts mongoose-like documents', () => {
  const result = toPublicCompanyProfile({
    toObject: () => ({ _id: 'company-id', companyName: 'Example Co', panNo: 'private' }),
  });
  assert.deepEqual(result, { _id: 'company-id', companyName: 'Example Co' });
});
