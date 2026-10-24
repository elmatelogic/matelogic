let duelConfig = { rusc: 'avui', temps: 45, rondes: 3, mode: 'local' };
let duelTimerId = null;
let duelTurnDeadline = 0;

let duelState = {
  active: false,
  game: null,
  outer: [],
  turn: 0,
  totalTurns: 6,
  currentRound: 1,
  timerSec: 45,
  timerInterval: null,
  blau: { score: 0, solutions: [] },
  vermell: { score: 0, solutions: [] },
  usedCanonics: new Set(),
  tokens: [],
  cursorIndex: 0,
  usedNumbers: new Set(),
  isRemote: false
};

window.duelState = duelState;

function initDuelLocal() {
  setupDuelDeleteEvents();
  setupDuelKeyEvents();
}

function stopDuelTimer() {
  if (duelTimerId !== null) {
    clearInterval(duelTimerId);
    duelTimerId = null;
  }
  if (duelState && duelState.timerInterval) {
    clearInterval(duelState.timerInterval);
    duelState.timerInterval = null;
  }
}

function openDuelSetup() {
  stopDuelTimer();
  openModal('duel-setup-modal');
}

function setDuelRusc(tipus) {
  duelConfig.rusc = tipus;
  const btnAvui = document.getElementById('duel-opt-rusc-avui');
  const btnAtzar = document.getElementById('duel-opt-rusc-atzar');
  const activeCls = "py-2 px-3 rounded-xl border-2 border-brand-red bg-red-50 dark:bg-red-950/40 text-brand-red font-bold text-xs transition-all";
  const inactiveCls = "py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs transition-all";
  if (tipus === 'avui') {
    btnAvui.className = activeCls;
    btnAtzar.className = inactiveCls;
  } else {
    btnAtzar.className = activeCls;
    btnAvui.className = inactiveCls;
  }
}

function setDuelTemps(segons) {
  duelConfig.temps = segons;
  [30, 45, 60, 0].forEach(val => {
    const btn = document.getElementById(`duel-opt-temps-${val}`);
    if (!btn) return;
    const isSense = val === 0;
    if (val === segons) {
      btn.className = `py-2 rounded-xl border-2 border-brand-red bg-red-50 dark:bg-red-950/40 text-brand-red ${isSense ? 'font-bold text-[11px]' : 'font-mono font-bold text-xs'} transition-all`;
    } else {
      btn.className = `py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 ${isSense ? 'font-bold text-[11px]' : 'font-mono font-bold text-xs'} transition-all`;
    }
  });
}

function setDuelRondes(rondes) {
  duelConfig.rondes = rondes;
  const activeCls = "py-2 px-3 rounded-xl border-2 border-brand-red bg-red-50 dark:bg-red-950/40 text-brand-red font-bold text-xs transition-all";
  const inactiveCls = "py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs transition-all";
  [3, 5].forEach(val => {
    const btn = document.getElementById(`duel-opt-rondes-${val}`);
    if (!btn) return;
    btn.className = (val === rondes) ? activeCls : inactiveCls;
  });
}

function generarRuscAleatoriLocal() {
  const TARGETS_DUEL = [
    24, 27, 28, 31, 33, 35, 36, 37, 38, 40,
    42, 45, 48, 49, 50, 52, 54, 56, 58, 60,
    62, 63, 64, 65, 68, 70, 72, 75, 76, 80,
    81, 84, 85, 88, 90, 92, 95, 96, 99, 100
  ];
  const target = TARGETS_DUEL[Math.floor(Math.random() * TARGETS_DUEL.length)];
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return {
    target: target,
    center: digits[0],
    outer: digits.slice(1, 7)
  };
}

function startDuelGame() {
  stopDuelTimer();
  closeModal('duel-setup-modal');
  closeModal('duel-winner-modal');

  let gameData;
  let ruscTitle = "Rusc a l'atzar";
  if (duelConfig.rusc === 'avui' && typeof DAILY_GAME !== 'undefined' && DAILY_GAME) {
    gameData = {
      target: DAILY_GAME.target,
      center: DAILY_GAME.center,
      outer: [...DAILY_GAME.outer]
    };
    ruscTitle = `Repte Núm. ${DAILY_GAME.num}`;
  } else {
    gameData = generarRuscAleatoriLocal();
  }

  duelState = {
    active: true,
    game: gameData,
    outer: [...gameData.outer],
    turn: 0,
    totalTurns: duelConfig.rondes * 2,
    currentRound: 1,
    timerSec: duelConfig.temps,
    timerInterval: null,
    blau: { score: 0, solutions: [] },
    vermell: { score: 0, solutions: [] },
    usedCanonics: new Set(),
    tokens: [],
    cursorIndex: 0,
    usedNumbers: new Set(),
    isRemote: false
  };
  window.duelState = duelState;

  document.getElementById('duel-rusc-label').textContent = ruscTitle;
  document.getElementById('duel-target-val').textContent = duelState.game.target;
  document.getElementById('duel-center-val').textContent = duelState.game.center;
  document.getElementById('duel-round-total').textContent = duelConfig.rondes;

  document.getElementById('duel-screen').classList.remove('hidden');
  document.body.classList.add('overflow-hidden');

  updateDuelScoreboard();
  startDuelTurn();
}

