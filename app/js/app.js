/* 拾词 —— 背单词 / 词库 / 复习单词 */
'use strict';

const $ = s => document.querySelector(s);
const WORDS = window.WORDS || [];
const N = WORDS.length;
const GROUP = 5;
const MASTER_STREAK = 3;
const REVIEW_BATCH = 20;          // 每轮最多复习量，防止疲劳
const KEY = 'shici-v1';

const HAS_TTS = 'speechSynthesis' in window;
const dayStr = offset => {
  const d = new Date(Date.now() + (offset || 0) * 864e5);
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
};
const TODAY = dayStr(0), YESTERDAY = dayStr(-1);

/* ---------- 持久化 ---------- */

let db = load();

function load() {
  const base = {
    idx: 0, maxPassed: 0, pool: {}, mastered: 0, pendingGroup: null,
    skip: {}, groupIds: [], groupNum: 0, seenUntil: -1,
    streakDays: 0, lastActive: null, theme: 'auto',
    daily: { date: '', learned: 0, reviewed: 0, startCount: 0 },
  };
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d.idx === 'number') {
      const db = Object.assign(base, d);
      db.daily = Object.assign({}, base.daily, d.daily || {});
      db.idx = Math.max(0, Math.min(N, d.idx));
      db.skip = d.skip || {};
      db.groupIds = d.groupIds || [];
      db.groupNum = d.groupNum || 0;
      db.seenUntil = (d.seenUntil !== undefined) ? d.seenUntil : db.idx - 1;
      db.maxPassed = Math.max(d.maxPassed || d.maxIdx || 0, db.idx);
      db.daily.startCount = (d.daily && d.daily.startCount !== undefined)
        ? d.daily.startCount : (d.daily && d.daily.startMax) || 0;
      // 旧版 pendingGroup {from,to} -> {ids,num}
      if (d.pendingGroup && d.pendingGroup.from !== undefined) {
        const ids = [];
        for (let i = d.pendingGroup.from; i < d.pendingGroup.to; i++) ids.push(i);
        db.pendingGroup = { ids, num: Math.ceil(d.pendingGroup.to / GROUP) };
      }
      dailyRollover(db);
      return db;
    }
  } catch (e) { /* 损坏则重置 */ }
  return base;
}

function dailyRollover(d) {
  if (d.daily.date !== TODAY) {
    d.daily = { date: TODAY, learned: 0, reviewed: 0, startCount: d.maxPassed || 0 };
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
}

function touchActivity() {
  if (db.lastActive === TODAY) return;
  db.streakDays = db.lastActive === YESTERDAY ? db.streakDays + 1 : 1;
  db.lastActive = TODAY;
}

/* ---------- 词表选择（skip = 不背的词） ---------- */

const includedCount = () => N - Object.keys(db.skip).length;

function passedCount(idx) {
  let n = 0;
  const end = Math.min(idx, N);
  for (let i = 0; i < end; i++) if (!db.skip[i]) n++;
  return n;
}

function nextIncluded(from) {
  for (let i = Math.max(0, from); i < N; i++) if (!db.skip[i]) return i;
  return -1;
}

function normalizeIdx() {
  if (db.idx >= N) return;
  if (db.skip[db.idx]) {
    const nx = nextIncluded(db.idx);
    db.idx = nx === -1 ? N : nx;
    save();
  }
}

/* ---------- 工具 ---------- */

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const norm = s => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

/* 朗读：App 内走安卓原生 TTS 引擎，浏览器里退回 Web Speech API */
const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

function speak(text) {
  if (!text) return;
  if (IS_NATIVE) {
    try {
      const TTS = window.Capacitor.Plugins.TextToSpeech;
      if (!TTS) return;
      Promise.resolve(TTS.cancel && TTS.cancel()).catch(() => {});
      TTS.speak({ text, lang: 'en-US', rate: 0.85, pitch: 1.0 }).catch(() => {});
    } catch (e) {}
    return;
  }
  if (!HAS_TTS) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.85;
    speechSynthesis.speak(u);
  } catch (e) {}
}

let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- 视图切换 ---------- */

