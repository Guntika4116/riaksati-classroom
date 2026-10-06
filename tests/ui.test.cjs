const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');

async function page(fetchImpl) {
  // No resources option: no external fonts, CDN scripts, or Google calls in tests.
  const dom = new JSDOM(html, { url: 'http://localhost:5173', runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = fetchImpl;
  w.AbortSignal = AbortSignal;
  w.confirm = () => true;
  w.eval(script);
  await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve));
  await new Promise(resolve => setImmediate(resolve));
  return dom;
}
const result = (data, ok = true) => Promise.resolve({ ok, json: async () => data });
const hidden = el => el.classList.contains('hidden');
function enter(w) {
  w.document.getElementById('classroomCode').value = 'test-participant-01';
  w.document.getElementById('trialConsent').checked = true;
  w.startClassroomChat();
}

test('initial page fails closed and modal never covers welcome', async () => {
  const dom = await page(() => result({ ready: false }));
  const d = dom.window.document;
  assert.equal(d.getElementById('btnStartChat').disabled, true);
  assert.equal(hidden(d.getElementById('screen-welcome')), false);
  assert.equal(hidden(d.getElementById('saveSheetModal')), true);
  assert.equal(d.getElementById('plansListContainer').children.length, 0);
  assert.equal(d.getElementById('btnProceedToPlan').disabled, true);
  dom.window.navigateTo('chat');
  assert.equal(hidden(d.getElementById('screen-chat')), true);
  dom.window.close();
});

test('conversation → summary → topic-specific plan → save → update → read notes → delete', async () => {
  const calls = [];
  const topic = 'สอบ <img src=x onerror=alert(1)> \'ภาษาไทย\'';
  const plan = 'เปิดหนังสือ <svg onload=alert(1)> 5 นาที';
  const dom = await page((url, options) => {
    assert.equal(url, '/api/ai');
    if (!options?.method) return result({ ready: true });
    const body = JSON.parse(options.body); calls.push(body);
    assert.equal(body.accessCode, 'test-participant-01');
    if (body.action === 'chat') return result({ reply: 'มีเวลาอ่านวันละกี่นาที?' });
    if (body.action === 'summary') return result({ concerns: [topic], emotion: 'กังวล <script>bad()</script>' });
    assert.equal(body.topic, topic);
    return result({ plans: [plan, 'จดหัวข้อที่ไม่เข้าใจ', 'ลองทำแบบฝึกหัดหนึ่งข้อ'] });
  });
  const w = dom.window, d = w.document;
  enter(w);
  await w.sendMessageTurn('อยากอ่านหนังสือ <img src=x onerror=alert(1)>');
  assert.equal(d.querySelector('#chatDynamicTurns img'), null);
  await w.summarizeChat();
  assert.equal(d.querySelectorAll('#issueCardContainer button').length, 1);
  assert.equal(hidden(d.getElementById('concern2Text').parentElement), true);
  d.querySelector('#issueCardContainer button').click();
  await w.proceedToPlanScreen();
  assert.equal(hidden(d.getElementById('screen-plan')), false);
  assert.equal(d.querySelectorAll('#planCardsList button').length, 3);
  assert.equal(d.querySelector('#planCardsList svg'), null);
  d.querySelector('#planCardsList button').click();
  w.openSaveSheetWithPlan();
  assert.equal(hidden(d.getElementById('saveSheetModal')), false);
  w.commitSaveAndFinish();
  w.dismissFinishModal();
  assert.equal(d.getElementById('plansListContainer').children.length, 1);
  assert.ok(d.getElementById('plansListContainer').textContent.includes(plan));
  assert.equal(d.querySelector('#plansListContainer img'), null);
  assert.equal(d.querySelector('#plansListContainer svg[onload]'), null);
  assert.equal(d.getElementById('chatDynamicTurns').children.length, 0);
  const updateButton = [...d.querySelectorAll('#plansListContainer button')].find(b => b.textContent.includes('อัปเดตแผน'));
  const id = updateButton.getAttribute('onclick').match(/'([^']+)'/)[1];
  w.goToUpdatePlan(id);
  w.setUpdateStatus('completed');
  d.getElementById('updateNoteInput').value = 'ทำแล้ว <img src=x>';
  w.savePlanUpdate();
  w.openReadSummaryModal(id);
  assert.ok(d.getElementById('readSummaryBody').textContent.includes('ทำแล้ว <img src=x>'));
  assert.equal(d.querySelector('#readSummaryBody img'), null);
  w.closeReadSummaryModal();
  w.promptDeleteItem(id);
  assert.ok(d.getElementById('deleteItemPromptText').textContent.includes(topic));
  w.executeConfirmedDelete();
  assert.equal(d.getElementById('plansListContainer').children.length, 0);
  assert.equal(hidden(d.getElementById('plansEmptyState')), false);
  assert.deepEqual(calls.map(c => c.action), ['chat', 'summary', 'plan']);
  w.close();
});