function syncDuelUsedNumbers() {
  duelState.usedNumbers.clear();
  duelState.tokens.forEach(t => {
    if (t.type === 'num') {
      duelState.usedNumbers.add(parseInt(t.val, 10));
    }
  });
}

function startDuelTurn() {
  stopDuelTimer();

  duelState.tokens = [];
  duelState.cursorIndex = 0;
  duelState.usedNumbers.clear();
  updateDuelDisplay();
  renderDuelHexagons();

  duelState.currentRound = Math.floor(duelState.turn / 2) + 1;
  const isBlau = (duelState.turn % 2 === 0);

  document.getElementById('duel-round-current').textContent = duelState.currentRound;

  const turnIndicator = document.getElementById('duel-turn-indicator');
  const boxBlau = document.getElementById('duel-box-blau');
  const boxVermell = document.getElementById('duel-box-vermell');
  const badgeBlau = document.getElementById('duel-badge-turn-blau');
  const badgeVermell = document.getElementById('duel-badge-turn-vermell');

  const baseCardCls = "col-span-1 lg:col-span-3 bg-white dark:bg-slate-800 border-2 border-slate-200/90 dark:border-slate-700/80 rounded-2xl p-3 sm:p-4 shadow-sm transition-all duration-300 flex flex-col justify-between";

  if (isBlau) {
    turnIndicator.textContent = "Torn: Equip Blau";
    turnIndicator.className = "font-extrabold text-brand-blueDark dark:text-brand-blue";
    boxBlau.className = `${baseCardCls} order-1 lg:order-1 duel-halo-blau`;
    boxVermell.className = `${baseCardCls} order-2 lg:order-3 opacity-60`;
    badgeBlau.classList.remove('hidden');
    badgeVermell.classList.add('hidden');
  } else {
    turnIndicator.textContent = "Torn: Equip Vermell";
    turnIndicator.className = "font-extrabold text-brand-red";
    boxVermell.className = `${baseCardCls} order-2 lg:order-3 duel-halo-vermell`;
    boxBlau.className = `${baseCardCls} order-1 lg:order-1 opacity-60`;
    badgeVermell.classList.remove('hidden');
    badgeBlau.classList.add('hidden');
  }

  const timerVal = document.getElementById('duel-timer-val');

  if (duelConfig.temps === 0) {
    timerVal.textContent = "∞";
    timerVal.className = "text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono";
  } else {
    duelTurnDeadline = Date.now() + (duelConfig.temps * 1000);
    duelState.timerSec = duelConfig.temps;
    timerVal.textContent = `${duelState.timerSec}s`;
    timerVal.className = "text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono";

    duelTimerId = setInterval(() => {
      if (!duelState.active) {
        stopDuelTimer();
        return;
      }

      const restantMs = duelTurnDeadline - Date.now();
      const segonsRestants = Math.max(0, Math.ceil(restantMs / 1000));

      if (segonsRestants !== duelState.timerSec) {
        duelState.timerSec = segonsRestants;
        timerVal.textContent = `${segonsRestants}s`;
        if (segonsRestants <= 10) {
          timerVal.className = "text-2xl sm:text-3xl font-black text-brand-red font-mono";
        }
      }

      if (restantMs <= 0) {
        stopDuelTimer();
        showToast("Temps esgotat! Canvi de torn", "warning");
        advanceDuelTurn();
      }
    }, 200);
  }
}

function advanceDuelTurn() {
  stopDuelTimer();
  duelState.turn++;
  if (duelState.turn >= duelState.totalTurns) {
    finishDuelGame();
  } else {
    startDuelTurn();
  }
}

function duelPassTurn() {
  if (!duelState.active) return;
  if (duelState.isRemote) {
    if (typeof canInteractRemote === 'function' && !canInteractRemote()) return;
    showToast("Torn passat", "warning");
    if (typeof sendSocketAction === 'function') sendSocketAction('PASS');
    return;
  }
  showToast("Torn passat", "warning");
  advanceDuelTurn();
}