function show(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + name).classList.add('active');
  if (name === 'home') renderHome();
}

/* ---------- 首页 ---------- */

function renderHome() {
  normalizeIdx();
  dailyRollover(db);
  const inc = includedCount();
  const passed = db.idx >= N ? inc : passedCount(db.idx);

  $('#home-learned').textContent = passed;
  $('#home-total').textContent = '/ ' + inc;
  $('#home-bar-fill').style.width = (inc ? passed / inc * 100 : 0) + '%';
  $('#stat-today-learned').textContent = db.daily.learned;
  $('#stat-today-reviewed').textContent = db.daily.reviewed;
  $('#stat-pool').textContent = Object.keys(db.pool).length;
  $('#stat-mastered').textContent = db.mastered;

  const streak = $('#home-streak');
  streak.hidden = db.streakDays < 1;
  streak.textContent = `连续打卡 ${db.streakDays} 天`;

  const next = $('#home-next');
  if (db.idx < N) {
    const w = WORDS[db.idx];
    next.innerHTML = `下一个 · Unit ${w.u} · <b>${esc(w.w)}</b>`;
  } else {
    next.textContent = N ? '整本词表已背完，去复习巩固吧' : '词库为空';
  }

  const n = Object.keys(db.pool).length;
  const badge = $('#entry-badge');
  badge.hidden = n === 0;
  badge.textContent = n;
}

/* ---------- 背单词 ---------- */

let revealed = false;

function enterLearn() {
  show('learn');
  normalizeIdx();
  revealed = false;
  updateLearnUI();
}

function updateLearnUI() {
  const inc = includedCount();
  const passed = db.idx >= N ? inc : passedCount(db.idx);
  $('#learn-meta').textContent = passed + ' / ' + inc;
  $('#learn-bar').style.width = (inc ? passed / inc * 100 : 0) + '%';

  const finished = db.idx >= N;
  $('#pool-chip').hidden = finished || !db.pool[db.idx];

  // 组内 5 点进度
  const dots = $('#group-dots');
  if (finished) {
    dots.innerHTML = '';
  } else {
    const pos = passed % GROUP;
    dots.innerHTML = [0, 1, 2, 3, 4].map(k =>
      `<i class="${k < pos ? 'done' : k === pos ? 'cur' : ''}"></i>`).join('');
  }

  const wordEl = $('#learn-word');
  if (finished) {
    $('#learn-unit').textContent = 'COMPLETE';
    wordEl.textContent = '全部背完';
    wordEl.style.animation = 'none';
    $('#speak-btn').hidden = true;
    $('#learn-reveal').hidden = true;
    $('#learn-hint').hidden = true;
    $('#learn-next').textContent = '重新背一遍';
    return;
  }

  const w = WORDS[db.idx];
  $('#learn-unit').textContent = w.u ? `UNIT ${w.u}${w.l ? ' · LESSON ' + w.l : ''}` : '';
  wordEl.textContent = w.w;
  wordEl.style.animation = 'none';
  void wordEl.offsetWidth;          // 重新触发入场动画
  wordEl.style.animation = '';
  $('#speak-btn').hidden = false;
  $('#learn-meaning').textContent = w.m;
  $('#learn-reveal').hidden = !revealed;
  $('#learn-hint').hidden = revealed;
  $('#learn-next').textContent = revealed ? '下一个' : '显示释义';
}

