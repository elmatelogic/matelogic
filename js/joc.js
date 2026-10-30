const API_URL = "https://matelogicbd.elmatelogic.workers.dev/";

let DAILY_GAME = null;
let tokens = [];
let cursorIndex = 0;
let usedNumbers = new Set();
let outerPositions = [];
let gameState = { solutions: [], score: 0 };
let CURRENT_CHALLENGE_ID = "";
let countdownInterval = null;
let eventsInitialized = false;

const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function getCurrentMadridDateShort() {
  const [y, m, d] = LOCAL_DATE_FORMATTER.format(new Date()).split('-');
  return `${d}/${m}/${y.slice(-2)}`;
}

function saveTokensSession() {
  try {
    sessionStorage.setItem('matelogic_active_tokens', JSON.stringify({ tokens, cursorIndex }));
  } catch (e) {}
}

function loadTokensSession() {
  try {
    const raw = sessionStorage.getItem('matelogic_active_tokens');
    if (raw) {
      const parsed = JSON.parse(raw);
      tokens = parsed.tokens || [];
      cursorIndex = parsed.cursorIndex || 0;
    }
  } catch (e) {}
}

function clearTokensSession() {
  try {
    sessionStorage.removeItem('matelogic_active_tokens');
  } catch (e) {}
}

