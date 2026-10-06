// Classroom trial: conversations stay in page memory; Gemini calls go through /api/ai.
    const state = {
      currentScreen: 'welcome',
      previousScreen: null,
      activeTab: 'chat',
      hasUnsavedChat: false,
      chatSimulationTurn: 0,
      selectedIssueId: null,
      selectedIssueTitle: '',
      selectedPlanId: null,
      selectedPlanText: '',
      selectedTiming: 'ยังไม่กำหนด',
      saveChoice: 'save_all', // 'save_all' | 'no_save'
      reminderEnabled: false,
      summaryData: { concern1: '', concern2: '', concern3: '', emotion: '' },
      savedRecords: [],
      messages: [],
      busy: false,
      accessCode: '',
      consent: false,
      ready: false,
      lastFailed: null,
      planCache: new Map(),
      pendingDeleteId: null,
      updateTargetId: null,
      tempUpdateStatus: 'not_started'
    };

    // Navigation and screen management
    function navigateTo(screenId) {
      if (state.busy) return;
      if (screenId === 'chat' && !state.consent) screenId = 'welcome';
      state.previousScreen = state.currentScreen;
      state.currentScreen = screenId;

      document.querySelectorAll('.screen-view').forEach(el => el.classList.add('hidden'));
      const target = document.getElementById(`screen-${screenId}`);
      if (target) {
        target.classList.remove('hidden');
        target.classList.add('fade-in');
      }

      // Update Header appearance
      const backBtn = document.getElementById('btnHeaderBack');
      const headerTitle = document.getElementById('headerMainTitle');
      const headerSubtitle = document.getElementById('headerSubtitle');
      const headerTitleArea = document.getElementById('headerTitleArea');

      if (screenId === 'welcome') {
        backBtn.classList.add('hidden');
        headerTitle.textContent = 'เรียกสติ';
        headerSubtitle.textContent = 'AI ช่วยจัดความคิด';
        setBottomNavActive('chat');
      } else if (screenId === 'chat') {
        backBtn.classList.remove('hidden');
        headerTitle.textContent = 'คุยกับเรียกสติ';
        headerSubtitle.textContent = 'ทดลองด้วยเรื่องสมมติ • Gemini';
        setBottomNavActive('chat');
      } else if (screenId === 'summary') {
        backBtn.classList.remove('hidden');
        headerTitle.textContent = 'สรุปความคิด';
        headerSubtitle.textContent = 'ขั้นตอนที่ 1 จาก 2';
        setBottomNavActive('chat');
      } else if (screenId === 'plan') {
        backBtn.classList.remove('hidden');
        headerTitle.textContent = 'เลือกก้าวเล็ก ๆ';
        headerSubtitle.textContent = 'ขั้นตอนที่ 2 จาก 2';
        setBottomNavActive('chat');
      } else if (screenId === 'myplans') {
        backBtn.classList.add('hidden');
        headerTitle.textContent = 'แผนของฉัน';
        headerSubtitle.textContent = 'รายการที่คุณเลือกเก็บไว้';
        setBottomNavActive('myplans');
        renderMyPlans();
      } else if (screenId === 'update') {
        backBtn.classList.remove('hidden');
        headerTitle.textContent = 'อัปเดตแผน';
        headerSubtitle.textContent = 'เช็กความคืบหน้าอย่างเป็นมิตร';
        setBottomNavActive('myplans');
        prepareUpdateScreen();
      }

      // Scroll viewport to top
      const screenContainer = document.getElementById('screenContainer');
      if (screenContainer) screenContainer.scrollTop = 0;
    }

    function goBack() {
      if (state.currentScreen === 'chat') {
        navigateTo('welcome');
      } else if (state.currentScreen === 'summary') {
        navigateTo('chat');
      } else if (state.currentScreen === 'plan') {
        navigateTo('summary');
      } else if (state.currentScreen === 'update') {
        navigateTo('myplans');
      } else {
        navigateTo('welcome');
      }
    }

    function switchTab(tab) {
      state.activeTab = tab;
      if (tab === 'chat') {
        if (state.chatSimulationTurn > 0) {
          navigateTo('chat');
        } else {
          navigateTo('welcome');
        }
      } else if (tab === 'myplans') {
        navigateTo('myplans');
      }
    }

    function setBottomNavActive(tab) {
      const chatBtn = document.getElementById('navTabChat');
      const plansBtn = document.getElementById('navTabPlans');
      if (tab === 'chat') {
        chatBtn.className = "btn-press flex-1 min-h-[48px] flex flex-col items-center justify-center space-y-1 text-brand-600 transition";
        plansBtn.className = "btn-press flex-1 min-h-[48px] flex flex-col items-center justify-center space-y-1 text-slateDark-400 hover:text-slateDark-700 transition relative";
      } else {
        plansBtn.className = "btn-press flex-1 min-h-[48px] flex flex-col items-center justify-center space-y-1 text-brand-600 transition relative";
        chatBtn.className = "btn-press flex-1 min-h-[48px] flex flex-col items-center justify-center space-y-1 text-slateDark-400 hover:text-slateDark-700 transition";
      }
    }

    function escapeHTML(value) {
      return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    }

    async function checkConnection() {
      const status = document.getElementById('connectionStatus');
      try {
        const response = await fetch('/api/ai', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error();
        state.ready = (await response.json()).ready === true;
        status.textContent = state.ready ? 'ห้องทดลองพร้อมแล้ว ใส่รหัสที่ได้รับเพื่อเริ่มคุย' : 'ห้องทดลองยังไม่เปิด ผู้จัดกำลังตั้งค่าการเชื่อมต่อ AI';
      } catch {
        state.ready = false;
        status.textContent = 'ยังเชื่อมต่อห้องทดลองไม่ได้ ลองตรวจสอบการเชื่อมต่ออีกครั้ง';
      }
      document.getElementById('btnStartChat').disabled = !state.ready;
    }

    function startClassroomChat() {
      const code = document.getElementById('classroomCode').value.trim();
      const consent = document.getElementById('trialConsent').checked;
      const status = document.getElementById('connectionStatus');
      if (!state.ready) return;
      if (!code || !consent) {
        status.textContent = 'กรุณาใส่รหัสผู้ทดลองและรับทราบเงื่อนไขก่อนเริ่ม';
        return;
      }
      state.accessCode = code;
      state.consent = true;
      navigateTo('chat');
    }

    function setBusy(busy) {
      state.busy = busy;
      document.getElementById('aiTypingIndicator').classList.toggle('hidden', !busy);
      document.getElementById('chatInputBox').disabled = busy;
      document.getElementById('btnChatSend').disabled = busy || state.messages.length >= 16;
      document.getElementById('btnSummarize').disabled = busy;
      document.getElementById('btnProceedToPlan').disabled = busy || !state.selectedIssueId;
      document.getElementById('btnHeaderBack').disabled = busy;
      document.getElementById('btnNewChat').disabled = busy;
      document.getElementById('aiProgress').classList.toggle('hidden', !busy);
      document.getElementById('chatInputHint').textContent = busy ? 'กำลังรอ AI…' : `${Math.ceil(state.messages.length / 2)}/8 ข้อความ • ใช้เรื่องสมมติเท่านั้น`;
    }

    async function callAI(action, extra = {}) {
      const response = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, messages: state.messages, accessCode: state.accessCode, consent: state.consent, ...extra }),
        signal: AbortSignal.timeout(30000)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'ยังเชื่อมต่อ AI ไม่ได้');
      return data;
    }

    function showAIError(error, retry) {
      state.lastFailed = retry;
      const banner = document.getElementById('aiError');
      document.getElementById('aiErrorText').textContent = ['TimeoutError', 'AbortError'].includes(error.name) ? 'AI ตอบช้าเกินไป กรุณาลองอีกครั้ง' : error.message;
      banner.classList.remove('hidden');
      document.getElementById('btnRetryAI').classList.toggle('hidden', !retry);
    }
    function clearAIError() {
      document.getElementById('aiError').classList.add('hidden');
      state.lastFailed = null;
    }
    function retrySend() {
      if (state.busy) return;
      const retry = state.lastFailed;
      if (retry?.action === 'chat') sendMessageTurn(retry.text);
      else if (retry?.action === 'summary') summarizeChat();
      else if (retry?.action === 'plan') proceedToPlanScreen();
    }
    function appendBubble(text, role) {
      const row = document.createElement('div');
      row.className = `flex fade-in ${role === 'user' ? 'justify-end' : 'justify-start'}`;
      const bubble = document.createElement('div');
      bubble.className = `rounded-2xl p-4 max-w-[90%] text-sm leading-relaxed whitespace-pre-wrap break-words ${role === 'user' ? 'bg-brand-600 text-white' : 'bg-white border border-canvas-border text-slateDark-900'}`;
      bubble.textContent = text;
      row.appendChild(bubble);
      document.getElementById('chatDynamicTurns').appendChild(row);
      return row;
    }
    function handleChatSubmit(event) {
      event.preventDefault();
      sendMessageTurn(document.getElementById('chatInputBox').value.trim());
    }
    function triggerQuickChat(text) {
      document.getElementById('chatInputBox').value = text;
      sendMessageTurn(text);
    }
    async function sendMessageTurn(text) {
      if (state.busy || !text || !state.consent) return;
      if (text.length > 1200) return showAIError(new Error('พิมพ์ได้ไม่เกิน 1,200 ตัวอักษรต่อข้อความ'));
      if (state.messages.length >= 16) return showAIError(new Error('ครบ 8 ข้อความแล้ว ช่วยสรุปหรือเริ่มการคุยรอบใหม่ได้เลย'));
      clearAIError();
      state.messages.push({ role: 'user', text });
      const row = appendBubble(text, 'user');
      setBusy(true);
      scrollChatBottom();
      try {
        const result = await callAI('chat');
        state.messages.push({ role: 'model', text: result.reply });
        appendBubble(result.reply, 'model');
        state.chatSimulationTurn = state.messages.length / 2;
        document.getElementById('chatInputBox').value = '';
        toggleClearInputBtn(false);
        document.getElementById('chatQuickStarters').classList.add('hidden');
        document.getElementById('chatSummarizePrompt').classList.remove('hidden');
        state.summaryData = { concern1: '', concern2: '', concern3: '', emotion: '' };
        state.planCache.clear();
      } catch (error) {
        state.messages.pop();
        row.remove();
        document.getElementById('chatInputBox').value = text;
        showAIError(error, { action: 'chat', text });
      } finally { setBusy(false); scrollChatBottom(); }
    }
    async function summarizeChat() {
      if (state.busy || !state.messages.length) return;
      clearAIError(); setBusy(true);
      try {
        const result = await callAI('summary');
        state.summaryData = { concern1: result.concerns[0] || '', concern2: result.concerns[1] || '', concern3: result.concerns[2] || '', emotion: result.emotion };
        state.selectedIssueId = null;
        state.selectedIssueTitle = '';
        state.planCache.clear();
        renderSummary();
        setBusy(false);
        navigateTo('summary');
      } catch (error) { showAIError(error, { action: 'summary' }); }
      finally { setBusy(false); }
    }
    function renderSummary() {
      const container = document.getElementById('issueCardContainer');
      container.replaceChildren();
      ['concern1', 'concern2', 'concern3'].forEach((key, index) => {
        const value = state.summaryData[key];
        const text = document.getElementById(`concern${index + 1}Text`);
        text.textContent = value;
        text.parentElement.classList.toggle('hidden', !value);
        if (!value) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'issue-card btn-press w-full text-left p-4 rounded-2xl bg-white border-2 border-canvas-border text-sm';
        button.textContent = value;
        button.setAttribute('aria-pressed', String(state.selectedIssueId === key));
        button.onclick = () => selectIssue(key, button);
        if (state.selectedIssueId === key) button.classList.add('border-brand-600', 'bg-brand-50/40');
        container.appendChild(button);
      });
      document.getElementById('emotionTextDisplay').textContent = state.summaryData.emotion || 'ยังไม่ได้ระบุความรู้สึก';
      document.getElementById('btnProceedToPlan').disabled = !state.selectedIssueId;
    }
    function chatTellMore() { document.getElementById('chatInputBox').focus(); }
    function scrollChatBottom() {
      const list = document.getElementById('chatMessageList');
      if (list) list.scrollTop = list.scrollHeight;
    }
    function clearInput() {
      if (state.busy) return;
      const input = document.getElementById('chatInputBox');
      input.value = ''; toggleClearInputBtn(false); input.focus();
    }
    function toggleClearInputBtn(show) { document.getElementById('btnClearInput').classList.toggle('hidden', !show); }
    document.getElementById('chatInputBox').addEventListener('input', function () { toggleClearInputBtn(this.value.length > 0); });

    // ================= SUMMARY & ISSUE SELECTION =================
    function selectIssue(issueKey) {
      state.selectedIssueId = issueKey;
      state.selectedIssueTitle = state.summaryData[issueKey];
      state.selectedPlanId = null;
      state.selectedPlanText = '';
      renderSummary();
    }

    async function proceedToPlanScreen() {
      if (!state.selectedIssueId || state.busy) return;
      clearAIError();
      const topic = state.selectedIssueTitle;
      let plans = state.planCache.get(topic);
      if (!plans) {
        setBusy(true);
        try {
          plans = (await callAI('plan', { topic })).plans;
          state.planCache.set(topic, plans);
        } catch (error) { showAIError(error, { action: 'plan' }); return; }
        finally { setBusy(false); }
      }
      document.getElementById('planTargetLabel').textContent = `เรื่อง: ${topic}`;
      document.getElementById('customPlanInput').value = '';
      state.selectedPlanId = null;
      state.selectedPlanText = '';
      document.getElementById('btnConfirmPlan').disabled = true;
      const container = document.getElementById('planCardsList');
      container.replaceChildren();
      plans.forEach((plan, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'plan-card btn-press w-full text-left p-4 rounded-2xl bg-white border-2 border-canvas-border text-sm';
        button.textContent = plan;
        button.onclick = () => selectPlan(index + 1, plan, button);
        container.appendChild(button);
      });
      navigateTo('plan');
    }

    // ================= EDIT SUMMARY MODAL LOGIC =================
    function toggleEditSummaryModal() {
      document.getElementById('editInputC1').value = state.summaryData.concern1;
      document.getElementById('editInputC2').value = state.summaryData.concern2;
      document.getElementById('editInputC3').value = state.summaryData.concern3;
      document.getElementById('editInputEmo').value = state.summaryData.emotion;
      document.getElementById('editSummaryModal').classList.remove('hidden');
    }

    function closeEditSummaryModal() {
      document.getElementById('editSummaryModal').classList.add('hidden');
    }

    function saveSummaryEdits() {
      state.summaryData.concern1 = document.getElementById('editInputC1').value.trim().slice(0, 500);
      state.summaryData.concern2 = document.getElementById('editInputC2').value.trim().slice(0, 500);
      state.summaryData.concern3 = document.getElementById('editInputC3').value.trim().slice(0, 500);
      state.summaryData.emotion = document.getElementById('editInputEmo').value.trim().slice(0, 500);

      document.getElementById('concern1Text').textContent = state.summaryData.concern1;
      document.getElementById('concern2Text').textContent = state.summaryData.concern2;
      document.getElementById('concern3Text').textContent = state.summaryData.concern3;
      document.getElementById('emotionTextDisplay').textContent = `“${state.summaryData.emotion}”`;

      state.selectedIssueId = null;
      state.selectedIssueTitle = '';
      state.planCache.clear();
      renderSummary();
      closeEditSummaryModal();
    }

    // ================= MICRO PLAN SELECTION =================
    function selectPlan(planId, planText, el) {
      state.selectedPlanId = planId;
      state.selectedPlanText = planText;
      document.getElementById('customPlanInput').value = '';

      document.querySelectorAll('#planCardsList .plan-card').forEach(card => {
        card.classList.remove('border-brand-600', 'bg-brand-50/50');
        card.classList.add('border-canvas-border');
        const dot = card.querySelector('.check-dot');
        const ind = card.querySelector('.radio-indicator');
        if (dot) dot.classList.add('hidden');
        if (ind) {
          ind.classList.remove('border-brand-600');
          ind.classList.add('border-slateDark-300');
        }
      });

      if (el) {
        el.classList.remove('border-canvas-border');
        el.classList.add('border-brand-600', 'bg-brand-50/50');
        const dot = el.querySelector('.check-dot');
        const ind = el.querySelector('.radio-indicator');
        if (dot) dot.classList.remove('hidden');
        if (ind) {
          ind.classList.add('border-brand-600');
          ind.classList.remove('border-slateDark-300');
        }
      }

      document.getElementById('btnConfirmPlan').disabled = false;
    }

    function handleCustomPlanInput(val) {
      if (!val.trim()) { state.selectedPlanId = null; state.selectedPlanText = ''; document.getElementById('btnConfirmPlan').disabled = true; return; }
      if (val.trim()) {
        state.selectedPlanId = 'custom';
        state.selectedPlanText = val.trim();
        // Clear card selections
        document.querySelectorAll('#planCardsList .plan-card').forEach(card => {
          card.classList.remove('border-brand-600', 'bg-brand-50/50');
          card.classList.add('border-canvas-border');
          const dot = card.querySelector('.check-dot');
          const ind = card.querySelector('.radio-indicator');
          if (dot) dot.classList.add('hidden');
          if (ind) {
            ind.classList.remove('border-brand-600');
            ind.classList.add('border-slateDark-300');
          }
        });
        document.getElementById('btnConfirmPlan').disabled = false;
      }
    }

    function focusCustomPlan() {
      const input = document.getElementById('customPlanInput');
      input.focus();
    }

    function selectPlanTiming(timingStr, el) {
      state.selectedTiming = timingStr;
      document.querySelectorAll('.timing-btn').forEach(btn => {
        btn.className = "timing-btn btn-press min-h-[44px] text-xs font-medium py-2.5 rounded-xl border border-canvas-border bg-white text-slateDark-700 hover:border-brand-300 transition";
      });
      el.className = "timing-btn btn-press min-h-[44px] text-xs font-medium py-2.5 rounded-xl border-2 border-brand-600 bg-brand-50 text-brand-700 transition font-bold";
    }

    // ================= SAVE & REMINDER BOTTOM SHEET =================
    let isSummaryOnlySave = false;

    function openSaveSheetWithPlan() {
      if (!state.selectedPlanText) return;
      isSummaryOnlySave = false;
      document.getElementById('labelOptionSaveAll').textContent = "บันทึกเฉพาะสรุปและแผน";
      document.getElementById('reminderSection').classList.remove('hidden');
      document.getElementById('saveOptionDescription').textContent = isSummaryOnlySave ? 'เก็บเฉพาะสรุปไว้ในหน้านี้จนกว่าจะรีเฟรช' : 'เก็บสรุปและแผนไว้ในหน้านี้จนกว่าจะรีเฟรช';
      setupSaveSheetUI();
    }

    function skipToSaveBottomSheet(fromSummaryScreen) {
      isSummaryOnlySave = true;
      document.getElementById('labelOptionSaveAll').textContent = "บันทึกเฉพาะสรุป";
      // As per specification: when not creating a plan, do not show reminder toggle
      document.getElementById('reminderSection').classList.add('hidden');
      document.getElementById('saveOptionDescription').textContent = isSummaryOnlySave ? 'เก็บเฉพาะสรุปไว้ในหน้านี้จนกว่าจะรีเฟรช' : 'เก็บสรุปและแผนไว้ในหน้านี้จนกว่าจะรีเฟรช';
      setupSaveSheetUI();
    }

    function setupSaveSheetUI() {
      selectSaveChoice('save_all');
      document.getElementById('reminderToggle').checked = false;
      state.reminderEnabled = false;
      document.getElementById('saveSheetModal').classList.remove('hidden');
    }

    function closeSaveSheet() {
      document.getElementById('saveSheetModal').classList.add('hidden');
    }

    function selectSaveChoice(choice) {
      state.saveChoice = choice;
      const optAll = document.getElementById('optSaveChoice_all');
      const optNone = document.getElementById('optSaveChoice_none');
      const reminderSec = document.getElementById('reminderSection');
      const completeBtn = document.getElementById('btnCompleteSession');

      if (choice === 'save_all') {
        optAll.className = "btn-press p-3.5 rounded-2xl border-2 border-brand-600 bg-brand-50/60 cursor-pointer flex items-start space-x-3 transition";
        optAll.querySelector('.check-dot')?.classList.remove('hidden');
        optAll.querySelector('.radio-indicator')?.classList.add('border-brand-600');
        optAll.querySelector('.radio-indicator')?.classList.remove('border-slateDark-300');

        optNone.className = "btn-press p-3.5 rounded-2xl border-2 border-canvas-border bg-white cursor-pointer flex items-start space-x-3 transition";
        optNone.querySelector('.check-dot')?.classList.add('hidden');
        optNone.querySelector('.radio-indicator')?.classList.remove('border-brand-600');
        optNone.querySelector('.radio-indicator')?.classList.add('border-slateDark-300');

        if (!isSummaryOnlySave) reminderSec.classList.remove('hidden');
        completeBtn.textContent = "บันทึกและจบการคุย";
        completeBtn.className = "btn-press w-full min-h-[48px] py-3.5 px-6 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm shadow-sm transition";
      } else {
        // Do not save choice
        optNone.className = "btn-press p-3.5 rounded-2xl border-2 border-brand-600 bg-brand-50/60 cursor-pointer flex items-start space-x-3 transition";
        optNone.querySelector('.check-dot')?.classList.remove('hidden');
        optNone.querySelector('.radio-indicator')?.classList.add('border-brand-600');
        optNone.querySelector('.radio-indicator')?.classList.remove('border-slateDark-300');

        optAll.className = "btn-press p-3.5 rounded-2xl border-2 border-canvas-border bg-white cursor-pointer flex items-start space-x-3 transition";
        optAll.querySelector('.check-dot')?.classList.add('hidden');
        optAll.querySelector('.radio-indicator')?.classList.remove('border-brand-600');
        optAll.querySelector('.radio-indicator')?.classList.add('border-slateDark-300');

        reminderSec.classList.add('hidden');
        completeBtn.textContent = "จบโดยไม่บันทึก";
        completeBtn.className = "btn-press w-full min-h-[48px] py-3.5 px-6 rounded-2xl bg-slateDark-700 hover:bg-slateDark-800 text-white font-medium text-sm shadow-sm transition";
      }
    }

    function handleReminderToggle(checked) {
      state.reminderEnabled = checked;
    }

    function commitSaveAndFinish() {
      if (document.getElementById('saveSheetModal').classList.contains('hidden')) return;
      closeSaveSheet();

      if (state.saveChoice === 'save_all') {
        const newRecord = {
          id: 'rec-' + crypto.randomUUID(),
          type: isSummaryOnlySave ? 'summary_only' : 'plan',
          topic: state.selectedIssueTitle || state.summaryData.concern1 || 'สรุปความคิด',
          planText: isSummaryOnlySave ? '' : state.selectedPlanText,
          date: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' }),
          status: 'not_started',
          timing: state.selectedTiming || 'ยังไม่กำหนด',
          reminder: false,
          summaryContext: {
            concerns: [state.summaryData.concern1, state.summaryData.concern2, state.summaryData.concern3].filter(Boolean),
            emotion: state.summaryData.emotion
          },
          reflections: []
        };
        state.savedRecords.unshift(newRecord);
      }

      resetConversation();
      // Show neutral conclusion modal
      document.getElementById('finishModal').classList.remove('hidden');
    }

    function resetConversation() {
      state.messages = [];
      state.chatSimulationTurn = 0;
      state.selectedIssueId = null;
      state.selectedIssueTitle = '';
      state.selectedPlanId = null;
      state.selectedPlanText = '';
      state.selectedTiming = 'ยังไม่กำหนด';
      state.summaryData = { concern1: '', concern2: '', concern3: '', emotion: '' };
      state.planCache.clear();
      document.getElementById('chatDynamicTurns').replaceChildren();
      document.getElementById('chatInputBox').value = '';
      document.getElementById('customPlanInput').value = '';
      document.getElementById('chatQuickStarters').classList.remove('hidden');
      document.getElementById('chatSummarizePrompt').classList.add('hidden');
      document.getElementById('btnConfirmPlan').disabled = true;
      document.getElementById('planCardsList').replaceChildren();
      document.getElementById('planTargetLabel').textContent = '';
      selectPlanTiming('ยังไม่กำหนด', document.querySelectorAll('.timing-btn')[2]);
      clearAIError(); renderSummary(); setBusy(false);
    }
    function startNewChat() {
      if (state.busy) return;
      if (state.messages.length && !window.confirm('เริ่มคุยใหม่และล้างบทสนทนารอบนี้? รายการที่บันทึกแล้วจะยังอยู่')) return;
      resetConversation();
      navigateTo('chat');
    }
    function dismissFinishModal() {
      document.getElementById('finishModal').classList.add('hidden');
      navigateTo('myplans');
    }

    // ================= MY PLANS TAB RENDERING =================
    function renderMyPlans() {
      const container = document.getElementById('plansListContainer');
      const emptyState = document.getElementById('plansEmptyState');
      const badge = document.getElementById('badgeActiveCount');
      const navDot = document.getElementById('navPlanBadge');

      container.innerHTML = '';
      badge.textContent = `${state.savedRecords.length} รายการ`;

      if (state.savedRecords.length === 0) {
        emptyState.classList.remove('hidden');
        if (navDot) navDot.classList.add('hidden');
        return;
      }

      emptyState.classList.add('hidden');
      if (navDot) navDot.classList.remove('hidden');

      state.savedRecords.forEach(item => {
        const card = document.createElement('div');
        card.className = "bg-white rounded-2xl p-4 border border-canvas-border shadow-xs space-y-3 relative fade-in";

        if (item.type === 'plan') {
          let statusBadge = '';
          if (item.status === 'not_started') {
            statusBadge = `<span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-peach-100 text-peach-500">ยังไม่ได้ทำ</span>`;
          } else if (item.status === 'in_progress') {
            statusBadge = `<span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">กำลังทำ</span>`;
          } else if (item.status === 'completed') {
            statusBadge = `<span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">ทำแล้ว ✓</span>`;
          }

          card.innerHTML = `
            <div class="flex items-start justify-between">
              <div>
                <span class="text-xs font-bold text-brand-700 tracking-wide">${escapeHTML(item.topic)}</span>
                <div class="text-[11px] text-slateDark-400 mt-0.5">บันทึกเมื่อ: ${escapeHTML(item.date)} • เริ่ม: ${escapeHTML(item.timing)}</div>
              </div>
              <div class="flex items-center space-x-1.5">
                ${statusBadge}
                <button onclick="promptDeleteItem('${item.id}')" class="w-8 h-8 rounded-full flex items-center justify-center text-slateDark-400 hover:text-rose-600 transition" title="ลบรายการ">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>

            <div class="p-3 bg-canvas-base rounded-xl border border-canvas-border/80">
              <span class="text-[11px] text-slateDark-600 block font-medium">แผนก้าวเล็ก ๆ:</span>
              <p class="text-sm font-semibold text-slateDark-900 mt-0.5 leading-snug">${escapeHTML(item.planText)}</p>
            </div>

            <!-- View Related Summary Snippet -->
            <button onclick="openReadSummaryModal('${item.id}')" class="text-xs text-brand-600 hover:underline flex items-center space-x-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>แตะเพื่ออ่านสรุปที่เกี่ยวข้อง</span>
            </button>

            <!-- Update Action Button -->
            <div class="pt-1 flex items-center space-x-2">
              <button onclick="goToUpdatePlan('${item.id}')" class="btn-press flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-xs flex items-center justify-center space-x-1.5 transition">
                <span>อัปเดตแผน</span>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
          `;
        } else {
          // Summary Only card type (as specified: no task status shown)
          card.innerHTML = `
            <div class="flex items-start justify-between">
              <div>
                <span class="text-xs font-bold text-slateDark-600 tracking-wide">สรุปที่เก็บไว้</span>
                <div class="text-[11px] text-slateDark-400 mt-0.5">บันทึกเมื่อ: ${escapeHTML(item.date)}</div>
              </div>
              <div class="flex items-center space-x-1">
                <span class="text-[11px] font-medium px-2 py-0.5 rounded-md bg-canvas-subtle text-slateDark-600">เฉพาะสรุป</span>
                <button onclick="promptDeleteItem('${item.id}', 'สรุปที่เก็บไว้')" class="w-8 h-8 rounded-full flex items-center justify-center text-slateDark-400 hover:text-rose-600 transition" title="ลบรายการ">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>

            <div class="p-3 bg-canvas-base rounded-xl border border-canvas-border/80 space-y-1">
              <span class="text-[11px] text-brand-700 font-semibold block">เรื่องที่คุณกังวล:</span>
              <p class="text-xs text-slateDark-800">• ${item.summaryContext.concerns.map(escapeHTML).join('<br>• ')}</p>
            </div>

            <button onclick="openReadSummaryModal('${item.id}')" class="btn-press w-full min-h-[40px] py-2 px-3 rounded-xl bg-canvas-subtle hover:bg-canvas-border text-slateDark-800 text-xs font-medium text-center transition">
              เปิดอ่านรายละเอียดสรุป
            </button>
          `;
        }

        container.appendChild(card);
      });
    }

    // ================= UPDATE PLAN SCREEN LOGIC =================
    function goToUpdatePlan(recordId) {
      state.updateTargetId = recordId;
      navigateTo('update');
    }

    function prepareUpdateScreen() {
      shrinkSelected = false;
      const record = state.savedRecords.find(r => r.id === state.updateTargetId) || state.savedRecords[0];
      if (!record) return;

      document.getElementById('updatePlanTopic').textContent = record.topic;
      document.getElementById('updatePlanText').textContent = record.planText;
      document.getElementById('updatePlanDate').textContent = `บันทึกเมื่อ: ${record.date}`;
      document.getElementById('updateNoteInput').value = '';

      setUpdateStatus(record.status || 'not_started');
    }

    function setUpdateStatus(statusKey) {
      shrinkSelected = false;
      state.tempUpdateStatus = statusKey;

      // Update Choice button UI
      ['not_started', 'in_progress', 'completed'].forEach(s => {
        const btn = document.getElementById(`statusBtn_${s}`);
        if (s === statusKey) {
          if (s === 'not_started') {
            btn.className = "update-status-btn btn-press min-h-[44px] p-2.5 rounded-xl border-2 border-peach-400 bg-peach-50 text-peach-500 font-bold text-xs transition";
          } else if (s === 'in_progress') {
            btn.className = "update-status-btn btn-press min-h-[44px] p-2.5 rounded-xl border-2 border-amber-500 bg-amber-50 text-amber-900 font-bold text-xs transition";
          } else if (s === 'completed') {
            btn.className = "update-status-btn btn-press min-h-[44px] p-2.5 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-emerald-800 font-bold text-xs transition";
          }
        } else {
          btn.className = "update-status-btn btn-press min-h-[44px] p-2.5 rounded-xl border border-canvas-border bg-white text-slateDark-700 font-medium text-xs transition";
        }
      });

      // Adaptive Dynamic Context
      const area = document.getElementById('updateStatusContextArea');
      const noteLabel = document.getElementById('updateNoteLabel');

      if (statusKey === 'not_started') {
        noteLabel.textContent = "มีอะไรอยากบันทึกเพิ่มไหม? (ไม่บังคับ)";
        area.innerHTML = `
          <div class="space-y-2.5">
            <div class="flex items-center space-x-2 text-xs font-semibold text-slateDark-800">
              <span class="w-2 h-2 rounded-full bg-peach-500"></span>
              <span>ยังไม่เป็นไรเลย ทุกคนมีจังหวะของตัวเอง</span>
            </div>
            <p class="text-xs text-slateDark-600 leading-relaxed">
              อยากเก็บแผนเดิมไว้ก่อน หรืออยากปรับให้เล็กลงจนรู้สึกเริ่มได้ง่ายขึ้น?
            </p>
            <div class="flex items-center space-x-2 pt-1">
              <button type="button" onclick="selectNotStartedAction('keep')" id="btnKeepPlan" class="btn-press flex-1 min-h-[44px] py-2 px-3 rounded-xl bg-white border-2 border-brand-600 text-brand-700 text-xs font-bold transition">
                เก็บแผนเดิม
              </button>
              <button type="button" onclick="selectNotStartedAction('shrink')" id="btnShrinkPlan" class="btn-press flex-1 min-h-[44px] py-2 px-3 rounded-xl bg-white border border-canvas-border text-slateDark-700 text-xs font-medium hover:border-brand-500 transition">
                ปรับแผนให้เล็กลง
              </button>
            </div>
            <!-- Sub-container for shrinking plan -->
            <div id="shrinkPlanInputArea" class="hidden pt-2 border-t border-canvas-border space-y-1.5 fade-in">
              <span class="text-[11px] font-semibold text-brand-700 block">ปรับข้อความแผนให้เล็กลง (เช่น ลดเวลาเหลือ 5 นาที):</span>
              <input type="text" id="shrinkPlanTextInput" placeholder="พิมพ์ก้าวที่เล็กลงสำหรับแผนของคุณ" maxlength="500" class="w-full text-xs p-2.5 bg-white border border-brand-300 rounded-xl focus:outline-none">
            </div>
          </div>
        `;
      } else if (statusKey === 'in_progress') {
        noteLabel.textContent = "บันทึกความคืบหน้าหรืออุปสรรคที่พบ (ไม่บังคับ):";
        area.innerHTML = `
          <div class="space-y-1.5">
            <div class="flex items-center space-x-2 text-xs font-semibold text-amber-800">
              <span class="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>กำลังก้าวไปข้างหน้าทีละนิด</span>
            </div>
            <p class="text-xs text-slateDark-600 leading-relaxed">
              ก้าวเริ่มต้นเกิดขึ้นแล้ว บันทึกสิ่งที่ทำไปแล้วหรือสิ่งที่ยังติดอยู่ด้านล่างได้เลย
            </p>
          </div>
        `;
      } else if (statusKey === 'completed') {
        noteLabel.textContent = "หลังทำแล้ว มีอะไรเปลี่ยนไปบ้าง? (ไม่บังคับ):";
        area.innerHTML = `
          <div class="space-y-1.5">
            <div class="flex items-center space-x-2 text-xs font-semibold text-emerald-800">
              <span class="w-2 h-2 rounded-full bg-emerald-600"></span>
              <span>คุณได้พาตัวเองผ่านก้าวนี้แล้ว</span>
            </div>
            <p class="text-xs text-slateDark-600 leading-relaxed">
              ยินดีกับความพยายามเล็ก ๆ ในวันนี้ หากมีเรื่องใหม่ที่อยากคุย สามารถกลับไปเริ่มคุยใหม่ได้เสมอ
            </p>
          </div>
        `;
      }
    }

    let shrinkSelected = false;
    function selectNotStartedAction(action) {
      const btnKeep = document.getElementById('btnKeepPlan');
      const btnShrink = document.getElementById('btnShrinkPlan');
      const shrinkArea = document.getElementById('shrinkPlanInputArea');

      if (action === 'keep') {
        shrinkSelected = false;
        btnKeep.className = "btn-press flex-1 min-h-[44px] py-2 px-3 rounded-xl bg-white border-2 border-brand-600 text-brand-700 text-xs font-bold transition";
        btnShrink.className = "btn-press flex-1 min-h-[44px] py-2 px-3 rounded-xl bg-white border border-canvas-border text-slateDark-700 text-xs font-medium hover:border-brand-500 transition";
        if (shrinkArea) shrinkArea.classList.add('hidden');
      } else {
        shrinkSelected = true;
        btnShrink.className = "btn-press flex-1 min-h-[44px] py-2 px-3 rounded-xl bg-brand-50 border-2 border-brand-600 text-brand-700 text-xs font-bold transition";
        btnKeep.className = "btn-press flex-1 min-h-[44px] py-2 px-3 rounded-xl bg-white border border-canvas-border text-slateDark-700 text-xs font-medium hover:border-brand-500 transition";
        if (shrinkArea) shrinkArea.classList.remove('hidden');
      }
    }

    function savePlanUpdate() {
      const record = state.savedRecords.find(r => r.id === state.updateTargetId);
      if (record) {
        record.status = state.tempUpdateStatus;
        if (shrinkSelected) {
          const newShrink = document.getElementById('shrinkPlanTextInput')?.value;
          if (newShrink && newShrink.trim()) {
            record.planText = newShrink.trim();
          }
        }
        const note = document.getElementById('updateNoteInput').value.trim();
        if (note) {
          record.reflections.push(note);
        }
      }
      navigateTo('myplans');
    }

    // ================= DELETE & DATA MANAGEMENT MODALS =================
    function promptDeleteItem(id, title) {
      title = state.savedRecords.find(record => record.id === id)?.topic || title || 'รายการนี้';
      state.pendingDeleteId = id;
      document.getElementById('deleteItemPromptText').textContent = `คุณกำลังจะลบรายการ “${title}” ข้อมูลจะถูกลบจากหน้านี้และไม่สามารถกู้คืนได้`;
      document.getElementById('deleteConfirmModal').classList.remove('hidden');
    }

    function closeDeleteConfirmModal() {
      state.pendingDeleteId = null;
      document.getElementById('deleteConfirmModal').classList.add('hidden');
    }

    function executeConfirmedDelete() {
      if (state.pendingDeleteId) {
        state.savedRecords = state.savedRecords.filter(r => r.id !== state.pendingDeleteId);
        closeDeleteConfirmModal();
        renderMyPlans();
        renderDataSettingsList();
      }
    }

    function openDataSettings() {
      renderDataSettingsList();
      document.getElementById('dataSettingsModal').classList.remove('hidden');
    }

    function closeDataSettings() {
      document.getElementById('dataSettingsModal').classList.add('hidden');
    }

    function renderDataSettingsList() {
      const list = document.getElementById('dataSavedItemsList');
      list.innerHTML = '';

      if (state.savedRecords.length === 0) {
        list.innerHTML = `<div class="p-3 text-xs text-slateDark-400 bg-canvas-base rounded-xl">ไม่มีรายการที่ถูกบันทึกไว้</div>`;
        document.getElementById('dataNotifStatusText').textContent = "ไม่มีการเตือนที่เปิดอยู่";
        return;
      }

      let activeReminders = 0;
      state.savedRecords.forEach(r => {
        if (r.reminder) activeReminders++;
        const item = document.createElement('div');
        item.className = "flex items-center justify-between p-3 rounded-xl bg-canvas-base border border-canvas-border text-xs";
        item.innerHTML = `
          <div class="pr-2">
            <span class="font-bold text-slateDark-900 block">${escapeHTML(r.topic)}</span>
            <span class="text-[11px] text-slateDark-600 truncate block max-w-[200px]">${escapeHTML(r.type === 'plan' ? r.planText : 'เฉพาะสรุป')}</span>
          </div>
          <button onclick="promptDeleteItem('${r.id}')" class="text-rose-600 font-semibold hover:underline text-xs flex-shrink-0">
            ลบ
          </button>
        `;
        list.appendChild(item);
      });

      document.getElementById('dataNotifStatusText').textContent = activeReminders > 0 ? `เปิดการเตือน ${activeReminders} รายการ` : `ไม่มีการเตือนที่เปิดอยู่`;
    }

    function cancelAllReminders() {
      state.savedRecords.forEach(r => r.reminder = false);
      renderDataSettingsList();
    }

    function openReadSummaryModal(recordId) {
      const record = state.savedRecords.find(r => r.id === recordId);
      if (!record) return;

      const body = document.getElementById('readSummaryBody');
      body.innerHTML = `
        <div class="space-y-3">
          <div class="bg-brand-50 p-3.5 rounded-2xl border border-brand-100">
            <span class="text-xs font-bold text-brand-800 block mb-1">เรื่องที่คุณกำลังกังวล:</span>
            <ul class="text-xs text-slateDark-800 space-y-1">
              ${record.summaryContext.concerns.map(c => `<li>• ${escapeHTML(c)}</li>`).join('')}
            </ul>
          </div>
          <div class="bg-canvas-base p-3.5 rounded-2xl border border-canvas-border">
            <span class="text-xs font-bold text-slateDark-700 block mb-1">ความรู้สึกในตอนนั้น:</span>
            <p class="text-xs text-slateDark-800">“${escapeHTML(record.summaryContext.emotion)}”</p>
          </div>
          ${record.type === 'plan' ? `
            <div class="bg-peach-50 p-3.5 rounded-2xl border border-peach-200">
              <span class="text-xs font-bold text-peach-500 block mb-1">แผนก้าวเล็ก ๆ ที่เลือก:</span>
              <p class="text-xs font-semibold text-slateDark-900">${escapeHTML(record.planText)}</p>
            </div>
          ` : ''}
        </div>
      `;
      if (record.reflections.length) {
        const notes = document.createElement('div');
        notes.className = 'mt-3 text-xs space-y-2';
        const title = document.createElement('h4');
        title.textContent = 'บันทึกความคืบหน้า'; notes.appendChild(title);
        record.reflections.forEach(note => { const line = document.createElement('p'); line.textContent = note; notes.appendChild(line); });
        body.appendChild(notes);
      }
      document.getElementById('readSummaryModal').classList.remove('hidden');
    }

    function closeReadSummaryModal() {
      document.getElementById('readSummaryModal').classList.add('hidden');
    }

    function handleBackdropClick(e, modalId) {
      if (e.target.id === modalId) {
        document.getElementById(modalId).classList.add('hidden');
      }
    }

    // ================= SIMULATED PUSH NOTIFICATION (24 HR) =================
    function triggerSimulatedReminderNow() {
      const notif = document.getElementById('simulatedNotification');
      notif.classList.remove('transform', '-translate-y-28', 'opacity-0', 'pointer-events-none');
      notif.classList.add('translate-y-0', 'opacity-100');
    }

    function dismissNotification(goToPlan) {
      const notif = document.getElementById('simulatedNotification');
      notif.classList.add('transform', '-translate-y-28', 'opacity-0', 'pointer-events-none');
      if (goToPlan) {
        navigateTo('myplans');
      }
    }

    // Initial setup on load
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('chatDynamicTurns').innerHTML = '';
      document.getElementById('chatQuickStarters').classList.remove('hidden');
      navigateTo('welcome');
      resetConversation();
      renderMyPlans();
      checkConnection();
    });