function learnAdvance() {
  if (db.idx >= N) {                // 重新背一遍
    const first = nextIncluded(0);
    db.idx = first === -1 ? N : first;
    db.seenUntil = db.idx - 1;
    db.groupIds = [];
    revealed = false;
    save();
    updateLearnUI();
    return;
  }
  if (!revealed) {
    revealed = true;
    speak(WORDS[db.idx].w);
    updateLearnUI();
    return;
  }

  // 当前词计入"学过"，凑满 5 个弹出加池询问
  for (let i = db.seenUntil + 1; i <= db.idx; i++) {
    if (!db.skip[i]) db.groupIds.push(i);
  }
  db.seenUntil = Math.max(db.seenUntil, db.idx);

  const next = nextIncluded(db.idx + 1);
  db.idx = next === -1 ? N : next;
  revealed = false;

  // 今日新学按已过词数水位累计，回退重走不会重复计数
  const passed = passedCount(db.idx);
  db.maxPassed = Math.max(db.maxPassed || 0, passed);
  db.daily.learned = Math.max(db.daily.learned || 0, (db.maxPassed || 0) - (db.daily.startCount || 0));
  touchActivity();

  if (db.groupIds.length >= GROUP) {
    db.groupNum++;
    db.pendingGroup = { ids: db.groupIds.slice(0, GROUP), num: db.groupNum };
    db.groupIds = db.groupIds.slice(GROUP);
    save();
    openSheet();
  }
  save();
  updateLearnUI();
}

function learnPrev() {
  for (let i = db.idx - 1; i >= 0; i--) {
    if (!db.skip[i]) {
      db.idx = i;
      revealed = false;
      save();
      updateLearnUI();
      return;
    }
  }
}

/* ---------- 组完成弹层 ---------- */

let sheetSel = new Set();

function openSheet() {
  const g = db.pendingGroup;
  if (!g || !g.ids || !g.ids.length) return;
  $('#sheet-kicker').textContent = `第 ${g.num} 组背完了`;
  $('#sheet-title').textContent = `把这 ${g.ids.length} 个单词加入复习池？`;
  sheetSel = new Set(g.ids);
  $('#sheet-words').innerHTML = g.ids.map(i =>
    `<button class="chip on" data-i="${i}">${esc(WORDS[i].w)}</button>`).join('');
  updateSheetBtn();
  $('#sheet').hidden = false;
}

function updateSheetBtn() {
  $('#sheet-add').textContent = `加入复习池（${sheetSel.size}）`;
  $('#sheet-add').disabled = sheetSel.size === 0;
}

$('#sheet-words').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const i = Number(chip.dataset.i);
  if (sheetSel.has(i)) { sheetSel.delete(i); chip.classList.remove('on'); }
  else { sheetSel.add(i); chip.classList.add('on'); }
  updateSheetBtn();
});

function closeSheet() {
  $('#sheet').hidden = true;
  db.pendingGroup = null;
  save();
}

$('#sheet-add').addEventListener('click', () => {
  const g = db.pendingGroup;
  if (!g) return;
  let added = 0;
  sheetSel.forEach(i => {
    if (!db.pool[i]) { db.pool[i] = { s: 0 }; added++; }
  });
  closeSheet();
  toast(added ? `已加入复习池 +${added}` : '所选单词已在复习池中');
  renderHome();
});
$('#sheet-skip').addEventListener('click', closeSheet);

/* ---------- 词库 ---------- */

let libUnit = 0;   // 0 = 全部未选时默认第一个 Unit
let libQuery = '';
let searchTimer = null;

function enterLibrary() {
  show('library');
  libQuery = '';
  $('#lib-search').value = '';
  if (!libUnit) {
    const us = [...new Set(WORDS.map(w => w.u))].sort((a, b) => a - b);
    libUnit = us[0] || 1;
  }
  renderLibraryTabs();
  renderLibrary();
}

function renderLibraryTabs() {
  const us = [...new Set(WORDS.map(w => w.u))].sort((a, b) => a - b);
  $('#unit-tabs').innerHTML = us.map(u =>
    `<button class="u-tab${u === libUnit ? ' on' : ''}" data-u="${u}">Unit ${u}</button>`).join('');
}

