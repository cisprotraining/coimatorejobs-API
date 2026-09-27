// tests/taxonomyNormalization.test.js
// ---------------------------------------------------------------------------
// Canonical taxonomy groups, resolver expansion and city corrections.
// No database: the two model `find` statics are stubbed per test.
// ---------------------------------------------------------------------------
import test from 'node:test';
import assert from 'node:assert/strict';

import Industry from '../models/industry.model.js';
import Role from '../models/role.model.js';
import {
  INDUSTRY_CANONICAL_GROUPS,
  ROLE_CANONICAL_GROUPS,
  canonicalIndustryName,
  canonicalRoleName,
  industryGroupNames,
  taxonomyKey,
} from '../utils/taxonomyCanonical.js';
import { resolveJobQueryTaxonomy } from '../utils/jobTaxonomyResolver.js';
import { buildHubSummary } from '../utils/jobHubSummary.js';
import { correctCityName } from '../utils/cityNormalization.js';

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------
test('canonical groups: IT variants and ITES/BPO variants resolve to IT / Software', () => {
  for (const name of ['IT', 'IT / Software', 'IT Services and IT Consulting.', 'IT & ITES/ BPO', 'IT/ ITES & BPO', 'it-software']) {
    assert.equal(canonicalIndustryName(name), 'IT / Software', name);
  }
  assert.equal(canonicalIndustryName('IT/Education'), 'IT/Education', 'mixed categories stay separate');
  assert.equal(canonicalIndustryName('Finance'), 'Finance');
});

test('canonical groups: telecalling synonyms resolve to Telecalling Executive', () => {
  for (const name of ['Telecaller', 'Tele caller', 'Telecalling', 'telecalling-executive']) {
    assert.equal(canonicalRoleName(name), 'Telecalling Executive', name);
  }
  assert.equal(canonicalRoleName('Admin cum Telecaller'), 'Admin cum Telecaller', 'a different role is not merged');
});

test('canonical groups: no name belongs to two groups; canonical slug stays it-software', () => {
  // Two records may share a key inside one group ("Telecaller" / "Tele caller");
  // a key must never belong to two different groups.
  for (const groups of [INDUSTRY_CANONICAL_GROUPS, ROLE_CANONICAL_GROUPS]) {
    const owner = new Map();
    groups.forEach((group) =>
      [group.canonical, ...group.members].forEach((name) => {
        const key = taxonomyKey(name);
        assert.ok(!owner.has(key) || owner.get(key) === group.canonical, `${name} is in two groups`);
        owner.set(key, group.canonical);
      }),
    );
  }
  assert.equal(industryGroupNames('it-software')[0], 'IT / Software');
});

// ---------------------------------------------------------------------------
// Resolver expansion (models stubbed)
// ---------------------------------------------------------------------------
const INDUSTRIES = [
  { _id: 'i1', name: 'IT / Software', slug: 'it-software' },
  { _id: 'i2', name: 'IT', slug: 'it' },
  { _id: 'i3', name: 'IT Services and IT Consulting.', slug: 'it-services-and-it-consulting' },
  { _id: 'i4', name: 'Finance', slug: 'finance' },
];
const ROLES = [
  { _id: 'r1', name: 'Telecalling Executive', slug: 'telecalling-executive', isActive: true },
  { _id: 'r2', name: 'Telecaller', slug: 'telecaller', isActive: true },
  { _id: 'r3', name: 'Tele caller', slug: 'tele-caller', isActive: true },
  { _id: 'r4', name: 'Telecalling', slug: 'telecalling', isActive: false },
  { _id: 'r5', name: 'Junior Architect', slug: 'junior-architect', isActive: true },
  { _id: 'r6', name: 'Junior architect', slug: 'junior-architect-1', isActive: true },
  { _id: 'r7', name: 'Accountant', slug: 'accountant', isActive: true },
];

const matches = (row, filter) =>
  Object.entries(filter).every(([key, cond]) => {
    const value = row[key];
    if (cond instanceof RegExp) return cond.test(value);
    if (cond && Array.isArray(cond.$in)) return cond.$in.some((item) => (item instanceof RegExp ? item.test(value) : item === value));
    return value === cond;
  });