function cleanOldProgress(currentNumStr) {
  try {
    const currentDayNum = parseInt(currentNumStr, 10);
    if (isNaN(currentDayNum)) return;

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const match = key.match(/^matelogic_d(\d+)_t\d+$/);
      if (match) {
        const savedDayNum = parseInt(match[1], 10);
        if (!isNaN(savedDayNum)) {
          const diff = (currentDayNum - savedDayNum + 366) % 366;
          if (diff > 7 && diff < 359) {
            keysToRemove.push(key);
          }
        }
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}

function updateThemeUI(selectedTheme) {
  const btns = {
    system: document.getElementById('theme-btn-system'),
    light: document.getElementById('theme-btn-light'),
    dark: document.getElementById('theme-btn-dark')
  };
  const activeClass = "bg-brand-red text-white font-bold shadow-xs";
  const inactiveClass = "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white";

  Object.keys(btns).forEach(key => {
    if (!btns[key]) return;
    if (key === selectedTheme) {
      btns[key].className = `px-2.5 py-1 rounded-lg text-[11px] transition-all ${activeClass}`;
    } else {
      btns[key].className = `px-2.5 py-1 rounded-lg text-[11px] transition-all ${inactiveClass}`;
    }
  });
}

function setAppTheme(theme) {
  localStorage.setItem('matelogic_theme', theme);
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (theme === 'dark' || (theme === 'system' && systemDark)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  updateThemeUI(theme);
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  const currentTheme = localStorage.getItem('matelogic_theme') || 'system';
  if (currentTheme === 'system') {
    if (e.matches) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    updateThemeUI('system');
  }
});

function updatePrintableSheet() {
  if (!DAILY_GAME) return;
  const numEl = document.getElementById('sheet-challenge-num');
  const dateEl = document.getElementById('sheet-date');
  const targetEl = document.getElementById('sheet-target');
  const centerEl = document.getElementById('sheet-val-center');

  if (numEl) numEl.innerText = `Repte #${DAILY_GAME.num}`;
  if (dateEl) dateEl.innerText = DAILY_GAME.data;
  if (targetEl) targetEl.innerText = DAILY_GAME.target;
  if (centerEl) centerEl.textContent = DAILY_GAME.center;

  if (Array.isArray(DAILY_GAME.outer)) {
    DAILY_GAME.outer.forEach((val, idx) => {
      const el = document.getElementById(`sheet-val-${idx}`);
      if (el) el.textContent = val;
    });
  }
}

function printWorksheet() {
  if (typeof stopDuelTimer === 'function') stopDuelTimer();
  updatePrintableSheet();
  try { navigator.sendBeacon(`${API_URL}api/fitxa`); } catch (e) {}
  window.print();
}

async function initUI() {
  try {
    const initialTheme = localStorage.getItem('matelogic_theme') || 'system';
    updateThemeUI(initialTheme);
    const res = await fetch(`${API_URL}api/repte?t=${Date.now()}`, { cache: 'no-store' });
    DAILY_GAME = await res.json();
    const newChallengeId = `matelogic_d${DAILY_GAME.num}_t${DAILY_GAME.target}`;
    if (CURRENT_CHALLENGE_ID && CURRENT_CHALLENGE_ID !== newChallengeId) clearTokensSession();
    CURRENT_CHALLENGE_ID = newChallengeId;
    cleanOldProgress(DAILY_GAME.num);
    outerPositions = [...DAILY_GAME.outer];
    tokens = [];
    cursorIndex = 0;
    loadTokensSession();
    syncUsedNumbers();

    document.getElementById('challenge-day-label').innerText = `Repte Núm. ${DAILY_GAME.num}`;
    document.getElementById('challenge-date-label').innerText = DAILY_GAME.data;
    document.getElementById('target-value').innerText = DAILY_GAME.target;
    document.getElementById('center-val').innerText = DAILY_GAME.center;

    const hContainer = document.getElementById('honeycomb-container');
    if (hContainer) hContainer.classList.remove('opacity-60');

    renderOuterHexagons();
    loadSavedProgress();
    updateScoreboard();
    updateDisplay();
    updatePrintableSheet();

    if (!eventsInitialized) {
      setupDeleteEvents();
      setupBackdropCloseEvents();
      eventsInitialized = true;
    }
  } catch (err) {
    showToast("Error de connexió carregant el repte", "error");
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && DAILY_GAME && (!window.duelState || !window.duelState.active)) {
    if (DAILY_GAME.data !== getCurrentMadridDateShort()) initUI();
  }
});

function triggerShakeDisplay() {
  const displayEl = document.getElementById('display-container');
  if (displayEl) {
    displayEl.classList.remove('animate-shake', 'text-red-500', 'border-red-400');
    void displayEl.offsetWidth;
    displayEl.classList.add('animate-shake', 'text-red-500', 'border-red-400');
    setTimeout(() => displayEl.classList.remove('animate-shake', 'text-red-500', 'border-red-400'), 400);
  }
}

function syncUsedNumbers() {
  usedNumbers.clear();
  tokens.forEach(t => {
    if (t.type === 'num') {
      usedNumbers.add(parseInt(t.val, 10));
    }
  });
}

function loadSavedProgress() {
  try {
    const raw = localStorage.getItem(CURRENT_CHALLENGE_ID);
    if (raw) {
      const parsed = JSON.parse(raw);
      gameState.solutions = parsed.solutions || [];
      gameState.score = parsed.score || 0;
    } else {
      gameState = { solutions: [], score: 0 };
    }
  } catch (e) {}
}

function persistProgress() {
  try { localStorage.setItem(CURRENT_CHALLENGE_ID, JSON.stringify(gameState)); } catch (e) {}
}

function renderOuterHexagons() {
  syncUsedNumbers();
  outerPositions.forEach((val, idx) => {
    const btn = document.getElementById(`hex-${idx}`);
    if (btn) {
      btn.innerText = val;
      btn.setAttribute('aria-label', `Xifra ${val}`);
      if (usedNumbers.has(val)) {
        btn.classList.add('used');
        btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.classList.remove('used');
        btn.setAttribute('aria-disabled', 'false');
      }
    }
  });
  const centerBtn = document.getElementById('hex-center');
  if (centerBtn && DAILY_GAME) {
    centerBtn.setAttribute('aria-label', `Dígit central ${DAILY_GAME.center} (obligatori)`);
    if (usedNumbers.has(DAILY_GAME.center)) {
      centerBtn.classList.add('used');
      centerBtn.setAttribute('aria-disabled', 'true');
    } else {
      centerBtn.classList.remove('used');
      centerBtn.setAttribute('aria-disabled', 'false');
    }
  }
}

function shuffleOuterHexagons() {
  for (let i = outerPositions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [outerPositions[i], outerPositions[j]] = [outerPositions[j], outerPositions[i]];
  }
  renderOuterHexagons();
}

function updateDisplay() {
  const container = document.getElementById('display-tokens');
  container.innerHTML = '';
  const oberts = tokens.filter(t => t.val === '(').length;
  const tancats = tokens.filter(t => t.val === ')').length;
  const pendents = Math.max(0, oberts - tancats);
  const totalChars = tokens.reduce((acc, t) => acc + t.display.length, 0) + tokens.length + pendents;
  if (totalChars > 16) {
    container.className = "flex items-center min-w-full text-base sm:text-lg transition-all";
  } else if (totalChars > 11) {
    container.className = "flex items-center min-w-full text-lg sm:text-xl transition-all";
  } else {
    container.className = "flex items-center min-w-full text-2xl sm:text-3xl transition-all";
  }
  const cursorSpan = document.createElement('span');
  cursorSpan.id = "display-cursor-el";
  cursorSpan.className = "w-2 h-6 bg-brand-red rounded-xs cursor-blink mx-0.5 inline-block shrink-0";

  for (let i = 0; i <= tokens.length; i++) {
    if (i === cursorIndex) container.appendChild(cursorSpan);
    if (i < tokens.length) {
      const t = tokens[i];
      const span = document.createElement('span');
      span.innerText = t.display;
      let baseClass = "px-1 py-0.5 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors ";
      if (['+', '−', '×', '÷'].includes(t.display)) {
        baseClass += "text-slate-400 font-medium mx-0.5";
      } else if (t.display === '(' || t.display === ')') {
        baseClass += "text-brand-blue font-black mx-0.5";
      } else if (DAILY_GAME && t.val === DAILY_GAME.center.toString()) {
        baseClass += "text-brand-red font-black";
      } else {
        baseClass += "text-slate-900 dark:text-white font-bold";
      }
      span.className = baseClass;
      span.onclick = (e) => { e.stopPropagation(); setCursorPosition(i + 1); };
      container.appendChild(span);
    }
  }

  if (pendents > 0 && tokens.length > 0) {
    const ghostSpan = document.createElement('span');
    ghostSpan.innerText = ')'.repeat(pendents);
    ghostSpan.title = "Toca per tancar el parèntesi";
    ghostSpan.className = "px-1 py-0.5 text-brand-blue/50 dark:text-brand-blue/40 font-black cursor-pointer hover:text-brand-blue transition-colors select-none";
    ghostSpan.onclick = (e) => { e.stopPropagation(); setCursorPosition(tokens.length); appendChar(')'); };
    container.appendChild(ghostSpan);
  }

  saveTokensSession();
  setTimeout(() => {
    const cEl = document.getElementById('display-cursor-el');
    if (cEl) cEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, 10);
}

function setCursorPosition(newPos) {
  cursorIndex = Math.max(0, Math.min(newPos, tokens.length));
  updateDisplay();
}

function moveCursor(delta) {
  setCursorPosition(cursorIndex + delta);
}

function handleDisplayClick(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  if (e.clientX - rect.left < rect.width / 3) {
    setCursorPosition(0);
  } else {
    setCursorPosition(tokens.length);
  }
}

function appendChar(char) {
  const prevToken = cursorIndex > 0 ? tokens[cursorIndex - 1] : null;
  const nextToken = cursorIndex < tokens.length ? tokens[cursorIndex] : null;

  if (char === '(') {
    if (prevToken && (prevToken.type === 'num' || prevToken.val === ')')) {
      triggerShakeDisplay();
      return showToast("Cal un operador abans del parèntesi!", "warning");
    }
  }

  if (char === ')') {
    if (!prevToken || (prevToken.type === 'op' && prevToken.val !== ')')) {
      triggerShakeDisplay();
      return showToast("Operació incompleta abans de tancar parèntesi", "warning");
    }
    const oberts = tokens.filter(t => t.val === '(').length;
    const tancats = tokens.filter(t => t.val === ')').length;
    if (oberts <= tancats) {
      triggerShakeDisplay();
      return showToast("No hi ha cap parèntesi per tancar!", "warning");
    }
  }

  if (['+', '−', '×', '÷'].includes(char)) {
    let rawChar = char;
    if (char === '×') rawChar = '*';
    if (char === '÷') rawChar = '/';
    if (char === '−') rawChar = '-';

    if (prevToken && prevToken.type === 'op' && prevToken.val !== '(' && prevToken.val !== ')') {
      tokens[cursorIndex - 1] = { type: 'op', val: rawChar, display: char, id: null };
      updateDisplay();
      return;
    }

    if (nextToken && nextToken.type === 'op' && nextToken.val !== '(' && nextToken.val !== ')') {
      tokens[cursorIndex] = { type: 'op', val: rawChar, display: char, id: null };
      cursorIndex++;
      updateDisplay();
      return;
    }

    if (!prevToken || prevToken.val === '(') {
      triggerShakeDisplay();
      return showToast("Posa primer un número!", "warning");
    }
  }

  let raw = char;
  if (char === '×') raw = '*';
  if (char === '÷') raw = '/';
  if (char === '−') raw = '-';

  tokens.splice(cursorIndex, 0, { type: 'op', val: raw, display: char, id: null });
  cursorIndex++;
  updateDisplay();
}

function handleHexClick(index) {
  const val = outerPositions[index];
  if (usedNumbers.has(val)) return;
  const prevToken = cursorIndex > 0 ? tokens[cursorIndex - 1] : null;
  const nextToken = cursorIndex < tokens.length ? tokens[cursorIndex] : null;

  if (nextToken && nextToken.type === 'num') {
    tokens[cursorIndex] = { type: 'num', val: val.toString(), display: val.toString(), id: `hex-${index}` };
    cursorIndex++;
    renderOuterHexagons();
    updateDisplay();
    return;
  }
  if (prevToken && (prevToken.type === 'num' || prevToken.val === ')')) {
    triggerShakeDisplay();
    return showToast("Cal un operador!", "warning");
  }
  if (nextToken && (nextToken.type === 'num' || nextToken.val === '(')) {
    triggerShakeDisplay();
    return showToast("Cal un operador abans del número següent!", "warning");
  }
  tokens.splice(cursorIndex, 0, { type: 'num', val: val.toString(), display: val.toString(), id: `hex-${index}` });
  cursorIndex++;
  renderOuterHexagons();
  updateDisplay();
}

function handleHexCenterClick() {
  const val = DAILY_GAME.center;
  if (usedNumbers.has(val)) return;
  const prevToken = cursorIndex > 0 ? tokens[cursorIndex - 1] : null;
  const nextToken = cursorIndex < tokens.length ? tokens[cursorIndex] : null;

  if (nextToken && nextToken.type === 'num') {
    tokens[cursorIndex] = { type: 'num', val: val.toString(), display: val.toString(), id: 'hex-center' };
    cursorIndex++;
    renderOuterHexagons();
    updateDisplay();
    return;
  }
  if (prevToken && (prevToken.type === 'num' || prevToken.val === ')')) {
    triggerShakeDisplay();
    return showToast("Cal un operador!", "warning");
  }
  if (nextToken && (nextToken.type === 'num' || nextToken.val === '(')) {
    triggerShakeDisplay();
    return showToast("Cal un operador abans del número següent!", "warning");
  }
  tokens.splice(cursorIndex, 0, { type: 'num', val: val.toString(), display: val.toString(), id: 'hex-center' });
  cursorIndex++;
  renderOuterHexagons();
  updateDisplay();
}

function handleDelete() {
  if (cursorIndex === 0) return;
  const prevToken = tokens[cursorIndex - 1];
  const tokenAbans = cursorIndex > 1 ? tokens[cursorIndex - 2] : null;
  const tokenDespres = cursorIndex < tokens.length ? tokens[cursorIndex] : null;

  if (prevToken && prevToken.type === 'op' && !['(', ')'].includes(prevToken.val)) {
    if (tokenAbans && tokenAbans.type === 'num' && tokenDespres && tokenDespres.type === 'num') {
      tokens.splice(cursorIndex - 1, 1);
      cursorIndex--;
      tokens.splice(cursorIndex - 1, 1);
      cursorIndex--;
      renderOuterHexagons();
      updateDisplay();
      return;
    }
  }
  tokens.splice(cursorIndex - 1, 1);
  cursorIndex--;
  renderOuterHexagons();
  updateDisplay();
}

function clearAllTokens() {
  if (tokens.length === 0) return;
  tokens = [];
  cursorIndex = 0;
  clearTokensSession();
  renderOuterHexagons();
  updateDisplay();
  showToast("Operació buidada", "warning");
}

function setupDeleteEvents() {
  const btn = document.getElementById('delete-btn');
  if (!btn) return;
  let pressTimer = null;
  let isLongPress = false;

  const startPress = () => {
    isLongPress = false;
    pressTimer = setTimeout(() => { isLongPress = true; clearAllTokens(); }, 500);
  };
  const endPress = (e) => {
    clearTimeout(pressTimer);
    if (!isLongPress && e.type !== 'mouseleave') handleDelete();
  };

  btn.addEventListener('mousedown', startPress);
  btn.addEventListener('mouseup', endPress);
  btn.addEventListener('mouseleave', () => clearTimeout(pressTimer));
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); startPress(); }, { passive: false });
  btn.addEventListener('touchend', (e) => { e.preventDefault(); endPress(e); }, { passive: false });
}