function renderLibrary() {
  const q = libQuery.trim().toLowerCase();
  if (q) { renderLibraryResults(q); return; }
  const words = WORDS.map((w, i) => ({ w, i })).filter(x => x.w.u === libUnit);
  const excluded = words.filter(x => db.skip[x.i]).length;

  let html = `
    <div class="lib-unit-head">
      <div><span class="lib-unit-name">Unit ${libUnit}</span><span class="lib-unit-count">${words.length} 词 · 已选 ${words.length - excluded}</span></div>
      <button class="lib-unit-toggle" id="lib-toggle">${excluded ? '全部加入' : '全部不背'}</button>
    </div>`;

  let lastLesson = null;
  for (const { w, i } of words) {
    if (w.l !== lastLesson) {
      lastLesson = w.l;
      html += `<div class="lib-lesson">Lesson ${w.l}</div>`;
    }
    const off = db.skip[i];
    html += `
      <button class="lib-row ${off ? 'off' : 'on'}" data-i="${i}">
        <span class="lib-check"></span>
        <span class="lib-word">${esc(w.w)}</span>
        <span class="lib-mean">${esc(w.m)}</span>
      </button>`;
  }
  $('#library-body').innerHTML = html;

  const meta = $('#library-meta');
  meta.textContent = `已选 ${includedCount()} / ${N}`;

  $('#lib-toggle').addEventListener('click', () => {
    const anyExcluded = words.some(x => db.skip[x.i]);
    for (const { i } of words) {
      if (anyExcluded) delete db.skip[i];
      else db.skip[i] = 1;
    }
    save();
    renderLibrary();
    toast(anyExcluded ? `Unit ${libUnit} 已全部加入` : `Unit ${libUnit} 已全部跳过`);
  });
}

function renderLibraryResults(q) {
  const hits = WORDS.map((w, i) => ({ w, i }))
    .filter(x => x.w.w.toLowerCase().includes(q) || (x.w.m || '').toLowerCase().includes(q));
  const shown = hits.slice(0, 100);
  let html = `
    <div class="lib-unit-head">
      <div><span class="lib-unit-name">找到 ${hits.length} 个</span>${hits.length > 100 ? '<span class="lib-unit-count">仅显示前 100 个</span>' : ''}</div>
    </div>`;
  for (const { w, i } of shown) {
    const off = db.skip[i];
    html += `
      <button class="lib-row ${off ? 'off' : 'on'}" data-i="${i}">
        <span class="lib-check"></span>
        <span class="lib-word">${esc(w.w)}</span>
        <span class="lib-mean">${esc(w.m)}</span>
      </button>`;
  }
  $('#library-body').innerHTML = html || '<p class="lib-empty">没有匹配的单词</p>';
}

$('#lib-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { libQuery = $('#lib-search').value; renderLibrary(); }, 150);
});

$('#unit-tabs').addEventListener('click', e => {
  const tab = e.target.closest('.u-tab');
  if (!tab) return;
  libUnit = Number(tab.dataset.u);
  renderLibraryTabs();
  renderLibrary();
});

$('#library-body').addEventListener('click', e => {
  const row = e.target.closest('.lib-row');
  if (!row) return;
  const i = Number(row.dataset.i);
  if (db.skip[i]) {
    delete db.skip[i];
    row.classList.remove('off');
    row.classList.add('on');
  } else {
    db.skip[i] = 1;
    row.classList.remove('on');
    row.classList.add('off');
  }
  save();
  if (libQuery.trim()) { renderLibrary(); return; }
  const meta = $('#library-meta');
  meta.textContent = `已选 ${includedCount()} / ${N}`;
});

/* ---------- 复习 ---------- */

let session = null;

function enterReview() {
  show('review');
  const ids = shuffle(Object.keys(db.pool).map(Number));
  if (!ids.length) { renderReviewEmpty(); return; }
  ids.sort((a, b) => db.pool[a].s - db.pool[b].s);   // 连对少的优先，同级保持随机
  session = { queue: ids.slice(0, REVIEW_BATCH), pos: 0, right: 0, wrong: 0, mastered: 0 };
  nextQuestion();
}

function renderReviewEmpty() {
  session = null;
  $('#review-meta').textContent = '待复习 0';
  $('#review-bar').style.width = '0%';
  $('#review-body').innerHTML = `
    <div class="review-center">
      <div class="review-empty-word">复习池是空的</div>
      <p class="review-empty-text">先去背单词，<br>每背完一组可以挑词加入复习池${db.mastered ? `，<br>已经掌握 ${db.mastered} 个词了，继续加油` : ''}</p>
      <button class="link-btn" id="go-learn">去背单词</button>
    </div>`;
  $('#go-learn').addEventListener('click', enterLearn);
}

