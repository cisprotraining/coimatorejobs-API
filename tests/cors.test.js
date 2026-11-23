import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import corsMiddleware from '../middleware/cors.js';
import { authenticate, authorize } from '../middleware/auth.js';

test('CORS and authentication work independently for browser and no-Origin requests', async (t) => {
  const app = express();
  let requestsHandled = 0;
  app.use(corsMiddleware);
  app.use((req, res, next) => { requestsHandled++; next(); });
  app.get('/public', (req, res) => res.json({ public: true }));
  app.get('/private', authenticate, authorize(['superadmin']), (req, res) => res.json({ private: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  for (const origin of ['http://localhost:3000', 'https://coimbatorejobs.in']) {
    const allowed = await fetch(`${baseUrl}/public`, { headers: { Origin: origin } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
    assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');

    const preflight = await fetch(`${baseUrl}/private`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/i);
  }

  for (const origin of ['https://untrusted.example', 'null', 'https://coimbatorejobs.in.attacker.example']) {
    for (const method of ['GET', 'POST', 'OPTIONS']) {
      const before = requestsHandled;
      const rejected = await fetch(`${baseUrl}/public`, { method, headers: { Origin: origin } });
      assert.equal(rejected.status, 403);
      assert.equal(rejected.headers.get('access-control-allow-origin'), null);
      assert.match(rejected.headers.get('vary'), /Origin/i);
      assert.deepEqual(await rejected.json(), { success: false, message: 'CORS not allowed from this origin' });
      assert.equal(requestsHandled, before, 'disallowed origins must not reach route handlers');
    }
  }

  const publicWithoutOrigin = await fetch(`${baseUrl}/public`);
  assert.equal(publicWithoutOrigin.status, 200);
  assert.equal(publicWithoutOrigin.headers.get('access-control-allow-origin'), null);
  assert.match(publicWithoutOrigin.headers.get('vary'), /Origin/i);

  for (const origin of [undefined, 'http://localhost:3000']) {
    for (const token of [undefined, 'Bearer invalid-token']) {
      const headers = {};
      if (origin) headers.Origin = origin;
      if (token) headers.Authorization = token;
      const privateResponse = await fetch(`${baseUrl}/private`, { headers });
      assert.equal(privateResponse.status, 401);
      assert.equal((await privateResponse.json()).private, undefined);
    }
  }
});