function setupBackdropCloseEvents() {
  document.querySelectorAll('[id$="-modal"]').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal.id); });
  });
}

window.addEventListener('keydown', (e) => {
  if (['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) return;
  if (window.duelState && window.duelState.active) return;

  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    if (e.repeat) clearAllTokens();
    else handleDelete();
  } else if (e.key === 'Escape') {
    const modalObert = document.querySelector('[id$="-modal"]:not(.hidden)');
    if (modalObert) { closeModal(modalObert.id); return; }
    clearAllTokens();
  } else if (e.key === ' ') {
    e.preventDefault();
    shuffleOuterHexagons();
  } else if (e.key === 'ArrowLeft') {
    moveCursor(-1);
  } else if (e.key === 'ArrowRight') {
    moveCursor(1);
  } else if (e.key === 'Enter') {
    handleSubmit();
  } else if (['+', '-', '*', '/'].includes(e.key)) {
    const mapOp = { '+': '+', '-': '−', '*': '×', '/': '÷' };
    appendChar(mapOp[e.key]);
  } else if (e.key === '(' || e.key === ')') {
    appendChar(e.key);
  } else if (!isNaN(e.key) && e.key !== ' ') {
    const val = parseInt(e.key, 10);
    if (DAILY_GAME && val === DAILY_GAME.center && !usedNumbers.has(val)) {
      handleHexCenterClick();
    } else {
      const idx = outerPositions.findIndex((v) => v === val && !usedNumbers.has(v));
      if (idx !== -1) handleHexClick(idx);
    }
  }
});

async function handleSubmit() {
  if (!tokens || tokens.length === 0) {
    triggerShakeDisplay();
    showToast("Escriu una operació primer", "warning");
    return;
  }
  if (DAILY_GAME && DAILY_GAME.data !== getCurrentMadridDateShort()) {
    await initUI();
    showToast("S'ha carregat el nou repte d'avui!", "warning");
    return;
  }
  const ultimToken = tokens[tokens.length - 1];
  if (ultimToken && ultimToken.type === 'op' && ultimToken.val !== ')') {
    triggerShakeDisplay();
    showToast("L'operació està incompleta!", "warning");
    return;
  }
  const oberts = tokens.filter(t => t.val === '(').length;
  const tancats = tokens.filter(t => t.val === ')').length;
  if (oberts > tancats && ultimToken && (ultimToken.type === 'num' || ultimToken.val === ')')) {
    for (let i = 0; i < oberts - tancats; i++) tokens.push({ type: 'op', val: ')', display: ')', id: null });
    cursorIndex = tokens.length;
    updateDisplay();
  }
  const digitsUsats = tokens.filter(t => t.type === 'num').length;
  if (digitsUsats < 2) {
    triggerShakeDisplay();
    showToast("Cal combinar almenys dues xifres!", "warning");
    return;
  }
  const usaCentreLocal = tokens.some(t => t.id === 'hex-center' || (t.type === 'num' && t.val === String(DAILY_GAME.center)));
  if (!usaCentreLocal) {
    triggerShakeDisplay();
    showToast(`Cal fer servir el dígit central (${DAILY_GAME.center})!`, "warning");
    return;
  }

  const rawExpr = tokens.map(t => t.val).join('');
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${API_URL}api/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expressio: rawExpr })
    });
    if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
    const data = await res.json();
    const displayContainer = document.getElementById('display-container');

    if (!data.ok) {
      triggerShakeDisplay();
      showToast(data.msg || "Operació no vàlida", "error");
      return;
    }

    const expressioDisplay = tokens.map(t => t.display).join(' ');
    const expressioNeta = rawExpr.replace(/\s+/g, '');
    const jaExisteix = gameState.solutions.some(s => {
      const sExpr = (s.raw || s.expression || '').replace(/\s+/g, '');
      if (sExpr === expressioNeta || s.expression === expressioDisplay) return true;
      if (data.canonic && typeof data.canonic === 'string' && data.canonic !== 'tuti' && s.canonic === data.canonic) return true;
      return false;
    });

    if (jaExisteix) {
      triggerShakeDisplay();
      showToast("Ja havies trobat aquesta operació!", "warning");
      return;
    }

    if (displayContainer) {
      displayContainer.classList.add('animate-pop', 'text-emerald-500', 'border-emerald-400', 'bg-emerald-50', 'dark:bg-emerald-950/30');
      setTimeout(() => displayContainer.classList.remove('animate-pop', 'text-emerald-500', 'border-emerald-400', 'bg-emerald-50', 'dark:bg-emerald-950/30'), 500);
    }

    const puntsGuanyats = Number(data.punts) || 1;
    const esTutiReal = !!(data.esTuti || data.tuti || digitsUsats === 7);
    const rangAnterior = document.getElementById('rank-label').innerText;

    gameState.solutions.push({
      expression: expressioDisplay, raw: expressioNeta,
      canonic: data.canonic || rawExpr, points: puntsGuanyats, esTuti: esTutiReal
    });
    gameState.score += puntsGuanyats;

    try { persistProgress(); } catch (e) {}
    try { updateScoreboard(); } catch (e) {}

    const nouRang = document.getElementById('rank-label').innerText;
    if (esTutiReal) {
      if (typeof confetti === 'function') try { confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }); } catch (e) {}
      showToast(`🌟 TUTI! Tots els nombres usats! +${puntsGuanyats} pts`, "success");
    } else if (rangAnterior !== nouRang && (nouRang.includes("Geni") || nouRang.includes("Euler"))) {
      if (typeof confetti === 'function') try { confetti({ particleCount: 70, spread: 60, origin: { y: 0.65 } }); } catch (e) {}
      showToast(`🎉 Nou nivell desbloquejat: ${nouRang}! (+${puntsGuanyats} pts)`, "success");
    } else {
      showToast(`Correcte! +${puntsGuanyats} pts`, "success");
    }

    tokens = [];
    cursorIndex = 0;
    clearTokensSession();
    renderOuterHexagons();
    updateDisplay();
  } catch (err) {
    triggerShakeDisplay();
    showToast("Sense connexió. Comprova la xarxa per validar", "error");
  } finally {
    submitBtn.disabled = false;
  }
}