function nextQuestion() {
  while (session.pos < session.queue.length && !(session.queue[session.pos] in db.pool)) {
    session.pos++;                    // 跳过本轮已被移出的词
  }
  if (session.pos >= session.queue.length) { renderSummary(); return; }

  const id = session.queue[session.pos];
  const w = WORDS[id];
  const q = { id, answered: false, hinted: new Set() };
  q.blanks = pickBlanks(w.w);
  q.expected = q.blanks.map(i => w.w[i]).join('');

  session.cur = q;
  renderQuestion();
}

function pickBlanks(word) {
  const idxs = [];
  for (let i = 0; i < word.length; i++) if (/[a-zA-Z]/.test(word[i])) idxs.push(i);
  const k = Math.max(1, Math.round(idxs.length * 0.35));
  shuffle(idxs);
  return idxs.slice(0, k).sort((a, b) => a - b);
}

const dotsHTML = s => [0, 1, 2].map(i => `<i class="${i < s ? 'on' : ''}"></i>`).join('');

/* 长单词用小号字母槽，避免折行 */
const slotSize = word => word.length > 14 ? ' xlong' : word.length > 9 ? ' long' : '';

function renderQuestion() {
  const q = session.cur;
  const w = WORDS[q.id];
  const poolN = Object.keys(db.pool).length;
  $('#review-meta').textContent = `待复习 ${poolN}`;
  $('#review-bar').style.width = (session.pos / session.queue.length * 100) + '%';

  $('#review-body').innerHTML = `
    <div class="review-top">
      <div class="q-kicker">
        <span class="micro-label">补全单词</span>
        <span class="streak-dots" id="q-dots">${dotsHTML(db.pool[q.id].s)}</span>
      </div>
      <p class="q-def">${esc(w.m)}</p>
      <div class="slots-wrap" id="slots-tap">
        <div class="slots${slotSize(w.w)}" id="slots">${fillSlotsHTML(q, [])}</div>
        <input class="q-input-hidden" id="q-input" autocomplete="off" autocapitalize="off"
               spellcheck="false" maxlength="${q.blanks.length}" enterkeyhint="done" aria-label="输入缺失字母">
      </div>
      <div class="answer-line" id="answer-line"></div>
      <div class="q-actions">
        <button class="btn-primary" id="review-action">提交</button>
        <div class="q-links" id="q-links">
          <button class="btn-ghost btn-aux" id="q-hint">提示</button>
          <button class="btn-ghost btn-aux" id="q-reveal">不会，看答案</button>
        </div>
      </div>
    </div>`;

  const input = $('#q-input');
  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^a-zA-Z]/g, '').toLowerCase();
    $('#slots').innerHTML = fillSlotsHTML(q, [...input.value]);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submitAnswer(); });
  $('#slots-tap').addEventListener('click', () => input.focus());

  $('#review-action').addEventListener('click', () => {
    if (!q.answered) { submitAnswer(); return; }
    session.pos++;
    nextQuestion();
  });
  $('#q-hint').addEventListener('click', useHint);
  $('#q-reveal').addEventListener('click', () => submitAnswer(true));

  $('#q-links').style.display = '';
  $('#q-hint').disabled = false;
  setTimeout(() => input.focus(), 80);
}

/* 填空槽：提示过的空直接亮字母，其余由输入按顺序填充 */
function fillSlotsHTML(q, typed) {
  const w = WORDS[q.id].w;
  let out = '', ti = 0, nextIdx = -1;
  for (let i = 0; i < w.length; i++) {
    const ch = w[i];
    const bi = q.blanks.indexOf(i);
    if (bi >= 0) {
      if (q.hinted.has(bi)) {
        out += `<span class="slot hint">${esc(ch)}</span>`;
      } else {
        const t = typed[ti] || '';
        const next = t === '' && nextIdx === -1 ? ' next' : '';
        if (t === '' && nextIdx === -1) nextIdx = 1;
        out += `<span class="slot blank${t ? ' filled' : ''}${next}">${esc(t)}</span>`;
        ti++;
      }
    } else if (ch === ' ' || ch === '-') {
      out += `<span class="slot" style="border-bottom-color:transparent">${ch === ' ' ? '' : '-'}</span>`;
    } else {
      out += `<span class="slot filled">${esc(ch)}</span>`;
    }
  }
  return out;
}