test('failed chat retains draft, retry has no duplicate history, and no-save clears conversation', async () => {
  let count = 0; const bodies = [];
  const dom = await page((_, options) => {
    if (!options?.method) return result({ ready: true });
    const body = JSON.parse(options.body); bodies.push(body);
    if (body.action === 'summary') return result({ concerns: ['อ่านหนังสือ'], emotion: 'กังวล' });
    count++;
    if (count === 1) return result({ error: 'โควตาเต็ม' }, false);
    return result({ reply: 'ลองเริ่มจากหนึ่งหน้าดีไหม' });
  });
  const w = dom.window, d = w.document; enter(w);
  await w.sendMessageTurn('อยากอ่านหนังสือ');
  assert.equal(d.getElementById('chatInputBox').value, 'อยากอ่านหนังสือ');
  assert.equal(d.getElementById('chatDynamicTurns').children.length, 0);
  assert.equal(hidden(d.getElementById('aiError')), false);
  w.retrySend();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bodies[1].messages.length, 1);
  assert.equal(d.getElementById('chatDynamicTurns').children.length, 2);
  assert.equal(d.getElementById('chatInputBox').value, '');
  await w.summarizeChat();
  w.skipToSaveBottomSheet(true);
  w.selectSaveChoice('no_save');
  w.commitSaveAndFinish(); w.dismissFinishModal();
  assert.equal(d.getElementById('plansListContainer').children.length, 0);
  assert.equal(d.getElementById('chatDynamicTurns').children.length, 0);
  w.startNewChat();
  await w.sendMessageTurn('เรื่องใหม่');
  assert.equal(bodies.at(-1).messages.length, 1);
  w.close();
});

test('summary edits change selected topic; deleting custom text disables save', async () => {
  let topic;
  const dom = await page((_, options) => {
    if (!options?.method) return result({ ready: true });
    const body = JSON.parse(options.body);
    if (body.action === 'chat') return result({ reply: 'เริ่มจากเรื่องไหนดี' });
    if (body.action === 'summary') return result({ concerns: ['สอบ'], emotion: '' });
    topic = body.topic; return result({ plans: ['เริ่ม 1', 'เริ่ม 2', 'เริ่ม 3'] });
  });
  const w = dom.window, d = w.document; enter(w);
  await w.sendMessageTurn('เตรียมสอบ'); await w.summarizeChat();
  w.toggleEditSummaryModal(); d.getElementById('editInputC1').value = 'สมัครฝึกงาน'; w.saveSummaryEdits();
  d.querySelector('#issueCardContainer button').click(); await w.proceedToPlanScreen();
  assert.equal(topic, 'สมัครฝึกงาน');
  w.handleCustomPlanInput('แผนของฉัน'); assert.equal(d.getElementById('btnConfirmPlan').disabled, false);
  w.handleCustomPlanInput(''); assert.equal(d.getElementById('btnConfirmPlan').disabled, true);
  w.openSaveSheetWithPlan(); assert.equal(hidden(d.getElementById('saveSheetModal')), true);
  w.close();
});
