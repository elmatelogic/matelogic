const REMOTE_WS_BASE = "wss://matelogicremot.elmatelogic.workers.dev/";
const REMOTE_API_URL = "https://matelogicremot.elmatelogic.workers.dev/";

let remoteSocket = null;
let reconnectTimer = null;

let remoteSession = {
  salaId: "",
  playerId: localStorage.getItem('matelogic_player_uuid') || "",
  playerName: localStorage.getItem('matelogic_player_name') || "Jugador/a",
  role: 'guest',
  mode: 'turns',
  active: false,
  lastState: null
};

if (!remoteSession.playerId) {
  remoteSession.playerId = (window.crypto && window.crypto.randomUUID) 
    ? window.crypto.randomUUID() 
    : 'p_' + Math.random().toString(36).substring(2, 10);
  localStorage.setItem('matelogic_player_uuid', remoteSession.playerId);
}

function setDuelMode(mode) {
  if (typeof duelConfig !== 'undefined') duelConfig.mode = mode;
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
  if (typeof duelConfig !== 'undefined' && duelConfig.mode === 'remote') {
    createRemoteDuelRoom('turns');
  } else {
    startDuelGame();
  }
}

function initWebSocket(salaId, role) {
  closeWebSocket();

  remoteSession.salaId = salaId;
  remoteSession.role = role;

  const wsUrl = `${REMOTE_WS_BASE}?salaId=${salaId}&playerId=${remoteSession.playerId}&role=${role}&name=${encodeURIComponent(remoteSession.playerName)}`;
  remoteSocket = new WebSocket(wsUrl);

  remoteSocket.onopen = () => {
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  };

  remoteSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'STATE_UPDATE') {
        handleRemoteStateUpdate(data.sala);
      } else if (data.type === 'INPUT_STREAM') {
        if (!canInteractRemote()) {
          duelState.tokens = data.tokens || [];
          duelState.cursorIndex = data.cursorIndex || 0;
          if (typeof updateDuelDisplay === 'function') updateDuelDisplay();
        }
      }
    } catch (e) {}
  };

  remoteSocket.onclose = () => {
    if (remoteSession.active && !reconnectTimer) {
      reconnectTimer = setInterval(() => {
        if (remoteSession.salaId && remoteSession.active) {
          initWebSocket(remoteSession.salaId, remoteSession.role);
        }
      }, 1500);
    }
  };
}

function closeWebSocket() {
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
  if (remoteSocket) {
    try { remoteSocket.close(); } catch (e) {}
    remoteSocket = null;
  }
}

