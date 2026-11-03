import test from 'node:test';
import assert from 'node:assert/strict';
import { toPublicRoleOptions } from '../utils/publicRoleOptions.js';

test('public role options keep only name and slug and deduplicate names case-insensitively', () => {
  const result = toPublicRoleOptions([
    { _id: '1', name: 'Account Manager', slug: 'account-manager', keywords: ['internal'], isCustom: true },
    { _id: '2', name: 'account manager', slug: 'account-manager-alt', keywords: ['other'] },
    { name: 'Data Analyst', slug: 'data-analyst' },
  ]);

  assert.deepEqual(result, [
    { name: 'Account Manager', slug: 'account-manager' },
    { name: 'Data Analyst', slug: 'data-analyst' },
  ]);
});

test('public role options omit records without a usable name or slug', () => {
  assert.deepEqual(toPublicRoleOptions([
    { name: 'Missing slug' },
    { slug: 'missing-name' },
    null,
  ]), []);
});
