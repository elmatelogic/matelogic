const REMOTE_API_URL = "https://matelogicremot.elmatelogic.workers.dev/";

let remoteState = {
  active: false,
  role: null,
  salaId: "",
  pollingInterval: null,
  lastVersion: 0,
  syncInputTimeout: null
};

if (typeof duelConfig !== 'undefined' && !duelConfig.mode) {
  duelConfig.mode = 'local';
}

function setDuelMode(mode) {
  duelConfig.mode = mode;
  const tabLocal = document.getElementById('duel-tab-local');
  const tabRemote = document.getElementById('duel-tab-remote');
  const joinBox = document.getElementById('duel-remote-join-box');
  const lobbyBox = document.getElementById('duel-remote-lobby-box');
  const configBox = document.getElementById('duel-config-options-box');
  const footerBox = document.getElementById('duel-setup-footer');
  const primaryBtn = document.getElementById('duel-primary-action-btn');

  const activeTabCls = "py-2 px-2 rounded-xl bg-brand-red text-white font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer";
  const inactiveTabCls = "py-2 px-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer";

  if (lobbyBox) {
    lobbyBox.classList.add('hidden');
    lobbyBox.classList.remove('flex');
  }
  if (configBox) configBox.classList.remove('hidden');
  if (footerBox) footerBox.classList.remove('hidden');

  if (mode === 'local') {
    cancelRemoteLobby();
    if (tabLocal) tabLocal.className = activeTabCls;
    if (tabRemote) tabRemote.className = inactiveTabCls;
    if (joinBox) joinBox.classList.add('hidden');
    if (primaryBtn) primaryBtn.textContent = "Comença el Duel";
  } else {
    if (tabRemote) tabRemote.className = activeTabCls;
    if (tabLocal) tabLocal.className = inactiveTabCls;
    if (joinBox) joinBox.classList.remove('hidden');
    if (primaryBtn) primaryBtn.textContent = "Crea la sala per compartir-ho";
  }
}

function handleDuelPrimaryAction(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (duelConfig.mode === 'remote') {
    createRemoteRoom();
  } else {
    startDuelGame();
  }
}

function generateSecureRoomCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const arr = new Uint8Array(8);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 8; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[arr[i] % chars.length];
  return out;
}

function formatRoomCodeDisplay(code) {
  const clean = (code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

function formatRoomCodeInput(inputEl) {
  const clean = inputEl.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
  inputEl.value = clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4, 8)}` : clean;
}

async function createRemoteRoom() {
  if (typeof stopDuelTimer === 'function') stopDuelTimer();
  stopRemotePolling();

  const salaId = generateSecureRoomCode();
  remoteState.salaId = salaId;
  remoteState.role = 'host';
  remoteState.lastVersion = 0;
  remoteState.active = false;
  
  if (typeof duelState !== 'undefined') {
    duelState.active = false;
    duelState.isRemote = true;
  }

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
    gameData = typeof generarRuscAleatoriLocal === 'function' ? generarRuscAleatoriLocal() : null;
  }

  const joinBox = document.getElementById('duel-remote-join-box');
  const lobbyBox = document.getElementById('duel-remote-lobby-box');
  const configBox = document.getElementById('duel-config-options-box');
  const footerBox = document.getElementById('duel-setup-footer');
  const codeDisplay = document.getElementById('duel-room-code-display');
  const statusText = document.getElementById('duel-lobby-status-text');

  if (joinBox) joinBox.classList.add('hidden');
  if (configBox) configBox.classList.add('hidden');
  if (footerBox) footerBox.classList.add('hidden');
  if (lobbyBox) {
    lobbyBox.classList.remove('hidden');
    lobbyBox.classList.add('flex');
  }

  if (codeDisplay) codeDisplay.textContent = formatRoomCodeDisplay(salaId);
  if (statusText) statusText.textContent = "Creant sala al servidor...";

  try {
    const res = await fetch(`${REMOTE_API_URL}api/sala/crear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salaId: salaId,
        config: duelConfig,
        gameData: gameData,
        ruscTitle: ruscTitle
      })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "No s'ha pogut crear la sala");

    if (statusText) statusText.textContent = "Esperant l'altre jugador/a (1/2)...";
    startRemotePolling();
  } catch (err) {
    if (typeof showToast === 'function') showToast("Error creant la sala al servidor", "error");
    cancelRemoteLobby();
  }
}

