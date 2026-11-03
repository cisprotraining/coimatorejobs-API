import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPublicJobApprovalStatus,
  publicJobApprovalFilter,
} from '../utils/publicJobApproval.js';

test('the shared public approval filter includes approved and legacy rows only', () => {
  const filter = publicJobApprovalFilter({ status: 'Published', 'location.city': 'Chennai' });
  assert.deepEqual(filter, {
    status: 'Published',
    'location.city': 'Chennai',
    jobApprovalStatus: { $in: ['not_required', 'accepted', null] },
  });
});

test('approval eligibility consistently permits accepted, not-required, and legacy jobs', () => {
  for (const status of ['accepted', 'not_required', null, undefined, '']) {
    assert.equal(isPublicJobApprovalStatus(status), true);
  }
});

test('approval eligibility rejects every explicit non-approved state', () => {
  for (const status of ['pending', 'ignored', 'rejected', 'unexpected']) {
    assert.equal(isPublicJobApprovalStatus(status), false);
  }
});