function updateScoreboard() {
  const trobades = gameState.solutions.length;
  const objectiu = (DAILY_GAME && DAILY_GAME.total) ? DAILY_GAME.total : 22;
  const solCountEl = document.getElementById('solutions-count');
  const solBoxEl = document.getElementById('solutions-box');
  const solTargetDisplay = document.getElementById('solutions-target-display');

  if (solCountEl) solCountEl.innerText = trobades;
  const totalSolEl = document.getElementById('total-solutions-count');
  if (totalSolEl) totalSolEl.innerText = objectiu;
  const scoreCounter = document.getElementById('score-counter');
  if (scoreCounter) scoreCounter.innerText = gameState.score;

  const pctReal = objectiu ? Math.round((trobades / objectiu) * 100) : 0;
  const pctBarra = Math.min(pctReal, 100);

  const rankBar = document.getElementById('rank-bar');
  const rankKnob = document.getElementById('rank-knob');
  if (rankBar) rankBar.style.width = `${pctBarra}%`;
  if (rankKnob) rankKnob.style.left = `${pctBarra}%`;

  const m50 = document.getElementById('milestone-50');
  const m100 = document.getElementById('milestone-100');
  const isEuler = trobades > objectiu;

  if (m50) {
    if (pctReal >= 50) m50.className = `absolute left-1/2 -translate-x-1/2 w-1.5 h-3.5 rounded-full shadow-sm transition-colors ${isEuler ? 'bg-amber-400' : 'bg-brand-red dark:bg-rose-400'}`;
    else m50.className = "absolute left-1/2 -translate-x-1/2 w-1 h-3 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-300 dark:border-slate-600 transition-colors";
  }
  
  if (m100) {
    if (pctReal >= 100) m100.className = `absolute right-0.5 w-1.5 h-3.5 rounded-full shadow-sm transition-colors ${isEuler ? 'bg-amber-400' : 'bg-brand-red dark:bg-rose-400'}`;
    else m100.className = "absolute right-0.5 w-1 h-3 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-300 dark:border-slate-600 transition-colors";
  }

  if (isEuler) {
    if (rankBar) {
      rankBar.classList.remove('from-brand-red', 'to-rose-400', 'shadow-[0_0_8px_rgba(230,57,70,0.6)]');
      rankBar.classList.add('from-amber-400', 'to-yellow-400', 'shadow-[0_0_12px_rgba(251,191,36,0.8)]');
    }
    if (rankKnob) {
      rankKnob.classList.remove('bg-slate-800', 'dark:bg-white', 'border-white', 'dark:border-slate-800');
      rankKnob.classList.add('bg-amber-400', 'border-amber-200', 'shadow-[0_0_10px_rgba(251,191,36,0.8)]');
    }
  } else {
    if (rankBar) {
      rankBar.classList.add('from-brand-red', 'to-rose-400', 'shadow-[0_0_8px_rgba(230,57,70,0.6)]');
      rankBar.classList.remove('from-amber-400', 'to-yellow-400', 'shadow-[0_0_12px_rgba(251,191,36,0.8)]');
    }
    if (rankKnob) {
      rankKnob.classList.add('bg-slate-800', 'dark:bg-white', 'border-white', 'dark:border-slate-800');
      rankKnob.classList.remove('bg-amber-400', 'border-amber-200', 'shadow-[0_0_10px_rgba(251,191,36,0.8)]');
    }
  }

  const baseBoxClasses = "group flex flex-col items-center justify-center px-1 rounded-xl transition-all cursor-pointer select-none active:scale-95";
  let rangText = "Principiant";
  let hintText = "";

  if (isEuler) {
    rangText = "Euler ✨";
    const extra = trobades - objectiu;
    hintText = `✨ Has superat el repte amb <strong>+${extra} solucions extres</strong>! Ets al màxim nivell <strong>Euler</strong>!`;
    if (solBoxEl) solBoxEl.className = `${baseBoxClasses} bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 hover:bg-amber-100/60 dark:hover:bg-amber-900/50`;
    if (solCountEl) solCountEl.className = "text-2xl sm:text-3xl font-black text-amber-500 font-mono";
    if (solTargetDisplay) solTargetDisplay.innerHTML = `<span class="text-[11px] text-amber-600 dark:text-amber-400 font-extrabold ml-1">(+${extra})</span>`;
  } else if (pctReal >= 100) {
    rangText = "Geni 🎓";
    hintText = `🎉 Has completat l'objectiu diari! Troba <strong>1 solució més</strong> per desbloquejar el rang secret <strong>Euler ✨</strong>.`;
    if (solBoxEl) solBoxEl.className = `${baseBoxClasses} bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/50`;
    if (solCountEl) solCountEl.className = "text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono";
    if (solTargetDisplay) solTargetDisplay.innerHTML = `/ ${objectiu}+`;
  } else if (pctReal >= 50) {
    rangText = "Mestre/a 🎖";
    hintText = `🎖️ Molt bé! Et falten només <strong>${objectiu - trobades} solucions</strong> per assolir el nivell <strong>Geni 🎓</strong>.`;
    if (solBoxEl) solBoxEl.className = `${baseBoxClasses} hover:bg-slate-50 dark:hover:bg-slate-700/40`;
    if (solCountEl) solCountEl.className = "text-2xl sm:text-3xl font-black text-brand-red font-mono";
    if (solTargetDisplay) solTargetDisplay.innerHTML = `/ ${objectiu}+`;
  } else {
    hintText = `🎯 Et falten <strong>${Math.ceil(objectiu * 0.5) - trobades} solucions</strong> per arribar al rang <strong>Mestre/a 🎖</strong>.`;
    if (solBoxEl) solBoxEl.className = `${baseBoxClasses} hover:bg-slate-50 dark:hover:bg-slate-700/40`;
    if (solCountEl) solCountEl.className = "text-2xl sm:text-3xl font-black text-brand-red font-mono";
    if (solTargetDisplay) solTargetDisplay.innerHTML = `/ ${objectiu}+`;
  }

  const rankLabel = document.getElementById('rank-label');
  if (rankLabel) {
    rankLabel.innerText = rangText;
    if (isEuler) {
      rankLabel.classList.remove('text-brand-red');
      rankLabel.classList.add('text-amber-500');
    } else {
      rankLabel.classList.add('text-brand-red');
      rankLabel.classList.remove('text-amber-500');
    }
  }
  
  const hintEl = document.getElementById('solutions-target-hint');
  if (hintEl) hintEl.innerHTML = hintText;
  const pillShareText = document.getElementById('pill-share-text');
  if (pillShareText) pillShareText.textContent = `Comparteix [${trobades}/${objectiu}+]`;

  const tutisCount = gameState.solutions.filter(s => s.esTuti === true).length;
  const tutiBadge = document.getElementById('tuti-badge');
  const tutiCountEl = document.getElementById('tuti-count');
  
  if (tutiBadge && tutiCountEl) {
    if (tutisCount > 0) {
      tutiBadge.classList.add('actiu', 'tuti-animacio');
      tutiCountEl.innerText = `x${tutisCount}`;
      setTimeout(() => tutiBadge.classList.remove('tuti-animacio'), 650);
    } else {
      tutiBadge.classList.remove('actiu');
      tutiCountEl.innerText = '';
    }
  }

  const listContainer = document.getElementById('solutions-list-container');
  if (listContainer) {
    listContainer.innerHTML = '';
    if (gameState.solutions.length === 0) {
      listContainer.innerHTML = '<p class="text-center text-slate-500 dark:text-slate-400 py-3 text-xs">Encara no has trobat cap solució avui.</p>';
    } else {
      gameState.solutions.slice().reverse().forEach((sol) => {
        const item = document.createElement('div');
        item.className = "p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-xs font-mono flex justify-between items-center";
        item.innerHTML = `<span>${sol.expression} = ${DAILY_GAME ? DAILY_GAME.target : ''} ${sol.esTuti ? '🌟' : ''}</span><span class="text-brand-red font-bold">+${sol.points}</span>`;
        listContainer.appendChild(item);
      });
    }
  }
}

