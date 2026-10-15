import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRecipients, getAdminAlertRecipients } from '../utils/mailRecipients.js';

test('nested To and multiple CC recipients survive normalization', () => {
  assert.deepEqual(cleanRecipients([['A@example.com'], ['b@example.com', 'c@example.com'], 'a@example.com']),
    ['a@example.com', 'b@example.com', 'c@example.com']);
});
test('failed admin addresses excluded from To and CC; working admins retained', () => {
  assert.deepEqual(getAdminAlertRecipients(
    ['info@coimbatorejobs.com', 'hr@coimbatorejobs.in'],
    ['hr@coimbatorejobs.in', 'support@example.com'],
    'info@coimbatorejobs.com'
  ), { to: ['hr@coimbatorejobs.in'], cc: ['support@example.com'] });
});
test('blocked primary removed without affecting ordinary recipient normalization', () => {
  assert.deepEqual(getAdminAlertRecipients('info@coimbatorejobs.com', [], 'info@coimbatorejobs.com'), { to: [], cc: [] });
  assert.deepEqual(cleanRecipients('info@coimbatorejobs.com'), ['info@coimbatorejobs.com']);
});
test('unset exclusion preserves valid recipients and drops malformed addresses', () => {
  assert.deepEqual(getAdminAlertRecipients('admin@example.com', ['bad', '', 'support@example.com']),
    { to: ['admin@example.com'], cc: ['support@example.com'] });
});