async function joinRemoteRoom() {
  const input = document.getElementById('duel-join-input');
  const cleanCode = (input ? input.value : '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (cleanCode.length !== 8) {
    if (typeof showToast === 'function') return showToast("El codi ha de tenir 8 caràcters!", "warning");
    return;
  }

  const joinBtn = document.getElementById('duel-join-btn');
  if (joinBtn) {
    joinBtn.disabled = true;
    joinBtn.textContent = "...";
  }

  try {
    const res = await fetch(`${REMOTE_API_URL}api/sala/unir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salaId: cleanCode, role: 'guest' })
    });

    const data = await res.json();
    if (!data.ok) {
      if (joinBtn) {
        joinBtn.disabled = false;
        joinBtn.textContent = "Entra";
      }
      if (typeof showToast === 'function') return showToast(data.msg || "Error unint-se a la sala", "error");
      return;
    }

    remoteState.salaId = cleanCode;
    remoteState.role = 'guest';

    if (typeof showToast === 'function') showToast("Connectat a la sala!", "success");
    syncRemoteGame(data.sala);
    startRemotePolling();
  } catch (err) {
    if (typeof showToast === 'function') showToast("No s'ha pogut connectar amb el servidor", "error");
    if (joinBtn) {
      joinBtn.disabled = false;
      joinBtn.textContent = "Entra";
    }
  }
}

function startRemotePolling() {
  stopRemotePolling();
  remoteState.pollingInterval = setInterval(async () => {
    if (!remoteState.salaId) return;
    try {
      const res = await fetch(`${REMOTE_API_URL}api/sala/estat?id=${remoteState.salaId}&t=${Date.now()}`, {
        cache: 'no-store'
      });
      const data = await res.json();

      if (!data.ok) {
        if (typeof showToast === 'function') showToast(data.msg || "La sala s'ha tancat", "warning");
        exitRemoteDuel();
        return;
      }

      const sala = data.sala;

      if (sala.status === 'WAITING') {
        return;
      }

      if (remoteState.role === 'host' && !remoteState.active && (sala.status === 'PLAYING' || sala.status === 'FINISHED')) {
        if (typeof showToast === 'function') showToast("Jugador/a connectat! Iniciant duel...", "success");
        syncRemoteGame(sala);
        return;
      }

      if (sala.version !== remoteState.lastVersion) {
        syncRemoteGame(sala);
      }
    } catch (e) {}
  }, 1000);
}

function stopRemotePolling() {
  if (remoteState.pollingInterval) {
    clearInterval(remoteState.pollingInterval);
    remoteState.pollingInterval = null;
  }
}

function syncRemoteGame(sala) {
  if (sala.status === 'WAITING' || typeof duelState === 'undefined') return;

  const previousTurn = duelState.turn;
  remoteState.lastVersion = sala.version;
  remoteState.active = (sala.status === 'PLAYING');

  if (typeof duelConfig !== 'undefined') {
    duelConfig.temps = sala.config.temps;
    duelConfig.rondes = sala.config.rondes;
  }

  duelState.active = (sala.status === 'PLAYING');
  duelState.isRemote = true;
  duelState.game = sala.gameData;
  duelState.ruscTitle = sala.ruscTitle;
  duelState.outer = [...sala.gameData.outer];
  duelState.turn = sala.turn;
  duelState.totalTurns = sala.totalTurns;
  duelState.currentRound = sala.currentRound;
  duelState.blau = sala.blau;
  duelState.vermell = sala.vermell;
  duelState.usedCanonics = new Set(sala.usedCanonics || []);

  if (typeof closeModal === 'function') {
    closeModal('duel-setup-modal');
    closeModal('duel-winner-modal');
  }

  const ruscLabel = document.getElementById('duel-rusc-label');
  const targetVal = document.getElementById('duel-target-val');
  const centerVal = document.getElementById('duel-center-val');
  const roundTotal = document.getElementById('duel-round-total');
  const roundCurrent = document.getElementById('duel-round-current');

  if (ruscLabel) ruscLabel.textContent = sala.ruscTitle;
  if (targetVal) targetVal.textContent = sala.gameData.target;
  if (centerVal) centerVal.textContent = sala.gameData.center;
  if (roundTotal) roundTotal.textContent = sala.config.rondes;
  if (roundCurrent) roundCurrent.textContent = sala.currentRound;

  const nameBlau = document.getElementById('duel-name-blau');
  const nameVermell = document.getElementById('duel-name-vermell');
  if (nameBlau) nameBlau.textContent = remoteState.role === 'host' ? "Equip Blau (Tu)" : "Equip Blau";
  if (nameVermell) nameVermell.textContent = remoteState.role === 'guest' ? "Equip Vermell (Tu)" : "Equip Vermell";

  const roomPill = document.getElementById('duel-remote-room-pill');
  if (roomPill) {
    roomPill.textContent = `Sala: ${formatRoomCodeDisplay(remoteState.salaId)}`;
    roomPill.classList.remove('hidden');
  }

  const settingsBtn = document.getElementById('duel-header-settings-btn');
  if (settingsBtn) settingsBtn.classList.add('hidden');

  const duelScreen = document.getElementById('duel-screen');
  if (duelScreen) {
    duelScreen.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  if (typeof updateDuelScoreboard === 'function') updateDuelScoreboard();

  if (previousTurn !== sala.turn || !remoteState.active) {
    duelState.tokens = [];
    duelState.cursorIndex = 0;
    if (typeof updateDuelDisplay === 'function') updateDuelDisplay();
  }

  if (!canInteractRemote()) {
    duelState.tokens = sala.currentTokens || [];
    duelState.cursorIndex = sala.cursorIndex || 0;
    if (typeof updateDuelDisplay === 'function') updateDuelDisplay();
  }

  if (typeof renderDuelHexagons === 'function') renderDuelHexagons();
  updateDuelTurnUI();
  updateRemoteLockUI();

  if (sala.config.temps > 0 && sala.timerDeadline > 0) {
    if (typeof duelTurnDeadline !== 'undefined') {
      duelTurnDeadline = sala.timerDeadline;
    }
    startRemoteClock();
  } else {
    const timerVal = document.getElementById('duel-timer-val');
    if (timerVal) timerVal.textContent = "∞";
  }

  if (sala.status === 'FINISHED' && typeof finishDuelGame === 'function') {
    finishDuelGame();
  }
}

function updateDuelTurnUI() {
  if (typeof duelState === 'undefined') return;
  const isBlau = (duelState.turn % 2 === 0);
  const turnIndicator = document.getElementById('duel-turn-indicator');
  const boxBlau = document.getElementById('duel-box-blau');
  const boxVermell = document.getElementById('duel-box-vermell');
  const badgeBlau = document.getElementById('duel-badge-turn-blau');
  const badgeVermell = document.getElementById('duel-badge-turn-vermell');

  const baseCardCls = "col-span-1 lg:col-span-3 bg-white dark:bg-slate-800 border-2 border-slate-200/90 dark:border-slate-700/80 rounded-2xl p-3 sm:p-4 shadow-sm transition-all duration-300 flex flex-col justify-between";

  if (isBlau) {
    if (turnIndicator) {
      turnIndicator.textContent = "Torn: Equip Blau";
      turnIndicator.className = "font-extrabold text-brand-blueDark dark:text-brand-blue";
    }
    if (boxBlau) boxBlau.className = `${baseCardCls} order-1 lg:order-1 duel-halo-blau`;
    if (boxVermell) boxVermell.className = `${baseCardCls} order-2 lg:order-3 opacity-60`;
    if (badgeBlau) badgeBlau.classList.remove('hidden');
    if (badgeVermell) badgeVermell.classList.add('hidden');
  } else {
    if (turnIndicator) {
      turnIndicator.textContent = "Torn: Equip Vermell";
      turnIndicator.className = "font-extrabold text-brand-red";
    }
    if (boxVermell) boxVermell.className = `${baseCardCls} order-2 lg:order-3 duel-halo-vermell`;
    if (boxBlau) boxBlau.className = `${baseCardCls} order-1 lg:order-1 opacity-60`;
    if (badgeVermell) badgeVermell.classList.remove('hidden');
    if (badgeBlau) badgeBlau.classList.add('hidden');
  }
}

function canInteractRemote() {
  if (typeof duelState === 'undefined' || !duelState.active) return false;
  if (!duelState.isRemote) return true;
  const isBlauTurn = (duelState.turn % 2 === 0);
  return (remoteState.role === 'host' && isBlauTurn) || (remoteState.role === 'guest' && !isBlauTurn);
}

function updateRemoteLockUI() {
  const pad = document.getElementById('duel-interactive-pad');
  const leftBtn = document.getElementById('duel-cursor-left-btn');
  const rightBtn = document.getElementById('duel-cursor-right-btn');
  const hint = document.getElementById('duel-bottom-hint');

  const allowed = canInteractRemote();
  if (pad) {
    if (allowed) {
      pad.classList.remove('opacity-45', 'pointer-events-none');
    } else {
      pad.classList.add('opacity-45', 'pointer-events-none');
    }
  }
  if (leftBtn && rightBtn) {
    leftBtn.disabled = !allowed;
    rightBtn.disabled = !allowed;
  }
  if (hint) {
    hint.textContent = allowed ? "Joc per equips sense propietat commutativa." : "⏳ Esperant la jugada de l'altre dispositiu...";
  }
}

function startRemoteClock() {
  if (typeof stopDuelTimer === 'function') stopDuelTimer();
  const timerVal = document.getElementById('duel-timer-val');

  if (typeof duelTimerId !== 'undefined') {
    duelTimerId = setInterval(() => {
      if (typeof duelState !== 'undefined' && !duelState.active) {
        if (typeof stopDuelTimer === 'function') stopDuelTimer();
        return;
      }

      const restantMs = (typeof duelTurnDeadline !== 'undefined' ? duelTurnDeadline : 0) - Date.now();
      const segonsRestants = Math.max(0, Math.ceil(restantMs / 1000));

      if (timerVal) {
        timerVal.textContent = `${segonsRestants}s`;
        timerVal.className = segonsRestants <= 10 
          ? "text-2xl sm:text-3xl font-black text-brand-red font-mono"
          : "text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono";
      }

      if (restantMs <= 0) {
        if (typeof stopDuelTimer === 'function') stopDuelTimer();
        if (canInteractRemote()) {
          sendRemoteAction('TIMEOUT');
        }
      }
    }, 200);
  }
}

async function sendRemoteAction(accio, extraData = {}) {
  try {
    const res = await fetch(`${REMOTE_API_URL}api/sala/accio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salaId: remoteState.salaId,
        accio: accio,
        ...extraData
      })
    });
    const data = await res.json();
    if (data.ok && data.sala) {
      syncRemoteGame(data.sala);
    }
  } catch (e) {}
}