function finishDuelGame() {
  stopDuelTimer();
  duelState.active = false;

  const blau = duelState.blau.score;
  const vermell = duelState.vermell.score;

  document.getElementById('duel-final-score-blau').textContent = blau;
  document.getElementById('duel-final-score-vermell').textContent = vermell;

  const title = document.getElementById('duel-winner-title');
  const subtitle = document.getElementById('duel-winner-subtitle');

  if (blau > vermell) {
    title.textContent = "Victòria de l'Equip Blau!";
    title.className = "text-lg font-black text-brand-blueDark dark:text-brand-blue";
    subtitle.textContent = `Ha superat l'Equip Vermell per ${blau} a ${vermell} punts.`;
  } else if (vermell > blau) {
    title.textContent = "Victòria de l'Equip Vermell!";
    title.className = "text-lg font-black text-brand-red";
    subtitle.textContent = `Ha superat l'Equip Blau per ${vermell} a ${blau} punts.`;
  } else {
    title.textContent = "Empat matemàtic!";
    title.className = "text-lg font-black text-amber-500";
    subtitle.textContent = `Tots dos equips han empatat a ${blau} punts.`;
  }

  if ((blau > 0 || vermell > 0) && typeof confetti === 'function') {
    try { confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }); } catch (e) {}
  }

  openModal('duel-winner-modal');
}

function exitDuelConfirm() {
  if (!duelState.active || (duelState.blau.score === 0 && duelState.vermell.score === 0 && duelState.turn === 0)) {
    exitDuel();
    return;
  }
  if (confirm("Vols sortir del duel actual i tornar al joc individual?")) {
    exitDuel();
  }
}