function useHint() {
  const q = session.cur;
  if (!q || q.answered) return;
  const input = $('#q-input');

  for (let k = 0; k < q.blanks.length; k++) {
    if (!q.hinted.has(k)) {
      q.hinted.add(k);
      break;
    }
  }
  if (q.hinted.size >= q.blanks.length) $('#q-hint').disabled = true;
  const remain = q.blanks.length - q.hinted.size;
  input.maxLength = Math.max(1, remain);
  input.value = input.value.slice(0, remain);
  $('#slots').innerHTML = fillSlotsHTML(q, [...input.value]);
  input.focus();
}

function submitAnswer(forceWrong) {
  const q = session.cur;
  if (!q || q.answered) return;
  const input = $('#q-input');
  const w = WORDS[q.id];
  let ok = false;
  if (!forceWrong) {
    const val = norm(input.value);
    const remain = q.blanks.length - q.hinted.size;
    if (!val && remain > 0) return;   // 全部字母都已提示时允许直接提交
    ok = val === q.blanks.map((_, k) => q.hinted.has(k) ? '' : q.expected[k]).join('');
  }

  q.answered = true;
  input.disabled = true;
  input.classList.add(ok ? 'ok' : 'no');
  $('#q-links').style.display = 'none';

  const line = $('#answer-line');
  const dots = $('#q-dots');
  db.daily.reviewed++;
  touchActivity();

  if (ok) {
    session.right++;
    const rec = db.pool[q.id];
    rec.s++;
    if (rec.s >= MASTER_STREAK) {
      delete db.pool[q.id];
      db.mastered++;
      session.mastered++;
      buzz([20, 40, 20]);
      line.innerHTML = `<span class="mastered-tag">已掌握 · 移出复习池</span>`;
    } else {
      buzz(12);
      line.textContent = `答对了，连对 ${rec.s} / ${MASTER_STREAK}`;
      line.classList.add('good');
    }
  } else {
    session.wrong++;
    if (db.pool[q.id]) db.pool[q.id].s = 0;
    buzz(70);
    line.classList.add('no');
    line.innerHTML = `${forceWrong ? '答案是 ' : '正确答案 '}<span class="ans-word">${esc(w.w)}</span>${forceWrong ? '，再记一记' : ' · 连对清零'}`;
    $('#slots').innerHTML = fillSlotsHTML(q, []);
    $('#slots').querySelectorAll('.slot.blank').forEach(s => s.classList.add('miss'));
  }
  speak(w.w);
  save();

  const s = db.pool[q.id] ? db.pool[q.id].s : MASTER_STREAK;
  dots.innerHTML = dotsHTML(s);
  $('#review-action').textContent = '下一题';
}

function renderSummary() {
  session.cur = null;
  const poolN = Object.keys(db.pool).length;
  $('#review-meta').textContent = `待复习 ${poolN}`;
  $('#review-bar').style.width = '100%';
  $('#review-body').innerHTML = `
    <div class="review-center">
      <div class="sum-title">${poolN ? '本轮复习完成' : '复习池清空了'}</div>
      <div class="sum-rows">
        <div class="sum-row"><span>答对</span><b>${session.right}</b></div>
        <div class="sum-row"><span>答错</span><b>${session.wrong}</b></div>
        <div class="sum-row"><span>新掌握</span><b>${session.mastered}</b></div>
        <div class="sum-row"><span>剩余待复习</span><b>${poolN}</b></div>
      </div>
      <div class="sum-actions">
        <button class="btn-primary" id="sum-again" ${poolN ? '' : 'disabled'}>再来一轮</button>
        <button class="btn-ghost" id="sum-home">返回首页</button>
      </div>
    </div>`;
  $('#sum-again').addEventListener('click', enterReview);
  $('#sum-home').addEventListener('click', () => show('home'));
}