function clickTutiBadge() {
  const tutisCount = gameState.solutions.filter(s => s.esTuti === true).length;
  if (tutisCount === 0) showToast("🌟 Troba una fórmula que empri els 7 dígits alhora!", "warning");
  else if (tutisCount === 1) showToast("🌟 Portes 1 Tuti descobert! Impressionant!", "success");
  else showToast(`🌟 Portes ${tutisCount} Tutis descoberts! Impressionant!`, "success");
}

function renderYesterday(data) {
  document.getElementById('yesterday-target').innerText = data.target || '--';
  document.getElementById('yesterday-center').innerText = data.center || '--';
  const list = document.getElementById('yesterday-list-container');
  list.innerHTML = '';
  
  const solucions = data.solucions || [];
  const tutisSet = new Set(data.tutis || []);

  if (solucions.length === 0) {
    list.innerHTML = '<p class="text-center text-slate-500 dark:text-slate-400 py-4">No hi ha solucions registrades per ahir.</p>';
  } else {
    solucions.forEach((expr, idx) => {
      const esTuti = tutisSet.has(expr);
      const item = document.createElement('div');
      item.className = esTuti ? "p-2 bg-amber-50/90 dark:bg-amber-950/35 rounded-lg border border-amber-300 dark:border-amber-800/70 flex justify-between items-center" : "p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between items-center";
      item.innerHTML = `<span><span class="text-slate-400 text-[10px] mr-1">#${idx + 1}</span> ${expr} ${esTuti ? '🌟' : ''}</span> <strong>= ${data.target}</strong>`;
      list.appendChild(item);
    });
  }
  openModal('yesterday-modal');
}