function exitDuel() {
  stopDuelTimer();
  duelState.active = false;
  document.getElementById('duel-screen').classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

function updateDuelScoreboard() {
  document.getElementById('duel-score-blau').textContent = duelState.blau.score;
  document.getElementById('duel-score-vermell').textContent = duelState.vermell.score;
  document.getElementById('duel-count-blau').textContent = duelState.blau.solutions.length;
  document.getElementById('duel-count-vermell').textContent = duelState.vermell.solutions.length;

  const listB = document.getElementById('duel-list-blau');
  const listV = document.getElementById('duel-list-vermell');

  if (duelState.blau.solutions.length === 0) {
    listB.innerHTML = '<p class="text-slate-400 dark:text-slate-500 text-[11px] font-sans py-1">Cap operació resolta</p>';
  } else {
    listB.innerHTML = duelState.blau.solutions.slice().reverse().map(sol => `
      <div class="p-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg flex justify-between items-center gap-1">
        <span class="truncate">${sol.expression} ${sol.esTuti ? '🌟' : ''}</span>
        <span class="text-brand-blueDark dark:text-brand-blue font-bold shrink-0">+${sol.points}</span>
      </div>
    `).join('');
  }

  if (duelState.vermell.solutions.length === 0) {
    listV.innerHTML = '<p class="text-slate-400 dark:text-slate-500 text-[11px] font-sans py-1">Cap operació resolta</p>';
  } else {
    listV.innerHTML = duelState.vermell.solutions.slice().reverse().map(sol => `
      <div class="p-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg flex justify-between items-center gap-1">
        <span class="truncate">${sol.expression} ${sol.esTuti ? '🌟' : ''}</span>
        <span class="text-brand-red font-bold shrink-0">+${sol.points}</span>
      </div>
    `).join('');
  }
}

function renderDuelHexagons() {
  syncDuelUsedNumbers();
  duelState.outer.forEach((val, idx) => {
    const btn = document.getElementById(`duel-hex-${idx}`);
    if (btn) {
      btn.textContent = val;
      if (duelState.usedNumbers.has(val)) {
        btn.classList.add('used');
      } else {
        btn.classList.remove('used');
      }
    }
  });
  const cBtn = document.getElementById('duel-hex-center');
  if (cBtn && duelState.game) {
    if (duelState.usedNumbers.has(duelState.game.center)) {
      cBtn.classList.add('used');
    } else {
      cBtn.classList.remove('used');
    }
  }
}

function shuffleDuelHexagons() {
  for (let i = duelState.outer.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [duelState.outer[i], duelState.outer[j]] = [duelState.outer[j], duelState.outer[i]];
  }
  renderDuelHexagons();
}

function triggerShakeDuelDisplay() {
  const displayEl = document.getElementById('duel-display-container');
  if (displayEl) {
    displayEl.classList.remove('animate-shake');
    void displayEl.offsetWidth;
    displayEl.classList.add('animate-shake');
    setTimeout(() => displayEl.classList.remove('animate-shake'), 360);
  }
}

function updateDuelDisplay() {
  const container = document.getElementById('duel-display-tokens');
  container.innerHTML = '';

  const oberts = duelState.tokens.filter(t => t.val === '(').length;
  const tancats = duelState.tokens.filter(t => t.val === ')').length;
  const pendents = Math.max(0, oberts - tancats);

  const totalChars = duelState.tokens.reduce((acc, t) => acc + t.display.length, 0) + duelState.tokens.length + pendents;
  if (totalChars > 16) {
    container.className = "flex items-center min-w-full justify-center text-base sm:text-lg transition-all";
  } else if (totalChars > 11) {
    container.className = "flex items-center min-w-full justify-center text-lg sm:text-xl transition-all";
  } else {
    container.className = "flex items-center min-w-full justify-center text-2xl sm:text-3xl transition-all";
  }

  const cursorSpan = document.createElement('span');
  cursorSpan.id = "duel-display-cursor-el";
  cursorSpan.className = "w-2 h-6 bg-brand-red rounded-xs cursor-blink mx-0.5 inline-block shrink-0";

  for (let i = 0; i <= duelState.tokens.length; i++) {
    if (i === duelState.cursorIndex) {
      container.appendChild(cursorSpan);
    }
    if (i < duelState.tokens.length) {
      const t = duelState.tokens[i];
      const span = document.createElement('span');
      span.innerText = t.display;
      span.className = "px-1 py-0.5 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors";
      span.onclick = (e) => {
        e.stopPropagation();
        setDuelCursorPosition(i + 1);
      };
      container.appendChild(span);
    }
  }

  if (pendents > 0 && duelState.tokens.length > 0) {
    const ghostSpan = document.createElement('span');
    ghostSpan.innerText = ')'.repeat(pendents);
    ghostSpan.title = "Toca per tancar el parèntesi";
    ghostSpan.className = "px-1 py-0.5 text-slate-300 dark:text-slate-600 cursor-pointer hover:text-slate-400 transition-colors select-none";
    ghostSpan.onclick = (e) => {
      e.stopPropagation();
      setDuelCursorPosition(duelState.tokens.length);
      appendDuelChar(')');
    };
    container.appendChild(ghostSpan);
  }

  setTimeout(() => {
    const cEl = document.getElementById('duel-display-cursor-el');
    if (cEl) {
      cEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, 10);

  if (typeof syncRemoteInputLive === 'function') {
    syncRemoteInputLive();
  }
}

function setDuelCursorPosition(newPos) {
  duelState.cursorIndex = Math.max(0, Math.min(newPos, duelState.tokens.length));
  updateDuelDisplay();
}

function moveDuelCursor(delta) {
  setDuelCursorPosition(duelState.cursorIndex + delta);
}

function handleDuelDisplayClick(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  if (clickX < rect.width / 3) {
    setDuelCursorPosition(0);
  } else {
    setDuelCursorPosition(duelState.tokens.length);
  }
}

function appendDuelChar(char) {
  if (!duelState.active) return;
  const prevToken = duelState.cursorIndex > 0 ? duelState.tokens[duelState.cursorIndex - 1] : null;
  const nextToken = duelState.cursorIndex < duelState.tokens.length ? duelState.tokens[duelState.cursorIndex] : null;

  if (char === '(') {
    if (prevToken && (prevToken.type === 'num' || prevToken.val === ')')) {
      triggerShakeDuelDisplay();
      return showToast("Cal un operador abans del parèntesi!", "warning");
    }
  }

  if (char === ')') {
    if (!prevToken || (prevToken.type === 'op' && prevToken.val !== ')')) {
      triggerShakeDuelDisplay();
      return showToast("Operació incompleta abans de tancar parèntesi", "warning");
    }
    const oberts = duelState.tokens.filter(t => t.val === '(').length;
    const tancats = duelState.tokens.filter(t => t.val === ')').length;
    if (oberts <= tancats) {
      triggerShakeDuelDisplay();
      return showToast("No hi ha cap parèntesi per tancar!", "warning");
    }
  }

  if (['+', '−', '×', '÷'].includes(char)) {
    let rawChar = char;
    if (char === '×') rawChar = '*';
    if (char === '÷') rawChar = '/';
    if (char === '−') rawChar = '-';

    if (prevToken && prevToken.type === 'op' && prevToken.val !== '(' && prevToken.val !== ')') {
      duelState.tokens[duelState.cursorIndex - 1] = { type: 'op', val: rawChar, display: char, id: null };
      updateDuelDisplay();
      return;
    }

    if (nextToken && nextToken.type === 'op' && nextToken.val !== '(' && nextToken.val !== ')') {
      duelState.tokens[duelState.cursorIndex] = { type: 'op', val: rawChar, display: char, id: null };
      duelState.cursorIndex++;
      updateDuelDisplay();
      return;
    }

    if (!prevToken || prevToken.val === '(') {
      triggerShakeDuelDisplay();
      return showToast("Posa primer un número!", "warning");
    }
  }

  let raw = char;
  if (char === '×') raw = '*';
  if (char === '÷') raw = '/';
  if (char === '−') raw = '-';

  duelState.tokens.splice(duelState.cursorIndex, 0, { type: 'op', val: raw, display: char, id: null });
  duelState.cursorIndex++;
  updateDuelDisplay();
}

function handleDuelHexClick(index) {
  if (!duelState.active) return;
  const val = duelState.outer[index];
  if (duelState.usedNumbers.has(val)) return;

  const prevToken = duelState.cursorIndex > 0 ? duelState.tokens[duelState.cursorIndex - 1] : null;
  const nextToken = duelState.cursorIndex < duelState.tokens.length ? duelState.tokens[duelState.cursorIndex] : null;

  if (nextToken && nextToken.type === 'num') {
    duelState.tokens[duelState.cursorIndex] = { type: 'num', val: val.toString(), display: val.toString(), id: `duel-hex-${index}` };
    duelState.cursorIndex++;
    renderDuelHexagons();
    updateDuelDisplay();
    return;
  }

  if (prevToken && (prevToken.type === 'num' || prevToken.val === ')')) {
    triggerShakeDuelDisplay();
    return showToast("Cal un operador!", "warning");
  }
  if (nextToken && (nextToken.type === 'num' || nextToken.val === '(')) {
    triggerShakeDuelDisplay();
    return showToast("Cal un operador abans del número següent!", "warning");
  }

  duelState.tokens.splice(duelState.cursorIndex, 0, { type: 'num', val: val.toString(), display: val.toString(), id: `duel-hex-${index}` });
  duelState.cursorIndex++;
  renderDuelHexagons();
  updateDuelDisplay();
}

function handleDuelHexCenterClick() {
  if (!duelState.active) return;
  const val = duelState.game.center;
  if (duelState.usedNumbers.has(val)) return;

  const prevToken = duelState.cursorIndex > 0 ? duelState.tokens[duelState.cursorIndex - 1] : null;
  const nextToken = duelState.cursorIndex < duelState.tokens.length ? duelState.tokens[duelState.cursorIndex] : null;

  if (nextToken && nextToken.type === 'num') {
    duelState.tokens[duelState.cursorIndex] = { type: 'num', val: val.toString(), display: val.toString(), id: 'duel-hex-center' };
    duelState.cursorIndex++;
    renderDuelHexagons();
    updateDuelDisplay();
    return;
  }

  if (prevToken && (prevToken.type === 'num' || prevToken.val === ')')) {
    triggerShakeDuelDisplay();
    return showToast("Cal un operador!", "warning");
  }
  if (nextToken && (nextToken.type === 'num' || nextToken.val === '(')) {
    triggerShakeDuelDisplay();
    return showToast("Cal un operador abans del número següent!", "warning");
  }

  duelState.tokens.splice(duelState.cursorIndex, 0, { type: 'num', val: val.toString(), display: val.toString(), id: 'duel-hex-center' });
  duelState.cursorIndex++;
  renderDuelHexagons();
  updateDuelDisplay();
}

function handleDuelDelete() {
  if (!duelState.active || duelState.cursorIndex === 0) return;

  const prevToken = duelState.tokens[duelState.cursorIndex - 1];
  const tokenAbans = duelState.cursorIndex > 1 ? duelState.tokens[duelState.cursorIndex - 2] : null;
  const tokenDespres = duelState.cursorIndex < duelState.tokens.length ? duelState.tokens[duelState.cursorIndex] : null;

  if (prevToken && prevToken.type === 'op' && !['(', ')'].includes(prevToken.val)) {
    if (tokenAbans && tokenAbans.type === 'num' && tokenDespres && tokenDespres.type === 'num') {
      duelState.tokens.splice(duelState.cursorIndex - 1, 1);
      duelState.cursorIndex--;
      duelState.tokens.splice(duelState.cursorIndex - 1, 1);
      duelState.cursorIndex--;
      renderDuelHexagons();
      updateDuelDisplay();
      return;
    }
  }

  duelState.tokens.splice(duelState.cursorIndex - 1, 1);
  duelState.cursorIndex--;
  renderDuelHexagons();
  updateDuelDisplay();
}

function clearAllDuelTokens() {
  if (!duelState.active || duelState.tokens.length === 0) return;
  duelState.tokens = [];
  duelState.cursorIndex = 0;
  renderDuelHexagons();
  updateDuelDisplay();
  showToast("Operació buidada", "warning");
}

function setupDuelDeleteEvents() {
  const btn = document.getElementById('duel-delete-btn');
  if (!btn) return;
  let pressTimer = null;
  let isLongPress = false;

  const startPress = () => {
    isLongPress = false;
    pressTimer = setTimeout(() => {
      isLongPress = true;
      clearAllDuelTokens();
    }, 500);
  };

  const endPress = (e) => {
    clearTimeout(pressTimer);
    if (!isLongPress && e.type !== 'mouseleave') {
      handleDuelDelete();
    }
  };

  btn.addEventListener('mousedown', startPress);
  btn.addEventListener('mouseup', endPress);
  btn.addEventListener('mouseleave', () => clearTimeout(pressTimer));

  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startPress();
  }, { passive: false });

  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    endPress(e);
  }, { passive: false });
}

