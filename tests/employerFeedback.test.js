import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedbackController, feedbackInput } from '../controller/employerFeedback.controller.js';

const owner = '600000000000000000000001';
const companyId = '600000000000000000000002';
const otherCompany = '600000000000000000000003';
const input = { companyProfile: companyId, rating: 5, message: 'The job posting and candidate search tools are easy to use.', publishConsent: true };
const chain = value => ({ select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => value });

test('admin listing fixes page size at 20, keeps filters combined and allowlists stable sorting', async () => {
  const rows = Array.from({ length: 45 }, (_, i) => ({ _id: i }));
  let captured;
  const Feedback = {
    find(filter) {
      captured = { filter };
      return { select() { return this; }, sort(sort) { captured.sort = sort; return this; },
        skip(skip) { captured.skip = skip; return this; }, limit(limit) { captured.limit = limit; return this; },
        async lean() { return rows.slice(captured.skip, captured.skip + captured.limit); } };
    },
    async countDocuments(filter) { assert.deepEqual(filter, captured.filter); return rows.length; },
  };
  const controller = createFeedbackController({ Feedback });
  async function list(query) {
    const res = { set() {}, json(body) { this.body = body; } };
    await controller.list({ query }, res, error => { throw error; });
    return res.body;
  }
  for (const [page, count] of [[1, 20], [2, 20], [3, 5]]) {
    const result = await list({ page, limit: 1000 });
    assert.equal(result.feedback.length, count);
    assert.deepEqual(result.pagination, { page, total: 45, totalPages: 3, limit: 20 });
  }
  await list({ rating: '5', status: 'hidden', search: 'A.*', sort: 'rating-low' });
  assert.equal(captured.filter.rating, 5);
  assert.deepEqual(captured.filter.$and, [{ rating: { $in: [4, 5] }, publishConsent: true }, { isVisible: false }]);
  assert.equal(captured.filter.$or[0].companyName.test('A.*'), true);
  assert.equal(captured.filter.$or[0].companyName.test('Anything'), false);
  assert.deepEqual(captured.sort, { rating: 1, createdAt: -1, _id: -1 });
  await list({ status: 'enabled', sort: 'oldest' });
  assert.equal(captured.filter.$and[1].isVisible, true);
  assert.deepEqual(captured.sort, { createdAt: 1, _id: 1 });
  await list({ status: 'private', sort: 'company-asc' });
  assert.deepEqual(captured.filter.$and[0].$or, [{ rating: { $in: [1, 2, 3] } }, { publishConsent: { $ne: true } }]);
  assert.deepEqual(captured.sort, { companyName: 1, _id: 1 });
  await list({ sort: '__proto__' });
  assert.deepEqual(captured.sort, { createdAt: -1, _id: -1 });
});

function fixture({ company = true, existing = null } = {}) {
  let row = existing;
  let publicPipeline;
  const Company = { collection: { name: 'companies' },
    find: () => chain(company ? [{ _id: companyId, companyName: 'Example Company' }] : []),
    findOne: filter => chain(company && filter._id === companyId && filter.employer === owner ? { _id: companyId, companyName: 'Example Company' } : null),
  };
  const Feedback = {
    findOne: filter => filter.employer ? chain(row) : Promise.resolve(row && !row.deletedAt ? row : null),
    exists: async filter => Boolean(row && (filter.deletedAt === null ? !row.deletedAt : true)),
    create: async value => {
      row = { ...value, _id: '600000000000000000000004', deletedAt: null, createdAt: new Date(), save: async () => {} };
      return row;
    },
    findOneAndUpdate: async (filter, update) => {
      if (!row || (filter.employer && filter.employer !== row.employer)) return null;
      if (filter.deletedAt?.$ne === null ? !row.deletedAt : row.deletedAt) return null;
      Object.assign(row, update.$set); return row;
    },
    aggregate: async pipeline => {
      publicPipeline = pipeline;
      const filter = pipeline[0].$match;
      if (!row || row.deletedAt || row.isVisible !== filter.isVisible || row.publishConsent !== filter.publishConsent || !filter.rating.$in.includes(row.rating)) return [];
      const projection = pipeline.at(-1).$project;
      const source = { ...row, companyName: 'Example Company', logo: '' };
      return [Object.fromEntries(Object.keys(projection).map(key => [key, source[key]]))];
    },
  };
  const handlers = createFeedbackController({ Feedback, Company, Users: { collection: { name: 'users' } } });
  async function call(name, options = {}) {
    const req = { user: { id: owner, employerOwnerId: owner, name: 'Example Recruiter' }, body: {}, params: { id: row?._id }, query: {}, ...options };
    const res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handlers[name](req, res, error => { res.statusCode = error.statusCode || 500; res.body = { message: error.message }; });
    return res;
  }
  return { call, get row() { return row; }, get pipeline() { return publicPipeline; } };
}

test('feedback validates rating, quote length, company and publication permission', () => {
  assert.equal(feedbackInput(input).rating, 5);
  assert.equal(feedbackInput({ ...input, message: 'a '.repeat(99) + 'ab' }).message.length, 200);
  assert.throws(() => feedbackInput({ ...input, message: 'a '.repeat(100) + 'b' }), error => error.statusCode === 400);
  assert.throws(() => feedbackInput({ ...input, message: ' '.repeat(10) + 'a'.repeat(191) }), error => error.statusCode === 400);
  for (const change of [{ rating: 0 }, { rating: 6 }, { rating: 4.5 }, { rating: '5' }, { message: 'Too short' }, { message: 'x'.repeat(501) }, { publishConsent: false }, { companyProfile: 'invalid' }, { designation: 'x'.repeat(81) }]) {
    assert.throws(() => feedbackInput({ ...input, ...change }), error => error.statusCode === 400);
  }
});