function syncRemoteInputLive() {
  if (typeof duelState === 'undefined' || !duelState.isRemote || !canInteractRemote()) return;
  clearTimeout(remoteState.syncInputTimeout);
  remoteState.syncInputTimeout = setTimeout(() => {
    sendRemoteAction('SYNC_INPUT', {
      tokens: duelState.tokens,
      cursorIndex: duelState.cursorIndex,
      turn: duelState.turn
    });
  }, 250);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && remoteState.salaId && remoteState.active) {
    fetch(`${REMOTE_API_URL}api/sala/estat?id=${remoteState.salaId}&t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.sala && data.sala.status !== 'WAITING') {
          syncRemoteGame(data.sala);
        }
      })
      .catch(() => {});
  }
});

function cancelRemoteLobby() {
  stopRemotePolling();
  remoteState.salaId = "";
  remoteState.role = null;
  remoteState.active = false;
  if (typeof duelState !== 'undefined') {
    duelState.isRemote = false;
  }
  setDuelMode('remote');
}

function exitRemoteDuel() {
  stopRemotePolling();
  remoteState.salaId = "";
  remoteState.role = null;
  remoteState.active = false;
  if (typeof duelState !== 'undefined') {
    duelState.isRemote = false;
  }
  if (typeof exitDuel === 'function') exitDuel();
}

async function shareRemoteRoomLink() {
  if (!remoteState.salaId) return;
  const formatted = formatRoomCodeDisplay(remoteState.salaId);
  const url = `${window.location.origin}${window.location.pathname}?sala=${remoteState.salaId}`;
  const text = `⚔️ Entra a la meva sala del Matelògic per jugar un duel!\n🔑 Codi de sala: ${formatted}\n👉 ${url}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Duel Matelògic', text: text });
      return;
    } catch (e) {}
  }

  try {
    await navigator.clipboard.writeText(url);
    if (typeof showToast === 'function') showToast("Enllaç directe copiat al porta-retalls!", "success");
  } catch (e) {
    if (typeof showToast === 'function') showToast("No s'ha pogut copiar l'enllaç", "error");
  }
}

async function copyRemoteRoomCode() {
  if (!remoteState.salaId) return;
  const formatted = formatRoomCodeDisplay(remoteState.salaId);
  try {
    await navigator.clipboard.writeText(formatted);
    if (typeof showToast === 'function') showToast(`Codi ${formatted} copiat!`, "success");
  } catch (e) {
    if (typeof showToast === 'function') showToast("No s'ha pogut copiar el codi", "error");
  }
}