function setupDuelKeyEvents() {
  window.addEventListener('keydown', (e) => {
    if (['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) return;
    if (!duelState.active) return;

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (e.repeat) {
        clearAllDuelTokens();
      } else {
        handleDuelDelete();
      }
    } else if (e.key === 'Escape') {
      clearAllDuelTokens();
    } else if (e.key === ' ') {
      e.preventDefault();
      shuffleDuelHexagons();
    } else if (e.key === 'ArrowLeft') {
      moveDuelCursor(-1);
    } else if (e.key === 'ArrowRight') {
      moveDuelCursor(1);
    } else if (e.key === 'Enter') {
      submitDuelTurn();
    } else if (['+', '-', '*', '/'].includes(e.key)) {
      const mapOp = { '+': '+', '-': '−', '*': '×', '/': '÷' };
      appendDuelChar(mapOp[e.key]);
    } else if (e.key === '(' || e.key === ')') {
      appendDuelChar(e.key);
    } else if (!isNaN(e.key) && e.key !== ' ') {
      const val = parseInt(e.key, 10);
      if (duelState.game && val === duelState.game.center && !duelState.usedNumbers.has(val)) {
        handleDuelHexCenterClick();
      } else {
        const idx = duelState.outer.findIndex(v => v === val && !duelState.usedNumbers.has(v));
        if (idx !== -1) handleDuelHexClick(idx);
      }
    }
  });
}

function generarClauCommutativaLocal(expr) {
  let clean = expr.split('×').join('*').split('÷').join('/').split('−').join('-').split(' ').join('');
  const tks = [];
  let i = 0;
  while (i < clean.length) {
    const c = clean.charAt(i);
    if (c >= '0' && c <= '9') {
      let num = '';
      while (i < clean.length && clean.charAt(i) >= '0' && clean.charAt(i) <= '9') {
        num += clean.charAt(i);
        i++;
      }
      tks.push({ type: 'num', val: num });
      continue;
    }
    tks.push({ type: 'op', val: c });
    i++;
  }

  const outputQueue = [];
  const opStack = [];
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };

  for (let k = 0; k < tks.length; k++) {
    const t = tks[k];
    if (t.type === 'num') {
      outputQueue.push(t.val);
    } else if (t.val === '(') {
      opStack.push(t.val);
    } else if (t.val === ')') {
      while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
        outputQueue.push(opStack.pop());
      }
      opStack.pop();
    } else {
      while (
        opStack.length > 0 &&
        opStack[opStack.length - 1] !== '(' &&
        precedence[opStack[opStack.length - 1]] >= precedence[t.val]
      ) {
        outputQueue.push(opStack.pop());
      }
      opStack.push(t.val);
    }
  }

  while (opStack.length > 0) {
    outputQueue.push(opStack.pop());
  }

  const stack = [];
  for (let m = 0; m < outputQueue.length; m++) {
    const item = outputQueue[m];
    if (item !== '+' && item !== '-' && item !== '*' && item !== '/') {
      stack.push({ type: 'lit', str: item });
    } else {
      const b = stack.pop();
      const a = stack.pop();
      if (item === '+' || item === '-') {
        const aPos = a.type === 'add' ? a.pos : [a.str];
        const aNeg = a.type === 'add' ? a.neg : [];
        const bPos = b.type === 'add' ? b.pos : [b.str];
        const bNeg = b.type === 'add' ? b.neg : [];
        const pos = (item === '+' ? [...aPos, ...bPos] : [...aPos, ...bNeg]).sort();
        const neg = (item === '+' ? [...aNeg, ...bNeg] : [...aNeg, ...bPos]).sort();
        const str = `(+${pos.join(',')}|-${neg.join(',')})`;
        stack.push({ type: 'add', pos, neg, str });
      } else {
        const aMul = a.type === 'mul' ? a.mul : [a.str];
        const aDiv = a.type === 'mul' ? a.div : [];
        const bMul = b.type === 'mul' ? b.mul : [b.str];
        const bDiv = b.type === 'mul' ? b.div : [];
        const mul = (item === '*' ? [...aMul, ...bMul] : [...aMul, ...bDiv]).sort();
        const div = (item === '*' ? [...aDiv, ...bDiv] : [...aDiv, ...bMul]).sort();
        const str = `(*${mul.join(',')}|/${div.join(',')})`;
        stack.push({ type: 'mul', mul, div, str });
      }
    }
  }
  return stack.length === 1 ? stack[0].str : clean;
}