function generateRoomCode8() {
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

async function createRemoteDuelRoom(chosenMode = 'turns') {
  if (typeof stopDuelTimer === 'function') stopDuelTimer();

  const salaId = generateRoomCode8();
  remoteSession.salaId = salaId;
  remoteSession.role = 'host';
  remoteSession.mode = chosenMode;
  remoteSession.active = true;

  let gameData;
  let ruscTitle = "Rusc a l'atzar";
  if (typeof duelConfig !== 'undefined' && duelConfig.rusc === 'avui' && typeof DAILY_GAME !== 'undefined' && DAILY_GAME) {
    gameData = {
      target: DAILY_GAME.target,
      center: DAILY_GAME.center,
      outer: [...DAILY_GAME.outer]
    };
    ruscTitle = `Repte Núm. ${DAILY_GAME.num}`;
  } else {
    gameData = typeof generarRuscAleatoriLocal === 'function' ? generarRuscAleatoriLocal() : null;
  }

  showLobbyUI(salaId);

  try {
    const res = await fetch(`${REMOTE_API_URL}api/sala/crear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salaId: salaId,
        mode: chosenMode,
        config: duelConfig,
        gameData: gameData,
        ruscTitle: ruscTitle,
        hostId: remoteSession.playerId,
        hostName: remoteSession.playerName
      })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Error creant la sala");

    initWebSocket(salaId, 'host');
  } catch (err) {
    if (typeof showToast === 'function') showToast("Error creant la sala al servidor", "error");
    cancelRemoteLobby();
  }
}

async function joinRemoteDuelRoom() {
  const input = document.getElementById('duel-join-input');
  const cleanCode = (input ? input.value : '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (cleanCode.length !== 8) {
    if (typeof showToast === 'function') return showToast("El codi ha de tenir 8 caràcters!", "warning");
    return;
  }

  remoteSession.salaId = cleanCode;
  remoteSession.role = 'guest';
  remoteSession.active = true;

  initWebSocket(cleanCode, 'guest');
}

function handleRemoteStateUpdate(sala) {
  remoteSession.lastState = sala;

  if (sala.status === 'WAITING') {
    const statusText = document.getElementById('duel-lobby-status-text');
    if (statusText) statusText.textContent = "Esperant que s'uneixi el rival...";
    return;
  }

  if (typeof closeModal === 'function') {
    closeModal('duel-setup-modal');
    closeModal('duel-winner-modal');
  }

  duelState.isRemote = true;
  duelState.active = (sala.status === 'PLAYING');
  if (sala.gameData) {
    duelState.game = sala.gameData;
    duelState.outer = [...sala.gameData.outer];
  }
  duelState.ruscTitle = sala.ruscTitle;
  duelState.turn = sala.turn;
  duelState.totalTurns = sala.totalTurns;
  duelState.currentRound = sala.currentRound;
  duelState.blau = sala.blau;
  duelState.vermell = sala.vermell;
  duelState.usedCanonics = new Set(sala.usedCanonics || []);

  const ruscLabel = document.getElementById('duel-rusc-label');
  const targetVal = document.getElementById('duel-target-val');
  const centerVal = document.getElementById('duel-center-val');
  const roundTotal = document.getElementById('duel-round-total');
  const roundCurrent = document.getElementById('duel-round-current');

  if (ruscLabel) ruscLabel.textContent = sala.ruscTitle;
  if (targetVal && sala.gameData) targetVal.textContent = sala.gameData.target;
  if (centerVal && sala.gameData) centerVal.textContent = sala.gameData.center;
  if (roundTotal) roundTotal.textContent = sala.config.rondes;
  if (roundCurrent) roundCurrent.textContent = sala.currentRound;

  const nameBlau = document.getElementById('duel-name-blau');
  const nameVermell = document.getElementById('duel-name-vermell');
  if (nameBlau) nameBlau.textContent = sala.blau.name;
  if (nameVermell) nameVermell.textContent = sala.vermell.name;

  const roomPill = document.getElementById('duel-remote-room-pill');
  if (roomPill) {
    roomPill.textContent = `Sala: ${formatRoomCodeDisplay(sala.id)}`;
    roomPill.classList.remove('hidden');
  }

  const duelScreen = document.getElementById('duel-screen');
  if (duelScreen) {
    duelScreen.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  if (typeof updateDuelScoreboard === 'function') updateDuelScoreboard();
  if (typeof renderDuelHexagons === 'function') renderDuelHexagons();
  updateDuelTurnUI();
  updateRemoteLockUI();

  if (sala.mode === 'turns') {
    if (sala.config.temps > 0 && sala.timerDeadline > 0) {
      startClockCountdown(sala.timerDeadline, () => {
        if (canInteractRemote()) sendSocketAction('TIMEOUT');
      });
    } else {
      const timerVal = document.getElementById('duel-timer-val');
      if (timerVal) timerVal.textContent = "∞";
    }
  }

  if (sala.status === 'FINISHED' && typeof finishDuelGame === 'function') {
    finishDuelGame();
  }
}

function startClockCountdown(deadline, onExpire) {
  if (typeof stopDuelTimer === 'function') stopDuelTimer();
  const timerVal = document.getElementById('duel-timer-val');

  duelTimerId = setInterval(() => {
    const restantMs = deadline - Date.now();
    const segonsRestants = Math.max(0, Math.ceil(restantMs / 1000));

    if (timerVal) {
      timerVal.textContent = `${segonsRestants}s`;
      timerVal.className = segonsRestants <= 10 
        ? "text-2xl sm:text-3xl font-black text-brand-red font-mono"
        : "text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono";
    }

    if (restantMs <= 0) {
      if (typeof stopDuelTimer === 'function') stopDuelTimer();
      if (onExpire) onExpire();
    }
  }, 200);
}

function canInteractRemote() {
  if (!duelState.active || !duelState.isRemote || !remoteSession.lastState) return true;
  const sala = remoteSession.lastState;
  const isBlauTurn = (sala.turn % 2 === 0);
  const myId = remoteSession.playerId;
  return (isBlauTurn && sala.blau.id === myId) || (!isBlauTurn && sala.vermell.id === myId);
}

function sendSocketAction(actionType, extraData = {}) {
  if (remoteSocket && remoteSocket.readyState === WebSocket.OPEN) {
    remoteSocket.send(JSON.stringify({
      type: actionType,
      ...extraData
    }));
  }
}

function syncRemoteInputLive() {
  if (!duelState.isRemote || !canInteractRemote()) return;
  sendSocketAction('SYNC_INPUT', {
    tokens: duelState.tokens,
    cursorIndex: duelState.cursorIndex
  });
}

function showLobbyUI(salaId) {
  const joinBox = document.getElementById('duel-remote-join-box');
  const lobbyBox = document.getElementById('duel-remote-lobby-box');
  const configBox = document.getElementById('duel-config-options-box');
  const footerBox = document.getElementById('duel-setup-footer');
  const codeDisplay = document.getElementById('duel-room-code-display');

  if (joinBox) joinBox.classList.add('hidden');
  if (configBox) configBox.classList.add('hidden');
  if (footerBox) footerBox.classList.add('hidden');
  if (lobbyBox) {
    lobbyBox.classList.remove('hidden');
    lobbyBox.classList.add('flex');
  }
  if (codeDisplay) codeDisplay.textContent = formatRoomCodeDisplay(salaId);
}

function cancelRemoteLobby() {
  closeWebSocket();
  remoteSession.active = false;
  remoteSession.salaId = "";
  if (typeof setDuelMode === 'function') setDuelMode('remote');
}

function exitRemoteDuel() {
  closeWebSocket();
  remoteSession.active = false;
  remoteSession.salaId = "";
  duelState.isRemote = false;
  if (typeof exitDuel === 'function') exitDuel();
}

async function shareRemoteRoomLink() {
  if (!remoteSession.salaId) return;
  const formatted = formatRoomCodeDisplay(remoteSession.salaId);
  const url = `${window.location.origin}${window.location.pathname}?sala=${remoteSession.salaId}`;
  const text = `⚔️ Entra al meu duel del Matelògic!\n🔑 Codi de sala: ${formatted}\n👉 ${url}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Duel Matelògic', text: text });
      return;
    } catch (e) {}
  }
  try {
    await navigator.clipboard.writeText(url);
    if (typeof showToast === 'function') showToast("Enllaç copiat al porta-retalls!", "success");
  } catch (e) {}
}

async function copyRemoteRoomCode() {
  if (!remoteSession.salaId) return;
  const formatted = formatRoomCodeDisplay(remoteSession.salaId);
  try {
    await navigator.clipboard.writeText(formatted);
    if (typeof showToast === 'function') showToast(`Codi ${formatted} copiat!`, "success");
  } catch (e) {}
}
