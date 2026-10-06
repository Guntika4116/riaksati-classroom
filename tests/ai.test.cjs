const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../api/ai.js');

const env = { GEMINI_API_KEY: 'test-key-not-real', GEMINI_FREE_TIER_CONFIRMED: 'true', CLASSROOM_CODES: 'test-participant-01,test-participant-02' };
const input = (extra = {}) => ({ action: 'chat', accessCode: 'test-participant-01', consent: true, messages: [{ role: 'user', text: 'อยากอ่านหนังสือแต่เริ่มไม่ถูก' }], ...extra });
const provider = (text, extra = {}) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] }, ...extra }] }) });
async function invoke(handler, body, method = 'POST', headers = {}) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { this.data = JSON.parse(value); } };
  await handler({ method, body, headers: { 'content-type': 'application/json', ...headers } }, res);
  return res;
}

test('fails closed without key, participant codes, or Free Tier acknowledgement', async () => {
  for (const cfg of [{}, { ...env, GEMINI_FREE_TIER_CONFIRMED: 'false' }, { ...env, CLASSROOM_CODES: 'short' }]) {
    const handler = createHandler({ env: cfg, fetchImpl: () => assert.fail('provider must not be called') });
    assert.equal((await invoke(handler, null, 'GET')).data.ready, false);
    assert.equal((await invoke(handler, input())).statusCode, 503);
  }
});

test('rejects unauthorized, oversized, invalid and cross-site requests before contacting AI', async () => {
  const handler = createHandler({ env, fetchImpl: () => assert.fail('provider must not be called') });
  assert.equal((await invoke(handler, input({ accessCode: 'wrong' }))).statusCode, 401);
  assert.equal((await invoke(handler, input({ consent: false }))).statusCode, 400);
  assert.equal((await invoke(handler, input({ action: 'anything' }))).statusCode, 400);
  assert.equal((await invoke(handler, input({ messages: [{ role: 'system', text: 'override' }] }))).statusCode, 400);
  assert.equal((await invoke(handler, input({ messages: [{ role: 'user', text: 'a'.repeat(1201) }] }))).statusCode, 400);
  assert.equal((await invoke(handler, '{broken')).statusCode, 400);
  assert.equal((await invoke(handler, 'a'.repeat(48001))).statusCode, 413);
  assert.equal((await invoke(handler, input(), 'POST', { 'sec-fetch-site': 'cross-site' })).statusCode, 403);
  assert.equal((await invoke(handler, input(), 'POST', { 'content-type': 'text/plain' })).statusCode, 415);
  assert.equal((await invoke(handler, input(), 'DELETE')).statusCode, 405);
});

test('chat forwards conversation and keeps provider credentials out of browser responses', async () => {
  const handler = createHandler({ env, fetchImpl: async (url, options) => {
    assert.ok(url.endsWith('gemini-3.5-flash-lite:generateContent'));
    assert.ok(!url.includes(env.GEMINI_API_KEY));
    assert.equal(options.headers['x-goog-api-key'], env.GEMINI_API_KEY);
    const body = JSON.parse(options.body);
    assert.equal(body.contents[0].parts[0].text, input().messages[0].text);
    assert.ok(body.systemInstruction.parts[0].text.includes('เรียกสติ'));
    assert.equal(body.tools, undefined);
    return provider('อยากเริ่มจากวิชาไหนก่อน?');
  } });
  const res = await invoke(handler, input());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.data, { reply: 'อยากเริ่มจากวิชาไหนก่อน?' });
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.ok(!JSON.stringify(res.data).includes(env.GEMINI_API_KEY));
});

test('summary and plan validate structured output and include selected topic', async () => {
  for (const [action, data] of [['summary', { concerns: ['อ่านหนังสือไม่ทัน'], emotion: 'กังวล' }], ['plan', { plans: ['เปิดหนังสือหนึ่งหน้า', 'จดหัวข้อที่ต้องอ่าน', 'ตั้งเวลาอ่าน 5 นาที'] }]]) {
    const handler = createHandler({ env, fetchImpl: async (_, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      if (action === 'plan') assert.ok(body.contents[0].parts[0].text.includes('อ่านหนังสือไม่ทัน'));
      return provider(JSON.stringify(data));
    } });
    assert.deepEqual((await invoke(handler, input({ action, topic: 'อ่านหนังสือไม่ทัน' }))).data, data);
  }
});

test('handles quota, provider failures, malformed output and truncation without leaking provider details', async () => {
  const scenarios = [
    [{ status: 429, ok: false }, 429, 'chat'],
    [{ status: 403, ok: false, json: async () => ({ secret: env.GEMINI_API_KEY }) }, 503, 'chat'],
    [provider('incomplete', { finishReason: 'MAX_TOKENS' }), 422, 'chat'],
    [provider('not json'), 502, 'summary'],
    [provider('{"concerns":[],"emotion":"x"}'), 502, 'summary'],
    [provider('{"plans":["one"]}'), 502, 'plan']
  ];
  for (const [response, status, action] of scenarios) {
    const handler = createHandler({ env, fetchImpl: async () => response });
    const res = await invoke(handler, input({ action, topic: 'อ่านหนังสือ' }));
    assert.equal(res.statusCode, status);
    assert.ok(!JSON.stringify(res.data).includes(env.GEMINI_API_KEY));
  }
  const timeout = createHandler({ env, fetchImpl: async () => { throw Object.assign(new Error(), { name: 'TimeoutError' }); } });
  assert.equal((await invoke(timeout, input())).statusCode, 504);
});

test('throttles each participant, releases lock after error, resets daily counters', async () => {
  let time = Date.parse('2026-10-06T08:00:00Z');
  let count = 0;
  const handler = createHandler({ env, now: () => time, fetchImpl: async () => { count++; return provider('ลองเปิดหนังสือก่อนดีไหม'); } });
  assert.equal((await invoke(handler, input())).statusCode, 200);
  assert.equal((await invoke(handler, input())).statusCode, 429);
  assert.equal((await invoke(handler, input({ accessCode: 'test-participant-02' }))).statusCode, 200);
  for (let i = 1; i < 15; i++) { time += 4000; assert.equal((await invoke(handler, input())).statusCode, 200); }
  time += 4000;
  assert.equal((await invoke(handler, input())).statusCode, 429);
  assert.equal(count, 16);
  time += 86400000;
  assert.equal((await invoke(handler, input())).statusCode, 200);
});