function calcularExpressioLocal(expr) {
  let clean = expr.split('×').join('*').split('÷').join('/').split('−').join('-').split('–').join('-').split(' ').join('');
  if (!clean) throw new Error("Expressió buida");

  for (let idx = 0; idx < clean.length - 1; idx++) {
    const act = clean.charAt(idx);
    const seg = clean.charAt(idx + 1);
    const esNumAct = (act >= '0' && act <= '9');
    const esNumSeg = (seg >= '0' && seg <= '9');
    const esOpAct = (act === '+' || act === '-' || act === '*' || act === '/');
    const esOpSeg = (seg === '+' || seg === '-' || seg === '*' || seg === '/');

    if (esNumAct && seg === '(') throw new Error("Cal especificar el signe de la multiplicació (×)!");
    if (act === ')' && esNumSeg) throw new Error("Cal especificar el signe de la multiplicació (×)!");
    if (act === ')' && seg === '(') throw new Error("Cal un operador entre els parèntesis!");
    if (act === '(' && seg === ')') throw new Error("No es permeten parèntesis buits!");
    if (act === '(' && esOpSeg) throw new Error("Operació incompleta dins del parèntesi!");
    if (esOpAct && seg === ')') throw new Error("Operació incompleta abans de tancar parèntesi!");
    if (esOpAct && esOpSeg) throw new Error("No es poden posar dos operadors seguits!");
  }

  const primer = clean.charAt(0);
  const ultim = clean.charAt(clean.length - 1);
  if (['+', '-', '*', '/', ')'].includes(primer) || ['+', '-', '*', '/', '('].includes(ultim)) {
    throw new Error("Operació matemàtica incompleta");
  }

  const tks = [];
  let i = 0;
  while (i < clean.length) {
    const c = clean.charAt(i);
    if (c >= '0' && c <= '9') {
      let num = '';
      while (i < clean.length && clean.charAt(i) >= '0' && clean.charAt(i) <= '9') {
        num += clean.charAt(i);
        i++;
      }
      tks.push({ type: 'num', val: parseInt(num, 10) });
      continue;
    }
    tks.push({ type: 'op', val: c });
    i++;
  }

  const outputQueue = [];
  const opStack = [];
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };

  for (let k = 0; k < tks.length; k++) {
    const t = tks[k];
    if (t.type === 'num') {
      outputQueue.push(t.val);
    } else if (t.val === '(') {
      opStack.push(t.val);
    } else if (t.val === ')') {
      while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
        outputQueue.push(opStack.pop());
      }
      if (opStack.length === 0) throw new Error("Parèntesis desquadrats");
      opStack.pop();
    } else {
      while (
        opStack.length > 0 &&
        opStack[opStack.length - 1] !== '(' &&
        precedence[opStack[opStack.length - 1]] >= precedence[t.val]
      ) {
        outputQueue.push(opStack.pop());
      }
      opStack.push(t.val);
    }
  }

  while (opStack.length > 0) {
    const op = opStack.pop();
    if (op === '(' || op === ')') throw new Error("Parèntesis desquadrats");
    outputQueue.push(op);
  }

  const evalStack = [];
  for (let m = 0; m < outputQueue.length; m++) {
    const item = outputQueue[m];
    if (typeof item === 'number') {
      evalStack.push({ val: item, str: String(item), prec: 3 });
    } else {
      if (evalStack.length < 2) throw new Error("Sintaxi matemàtica incompleta");
      const b = evalStack.pop();
      const a = evalStack.pop();
      let res = 0;
      if (item === '+') res = a.val + b.val;
      else if (item === '-') res = a.val - b.val;
      else if (item === '*') res = a.val * b.val;
      else if (item === '/') {
        if (b.val === 0) throw new Error("Divisió per zero");
        if (a.val % b.val !== 0) throw new Error("Les divisions han de ser exactes (sense decimals)!");
        res = Math.round(a.val / b.val);
      }

      const myPrec = precedence[item];
      const leftStr = a.prec < myPrec ? `(${a.str})` : a.str;
      const rightNeedsParens = b.prec < myPrec || (b.prec === myPrec && (item === '-' || item === '/'));
      const rightStr = rightNeedsParens ? `(${b.str})` : b.str;

      evalStack.push({ val: res, str: `${leftStr}${item}${rightStr}`, prec: myPrec });
    }
  }

  if (evalStack.length !== 1) throw new Error("Operació no vàlida");
  return { valor: evalStack[0].val, canonic: evalStack[0].str };
}