/* ---------- 事件绑定 ---------- */

$('#entry-learn').addEventListener('click', enterLearn);
$('#entry-library').addEventListener('click', enterLibrary);
$('#entry-review').addEventListener('click', enterReview);
$('#learn-back').addEventListener('click', () => show('home'));
$('#review-back').addEventListener('click', () => show('home'));
$('#library-back').addEventListener('click', () => show('home'));
$('#entry-settings').addEventListener('click', enterSettings);
$('#settings-back').addEventListener('click', () => show('home'));
$('#learn-next').addEventListener('click', learnAdvance);
$('#learn-prev').addEventListener('click', learnPrev);
$('#speak-btn').addEventListener('click', () => { if (db.idx < N) speak(WORDS[db.idx].w); });
$('#learn-card').addEventListener('click', e => {
  if (e.target.closest('#speak-btn')) return;
  if (!revealed && db.idx < N) { revealed = true; speak(WORDS[db.idx].w); updateLearnUI(); }
});

/* ---------- 设置 / 主题 ---------- */

function applyTheme() {
  const pref = db.theme || 'auto';
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const dark = pref === 'dark' || (pref === 'auto' && mq && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#171512' : '#F5F2EB';
}

if (window.matchMedia) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => { if ((db.theme || 'auto') === 'auto') applyTheme(); };
  mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
}

function enterSettings() {
  show('settings');
  renderSettings();
}

function renderSettings() {
  const inc = includedCount();
  const passed = db.idx >= N ? inc : passedCount(db.idx);
  const rows = [
    ['总词数', N], ['已选待学', inc], ['已学', passed],
    ['待复习', Object.keys(db.pool).length], ['已掌握', db.mastered],
    ['连续打卡', db.streakDays + ' 天'], ['今日新学', db.daily.learned], ['今日复习', db.daily.reviewed],
  ];
  $('#set-stats').innerHTML = rows.map(([k, v]) =>
    `<div class="set-stat"><span>${k}</span><b>${v}</b></div>`).join('');
  [...$('#theme-seg').children].forEach(b =>
    b.classList.toggle('on', b.dataset.t === (db.theme || 'auto')));
}

function armConfirm(btn, fn) {
  if (btn.dataset.armed === '1') {
    clearTimeout(+btn.dataset.timer);
    btn.dataset.armed = '';
    btn.textContent = btn.dataset.label;
    fn();
    return;
  }
  btn.dataset.armed = '1';
  btn.dataset.label = btn.textContent;
  btn.textContent = '再点一次确认';
  btn.dataset.timer = setTimeout(() => {
    btn.dataset.armed = '';
    btn.textContent = btn.dataset.label;
  }, 3000);
}

$('#theme-seg').addEventListener('click', e => {
  const b = e.target.closest('button[data-t]');
  if (!b) return;
  db.theme = b.dataset.t;
  save();
  applyTheme();
  renderSettings();
});

$('#reset-progress').addEventListener('click', e => armConfirm(e.currentTarget, () => {
  db.idx = 0; db.maxPassed = 0; db.pool = {}; db.mastered = 0;
  db.groupIds = []; db.groupNum = 0; db.seenUntil = -1; db.pendingGroup = null;
  db.daily = { date: TODAY, learned: 0, reviewed: 0, startCount: 0 };
  save();
  renderSettings();
  toast('已清空学习进度');
}));

$('#reset-skip').addEventListener('click', e => armConfirm(e.currentTarget, () => {
  db.skip = {};
  save();
  renderSettings();
  toast('已恢复默认勾选');
}));

/* ---------- 学习页滑动手势：左滑下一个，右滑上一个 ---------- */

let touchX = 0, touchY = 0;
$('#learn-card').addEventListener('touchstart', e => {
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
}, { passive: true });
$('#learn-card').addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (dx < 0) learnAdvance();
    else learnPrev();
  }
}, { passive: true });

/* ---------- 启动 ---------- */

applyTheme();
show('home');
if (db.pendingGroup) openSheet();
