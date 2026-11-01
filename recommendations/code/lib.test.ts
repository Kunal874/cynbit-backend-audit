// Run: node --test recommendations/code/lib.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyCashfreeSignature, safeJsonLd, fail, ok } from './lib.ts';

const secret = 'test_secret';
const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'order_123' } } });
const now = 1_793_556_000_000;
const ts = String(now);
const sign = (t: string, b: string) => createHmac('sha256', secret).update(t + b).digest('base64');

test('accepts a correctly signed, fresh webhook', () => {
  assert.equal(verifyCashfreeSignature(body, ts, sign(ts, body), secret, now), true);
});

test('rejects a tampered body', () => {
  const tampered = body.replace('order_123', 'order_999');
  assert.equal(verifyCashfreeSignature(tampered, ts, sign(ts, body), secret, now), false);
});

test('rejects a stale (replayed) timestamp', () => {
  const old = String(now - 10 * 60_000);
  assert.equal(verifyCashfreeSignature(body, old, sign(old, body), secret, now), false);
});

test('rejects garbage signature / timestamp without throwing', () => {
  assert.equal(verifyCashfreeSignature(body, ts, 'short', secret, now), false);
  assert.equal(verifyCashfreeSignature(body, 'not-a-number', sign(ts, body), secret, now), false);
});

test('safeJsonLd cannot close the script tag and still round-trips', () => {
  const data = { headline: 'Hi </script><script>alert(1)</script>' };
  const out = safeJsonLd(data);
  assert.equal(out.includes('</script>'), false);
  assert.deepEqual(JSON.parse(out), data);
});

test('ActionResult helpers produce discriminated results', () => {
  assert.deepEqual(ok({ id: 1 }), { ok: true, data: { id: 1 } });
  const r = fail('VALIDATION', 'Invalid input', { email: ['Invalid email'] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, 'VALIDATION');
});