test('a company profile is required and another employer company cannot be used', async () => {
  const missing = fixture({ company: false });
  assert.equal((await missing.call('mine')).body.canSubmit, false);
  assert.equal((await missing.call('submit', { body: input })).statusCode, 403);
  assert.equal((await fixture().call('submit', { body: { ...input, companyProfile: otherCompany } })).statusCode, 403);
});

test('4 and 5 stars publish automatically; 1, 2 and 3 stay private', async () => {
  for (const rating of [1, 2, 3, 4, 5]) {
    const f = fixture();
    assert.equal((await f.call('submit', { body: { ...input, rating, employer: otherCompany, isVisible: false } })).statusCode, 201);
    assert.equal(f.row.employer, owner);
    assert.equal(f.row.isVisible, true, 'browser cannot set moderation flags');
    const publicResult = await f.call('testimonials');
    assert.equal(publicResult.body.testimonials.length, rating >= 4 ? 1 : 0);
    assert.equal(publicResult.headers['Cache-Control'], 'no-store');
    if (rating < 4) assert.equal((await f.call('visibility', { body: { isVisible: true } })).statusCode, 400);
    assert.equal((await f.call('submit', { body: input })).statusCode, 409);
  }
});

test('admin hide, re-enable and delete change public results and keep submission history', async () => {
  const f = fixture();
  await f.call('submit', { body: input });
  assert.equal((await f.call('testimonials')).body.testimonials.length, 1);
  await f.call('visibility', { body: { isVisible: false } });
  assert.equal((await f.call('testimonials')).body.testimonials.length, 0);
  await f.call('visibility', { body: { isVisible: true } });
  assert.equal((await f.call('testimonials')).body.testimonials.length, 1);
  assert.equal((await f.call('remove')).statusCode, 200);
  assert.equal((await f.call('testimonials')).body.testimonials.length, 0);
  const mine = (await f.call('mine')).body;
  assert.equal(mine.hasSubmitted, false);
  assert.equal(mine.hasEverSubmitted, true);
  assert.equal(mine.canSubmit, true);
  assert.equal(mine.feedback, null);
  assert.equal((await f.call('submit', { body: input })).statusCode, 201);
  assert.equal((await f.call('testimonials')).body.testimonials.length, 1);
  assert.equal(f.row.deletedAt, null);
  assert.equal(f.row.moderatedBy, null);
  assert.equal((await f.call('submit', { body: input })).statusCode, 409);
});

test('public testimonials expose only quote fields and exclude missing/inactive owners and companies before limiting', async () => {
  const f = fixture();
  await f.call('submit', { body: input });
  const publicResult = await f.call('testimonials');
  assert.deepEqual(Object.keys(publicResult.body.testimonials[0]).sort(), ['_id', 'authorName', 'companyName', 'designation', 'logo', 'message', 'rating']);
  assert.ok(f.pipeline.some(stage => stage.$match?.['owner.isActive'] === true));
  assert.ok(f.pipeline.some(stage => stage.$match?.['company.isActive']?.$ne === false));
  assert.equal(f.pipeline.find(stage => stage.$limit).$limit, 6);
  assert.equal((await f.call('visibility', { body: { isVisible: 'false' } })).statusCode, 400);
  assert.equal((await f.call('visibility', { params: { id: 'invalid' }, body: { isVisible: true } })).statusCode, 404);
});

test('employers edit only their own feedback and cannot undo admin moderation', async () => {
  const f = fixture();
  await f.call('submit', { body: input });
  await f.call('visibility', { body: { isVisible: false } });
  const changed = { ...input, rating: 4, message: 'The updated feedback describes a much better hiring experience.', isVisible: true, employer: otherCompany };
  const result = await f.call('updateMine', { body: changed });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.feedback.rating, 4);
  assert.equal(result.body.feedback.companyProfile, companyId);
  assert.equal(result.body.feedback.message, changed.message);
  assert.equal(f.row.isVisible, false);
  assert.equal(f.row.employer, owner);
  assert.equal((await f.call('updateMine', { body: { ...input, companyProfile: otherCompany } })).statusCode, 403);
  // A different authenticated owner cannot modify or remove this owner's submission.
  const foreign = fixture({ existing: { ...f.row, employer: otherCompany } });
  assert.equal((await foreign.call('updateMine', { body: input })).statusCode, 404);
  assert.equal((await foreign.call('removeMine')).statusCode, 404);
  await f.call('visibility', { body: { isVisible: true } });
  await f.call('updateMine', { body: { ...input, rating: 2 } });
  assert.equal((await f.call('testimonials')).body.testimonials.length, 0);
  assert.equal((await f.call('removeMine')).statusCode, 200);
  const mine = (await f.call('mine')).body;
  assert.equal(mine.hasSubmitted, false);
  assert.equal(mine.hasEverSubmitted, true);
  assert.equal(mine.feedback, null);
  assert.equal(mine.canSubmit, true);
  assert.equal((await f.call('updateMine', { body: input })).statusCode, 404);
  assert.equal((await f.call('removeMine')).statusCode, 404);
  assert.equal((await f.call('testimonials')).body.testimonials.length, 0);
  assert.equal((await f.call('submit', { body: input })).statusCode, 201);
  assert.equal(f.row.deletedByEmployer, false);
  assert.equal((await f.call('testimonials')).body.testimonials.length, 1);
});
