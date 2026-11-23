// Local read-only authorization checks. Tokens are generated in memory and never logged.
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { DB_URI, JWT_SECRET } from '../config/env.js';
import User from '../models/user.model.js';
import CandidateProfile from '../models/candidateProfile.model.js';
import CompanyProfile from '../models/companyProfile.model.js';
import Application from '../models/jobApply.model.js';

const frontend = 'http://localhost:3000';
const backend = 'http://localhost:5000';
const fetchLocal = (url, options = {}) => fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(30000) });
await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 8000 });
try {
  const profile = await CandidateProfile.findOne({ status: 'approved', allowInSearch: true }).select('_id').lean();
  const company = await CompanyProfile.findOne({ status: 'approved' }).select('_id').lean();
  const missing = '000000000000000000000000';
  for (const pathname of ['/candidates-single/'+missing, '/applicants-single/'+missing, '/employers-single/'+missing+'/applicants']) {
    const response = await fetchLocal(frontend+pathname);
    assert.equal(response.status, 307);
    assert.ok(response.headers.get('location')?.includes('/login?next='));
    console.log(`PASS guest ${pathname}: 307 login redirect`);
  }
  for (const pathname of ['/employers-single/invalid-id', '/employers-single/'+missing, '/employers-single/'+missing+'/jobs']) {
    assert.equal((await fetchLocal(frontend+pathname)).status, 404);
    console.log(`PASS missing public company ${pathname}: 404`);
  }
  if (company) {
    const response = await fetchLocal(`${frontend}/employers-single/${company._id}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /rel="canonical"/);
    assert.match(html, /<title>/);
    console.log('PASS real approved company: guest 200 with title/canonical');
  }
  for (const role of ['candidate', 'employer', 'hr-admin', 'superadmin']) {
    const query = { role, isActive: true };
    if (role === 'employer') query.parentEmployer = null;
    if (role === 'hr-admin') query.hrAdminAccessTabs = '/hr-admin-dashboard/candidate-profile';
    const user = await User.findOne(query).select('_id role').lean();
    if (!user) { console.log(`SKIP ${role}: no matching existing active fixture`); continue; }
    const token = jwt.sign({ userId: String(user._id) }, JWT_SECRET, { expiresIn: '5m' });
    const session = await fetchLocal(frontend+'/api/profile-session', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    assert.equal(session.status, 204);
    const sessionCookie = session.headers.get('set-cookie');
    assert.match(sessionCookie, /HttpOnly/i);
    assert.match(sessionCookie, /SameSite=Lax/i);
    const me = await (await fetchLocal(backend+'/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } })).json();
    const cookie = `${sessionCookie.split(';')[0]}; cj_auth=1; cj_role=${role}; cj_hr_tabs=${encodeURIComponent(JSON.stringify(me.user.hrAdminAccessTabs || []))}`;
    let candidate = profile;
    if (role === 'candidate') candidate = await CandidateProfile.findOne({ candidate: user._id }).select('_id').lean();
    if (candidate) {
      const api = await fetchLocal(`${backend}/api/v1/candidate-dashboard/profile/get/${candidate._id}`, { method: 'HEAD', headers: { Authorization: `Bearer ${token}` } });
      const page = await fetchLocal(`${frontend}/candidates-single/${candidate._id}`, { headers: { Cookie: cookie } });
      assert.equal(page.status, api.status === 403 ? 404 : api.status);
      if (page.ok) assert.match(await page.text(), /(?:name="robots" content="noindex|name="robots" content="noindex, nofollow)/);
      console.log(`PASS ${role} candidate profile: document ${page.status} respects authorized API (403 hidden as 404)`);
    }
    if (role === 'candidate') {
      const wrong = await fetchLocal(`${frontend}/applicants-single/${missing}`, { headers: { Cookie: cookie } });
      assert.equal(wrong.status, 404);
      assert.match(await wrong.text(), /The page you are looking for could not be found/);
      console.log('PASS candidate on employer applicant page: existing 404 page');
    }
    if (role === 'superadmin') {
      const absent = await fetchLocal(`${frontend}/candidates-single/${missing}`, { headers: { Cookie: cookie } });
      assert.equal(absent.status, 404);
      const application = await Application.findOne().select('_id').lean();
      if (application) {
        const api = await fetchLocal(`${backend}/api/v1/employer-dashboard/applicants/get/${application._id}`, { method: 'HEAD', headers: { Authorization: `Bearer ${token}` } });
        const page = await fetchLocal(`${frontend}/applicants-single/${application._id}`, { headers: { Cookie: cookie } });
        assert.equal(page.status, api.status);
        console.log(`PASS application detail uses application ID endpoint: ${page.status}`);
      }
    }
    const logout = await fetchLocal(frontend+'/api/profile-session', { method: 'DELETE' });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/i);
  }
  assert.equal((await fetchLocal(frontend+'/api/profile-session', { method: 'POST', headers: { Authorization: 'Bearer invalid' } })).status, 401);
  assert.equal((await fetchLocal(frontend+'/api/profile-session', { method: 'POST', headers: { Origin: 'https://untrusted.example', Authorization: 'Bearer invalid' } })).status, 403);
  console.log('PASS invalid token and cross-origin session creation are rejected');
} finally {
  await mongoose.disconnect();
}