const stubFind = (Model, rows) => {
  const original = Model.find;
  Model.find = (filter = {}) => {
    const result = rows.filter((row) => matches(row, filter));
    const chain = { select: () => chain, lean: async () => result };
    return chain;
  };
  return () => { Model.find = original; };
};

const withStubs = async (fn) => {
  const restore = [stubFind(Industry, INDUSTRIES), stubFind(Role, ROLES)];
  try { await fn(); } finally { restore.forEach((undo) => undo()); }
};

test('resolver: ?industry=it-software matches every IT group record (job references untouched)', () =>
  withStubs(async () => {
    const { industry } = await resolveJobQueryTaxonomy({ industry: 'it-software' });
    assert.deepEqual(industry.ids.sort(), ['i1', 'i2', 'i3']);
    const viaMember = await resolveJobQueryTaxonomy({ industry: 'it' });
    assert.deepEqual(viaMember.industry.ids.sort(), ['i1', 'i2', 'i3']);
    const finance = await resolveJobQueryTaxonomy({ industry: 'finance' });
    assert.deepEqual(finance.industry.ids, ['i4']);
  }));

test('resolver: ?role=telecalling-executive matches active synonyms only', () =>
  withStubs(async () => {
    const { role } = await resolveJobQueryTaxonomy({ role: 'telecalling-executive' });
    assert.deepEqual(role.ids.sort(), ['r1', 'r2', 'r3'], 'soft-deleted "Telecalling" stays excluded');
  }));

test('resolver: same-name roles under suffixed slugs resolve together', () =>
  withStubs(async () => {
    const { role } = await resolveJobQueryTaxonomy({ role: 'junior-architect-1' });
    assert.deepEqual(role.ids.sort(), ['r5', 'r6']);
    const accountant = await resolveJobQueryTaxonomy({ role: 'accountant' });
    assert.deepEqual(accountant.role.ids, ['r7']);
  }));

// ---------------------------------------------------------------------------
// Hub summary
// ---------------------------------------------------------------------------
test('hub summary counts equivalent records under the canonical name', () => {
  const now = new Date('2026-09-01T00:00:00Z');
  const job = (industry, role) => ({
    status: 'Published',
    applicationDeadline: '2026-12-01T00:00:00Z',
    location: { city: ['Coimbatore'] },
    industry: { name: industry },
    role: { name: role },
  });
  const summary = buildHubSummary(
    [job('IT', 'Telecaller'), job('IT / Software', 'Telecalling Executive'), job('IT/ ITES & BPO', 'Tele caller')],
    { now },
  );
  assert.deepEqual(summary.categories, [{ name: 'IT / Software', count: 3 }]);
  assert.deepEqual(summary.roles, [{ name: 'Telecalling Executive', count: 3 }]);
});

// ---------------------------------------------------------------------------
// City corrections
// ---------------------------------------------------------------------------
const MASTER_CITIES = ['Coimbatore', 'Tiruppur', 'Tiruchirappalli', 'Salem', 'Coonoor', 'Bengaluru'];

test('city: unambiguous misspellings and case variants are corrected', () => {
  assert.equal(correctCityName('trippur', MASTER_CITIES), 'Tiruppur');
  assert.equal(correctCityName('thirupur', MASTER_CITIES), 'Tiruppur');
  assert.equal(correctCityName('trichy', MASTER_CITIES), 'Tiruchirappalli');
  assert.equal(correctCityName('coimbatore', MASTER_CITIES), 'Coimbatore');
  assert.equal(correctCityName(' COIMBATORE ', MASTER_CITIES), 'Coimbatore');
});

test('city: valid, ambiguous and non-city values are left as-is', () => {
  for (const value of [
    'Coimbatore', // already canonical
    'Karur', // real city, not in the master list — never invented or remapped
    'TAMILNADU', 'Anywhere in Tamilnadu', 'Kerala, Tamil Nadu', // states / regions
    'Sankagiri, Salem', 'Chennai, Salem', // multi-place
    'nilagiri', 'Ooty', // district / not a master city
    'Peelamedu', 'TIDEL Park', // neighbourhoods are never converted
  ]) {
    assert.equal(correctCityName(value, MASTER_CITIES), null, value);
  }
  assert.equal(correctCityName('trippur', ['Coimbatore']), null, 'target must exist in the master list');
});