function submitDuelTurn() {
  if (!duelState.active) return;

  if (duelState.isRemote && (typeof canInteractRemote === 'function' && !canInteractRemote())) {
    return showToast("És el torn de l'altre jugador/a", "warning");
  }

  if (!duelState.tokens || duelState.tokens.length === 0) {
    triggerShakeDuelDisplay();
    return showToast("Escriu una operació primer", "warning");
  }

  const ultimToken = duelState.tokens[duelState.tokens.length - 1];
  if (ultimToken && ultimToken.type === 'op' && ultimToken.val !== ')') {
    triggerShakeDuelDisplay();
    return showToast("L'operació està incompleta!", "warning");
  }

  const oberts = duelState.tokens.filter(t => t.val === '(').length;
  const tancats = duelState.tokens.filter(t => t.val === ')').length;
  if (oberts > tancats && ultimToken && (ultimToken.type === 'num' || ultimToken.val === ')')) {
    const mancants = oberts - tancats;
    for (let i = 0; i < mancants; i++) {
      duelState.tokens.push({ type: 'op', val: ')', display: ')', id: null });
    }
    duelState.cursorIndex = duelState.tokens.length;
    updateDuelDisplay();
  }

  const numTokens = duelState.tokens.filter(t => t.type === 'num');
  if (numTokens.length < 2) {
    triggerShakeDuelDisplay();
    return showToast("Cal combinar almenys dues xifres!", "warning");
  }

  const centerStr = String(duelState.game.center);
  const usaCentre = numTokens.some(t => t.val === centerStr);
  if (!usaCentre) {
    triggerShakeDuelDisplay();
    return showToast(`Cal fer servir el dígit central (${centerStr})!`, "warning");
  }

  const rawExpr = duelState.tokens.map(t => t.val).join('');
  const displayExpr = duelState.tokens.map(t => t.display).join(' ');

  try {
    const { valor: res, canonic } = calcularExpressioLocal(rawExpr);
    if (Math.abs(res - duelState.game.target) > 0.0001) {
      triggerShakeDuelDisplay();
      return showToast(`El resultat és ${res}, no pas ${duelState.game.target}`, "error");
    }

    const clauComm = generarClauCommutativaLocal(rawExpr);
    if (duelState.usedCanonics.has(canonic) || duelState.usedCanonics.has(clauComm)) {
      triggerShakeDuelDisplay();
      return showToast("Les fórmules no es poden repetir!", "warning");
    }

    const digitsUsats = numTokens.length;
    const esTuti = (digitsUsats === 7);
    const punts = 5 + (digitsUsats * 3) + (esTuti ? 20 : 0);

    const solutionObj = {
      expression: displayExpr,
      points: punts,
      esTuti: esTuti
    };

    if (esTuti) {
      if (typeof confetti === 'function') {
        try { confetti({ particleCount: 90, spread: 60, origin: { y: 0.6 } }); } catch (e) {}
      }
      showToast(`🌟 TUTI! Tots els nombres usats! +${punts} pts`, "success");
    } else {
      showToast(`Correcte! +${punts} pts`, "success");
    }

    if (duelState.isRemote) {
      if (typeof sendSocketAction === 'function') {
        sendSocketAction('SUBMIT', {
          points: punts,
          solutionObj: solutionObj,
          canonic: canonic,
          clauComm: clauComm
        });
      }
      return;
    }

    const isBlau = (duelState.turn % 2 === 0);
    const equip = isBlau ? duelState.blau : duelState.vermell;
    duelState.usedCanonics.add(canonic);
    duelState.usedCanonics.add(clauComm);
    equip.score += punts;
    equip.solutions.push(solutionObj);

    updateDuelScoreboard();
    advanceDuelTurn();

  } catch (err) {
    triggerShakeDuelDisplay();
    showToast(err.message || "Operació no vàlida matemàticament", "error");
  }
}
