import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPublicHome } from '../utils/publicHome.js';

function fixture({ curated = [], selected = [], fallback = [] } = {}) {
  const calls = [];
  const query = (value, label) => {
    const q = {};
    for (const method of ['select', 'populate', 'sort', 'limit']) q[method] = (...args) => {
      calls.push([label, method, ...args]); return q;
    };
    q.lean = async () => value;
    return q;
  };
  let jobQueries = 0;
  return { calls, models: {
    Homepage: { findOne: () => query({ featuredJobs: curated, featuredCompanies: ['c2', 'c1'] }, 'home') },
    JobPost: {
      find: filter => { calls.push(['jobs', 'find', filter]); return query(jobQueries++ ? fallback : selected, 'jobs'); },
      aggregate: async pipeline => { calls.push(['summary', pipeline]); return [{
        locations: [{ _id: ' Coimbatore ' }, { _id: 'Chennai' }, { _id: 'Coimbatore' }],
        counts: [{ _id: 'c1', count: 4 }],
      }]; },
    },
    CompanyProfile: { find: filter => {
      calls.push(['companies', 'find', filter]);
      return query([{ _id: 'c1', companyName: 'One', panNo: 'private', uniqueViewers: ['candidate'] },
        { _id: 'c2', companyName: 'Two', phone: 'private' }], 'companies');
    } },
    Industry: { find: filter => { calls.push(['industries', 'find', filter]); return query([{ name: 'IT', slug: 'it', secret: true }], 'industries'); } },
  } };
}

test('homepage has bounded public cards, aggregate counts and no private fields', async () => {
  const { models, calls } = fixture({ selected: [{ _id: 'j1', title: 'Engineer', employer: 'private', contactEmail: 'private',
    companyProfile: { _id: 'c1', companyName: 'One', phone: 'private' } }] });
  const now = new Date('2026-11-13T00:00:00Z');
  const result = await loadPublicHome(models, now);
  assert.equal(result.jobs[0].title, 'Engineer');
  assert.equal(result.jobs[0].employer, undefined);
  assert.equal(result.jobs[0].contactEmail, undefined);
  assert.equal(result.jobs[0].companyProfile.phone, undefined);
  assert.deepEqual(result.locations, ['Coimbatore', 'Chennai']);
  assert.deepEqual(result.companies.map(c => [c._id, c.openJobCount]), [['c2', 0], ['c1', 4]]);
  assert.ok(result.companies.every(c => !c.panNo && !c.uniqueViewers && !c.phone));
  assert.deepEqual(result.industries, [{ name: 'IT', slug: 'it' }]);
  const finds = calls.filter(c => c[0] === 'jobs' && c[1] === 'find');
  assert.equal(finds.length, 1);
  assert.equal(finds[0][2].status, 'Published');
  assert.equal(finds[0][2].applicationDeadline.$gte, now);
  assert.deepEqual(finds[0][2].jobApprovalStatus.$in, ['not_required', 'accepted', null]);
  assert.ok(calls.some(c => c[0] === 'jobs' && c[1] === 'limit' && c[2] === 12));
  assert.deepEqual(calls.find(c => c[0] === 'summary')[1][0].$match, finds[0][2]);
});

test('expired/unavailable curated jobs fall back to latest eligible jobs', async () => {
  const { models, calls } = fixture({ curated: ['expired-job'], fallback: [{ title: 'Live job' }] });
  const result = await loadPublicHome(models);
  assert.equal(result.jobs[0].title, 'Live job');
  const finds = calls.filter(c => c[0] === 'jobs' && c[1] === 'find');
  assert.equal(finds.length, 2);
  assert.deepEqual(finds[0][2]._id, { $in: ['expired-job'] });
  assert.equal(finds[1][2]._id, undefined);
  assert.deepEqual(finds[1][2].jobApprovalStatus, finds[0][2].jobApprovalStatus);
});

test('eligible curated jobs avoid an additional latest-jobs query', async () => {
  const { models, calls } = fixture({ curated: ['featured'], selected: [{ title: 'Featured job' }] });
  assert.equal((await loadPublicHome(models)).jobs[0].title, 'Featured job');
  assert.equal(calls.filter(c => c[0] === 'jobs' && c[1] === 'find').length, 1);
});