async function openYesterdayModal() {
  try {
    const res = await fetch(`${API_URL}api/ahir?t=${Date.now()}`, { cache: 'no-store' });
    renderYesterday(await res.json());
  } catch (err) {
    showToast("Error carregant les solucions d'ahir", "error");
  }
}

function updateCountdown() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const diff = tomorrow - now;
  
  if (diff <= 0) {
    const el = document.getElementById('countdown-timer');
    if (el) el.innerText = "00:00:00";
    closeModal('share-modal');
    initUI();
    showToast("Nou repte del Matelògic disponible!", "success");
    return;
  }
  
  const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
  const el = document.getElementById('countdown-timer');
  if (el) el.innerText = `${h}:${m}:${s}`;
}

function openModal(id) {
  document.body.classList.add('overflow-hidden');
  if (id === 'share-modal') {
    const trobades = gameState.solutions.length;
    const total = DAILY_GAME ? DAILY_GAME.total : 22;
    document.getElementById('share-modal-num').innerText = `#${DAILY_GAME ? DAILY_GAME.num : '001'}`;
    document.getElementById('share-modal-target').innerText = DAILY_GAME ? DAILY_GAME.target : 0;
    document.getElementById('share-modal-count').innerText = trobades;
    document.getElementById('share-modal-total').innerText = total;
    document.getElementById('share-modal-rank').innerText = document.getElementById('rank-label').innerText;
    
    updateCountdown();
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(updateCountdown, 1000);
  }
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  if (!window.duelState || !window.duelState.active) {
    document.body.classList.remove('overflow-hidden');
  }
  if (id === 'share-modal' && countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  document.getElementById(id).classList.add('hidden');
}

async function copyShareText() {
  const trobades = gameState.solutions.length;
  const objectiu = (DAILY_GAME && DAILY_GAME.total) ? DAILY_GAME.total : 22;
  const pctReal = objectiu ? Math.round((trobades / objectiu) * 100) : 0;
  const plens = Math.min(5, Math.floor(pctReal / 20));
  const buits = Math.max(0, 5 - plens);
  const tutisCount = gameState.solutions.filter(s => s.esTuti === true).length;
  
  let liniaTuti = '';
  if (tutisCount > 1) liniaTuti = `\n🌟 ${tutisCount} TUTIS DESCOBERTS!`;
  else if (tutisCount === 1) liniaTuti = '\n🌟 TUTI DESCOBERT!';

  const shareText = `Matelògic #${DAILY_GAME ? DAILY_GAME.num : '001'} ⬡\n` +
                    `🎯 Objectiu: ${DAILY_GAME ? DAILY_GAME.target : '--'}\n` +
                    `🎖 Rang: ${document.getElementById('rank-label').innerText}\n` +
                    `📊 Progrés: ${'🟥'.repeat(plens) + '⬜'.repeat(buits)} ${pctReal}%\n` +
                    `✨ Solucions: ${trobades} (${objectiu}+)${liniaTuti}\n\n` +
                    `T'atreveixes a superar-me? 🤔\n👉 https://www.matelogic.cat`;

  if (navigator.share) {
    try {
      await navigator.share({ title: `Matelògic #${DAILY_GAME ? DAILY_GAME.num : '001'}`, text: shareText });
      return;
    } catch (e) {}
  }
  try {
    await navigator.clipboard.writeText(shareText);
    showToast("Resultat copiat al porta-retalls!", "success");
  } catch (e) {
    showToast("No s'ha pogut copiar", "error");
  }
}

function showToast(msg, tipus) {
  const cont = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `px-4 py-2 rounded-full text-xs font-bold text-white shadow-lg ${tipus === 'error' ? 'bg-red-600' : tipus === 'warning' ? 'bg-amber-500' : 'bg-emerald-600'}`;
  t.innerText = msg;
  cont.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
