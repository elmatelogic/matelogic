const SUPABASE_URL = "https://wxmqaaxiexvnwbtgvyas.supabase.co";
const SUPABASE_KEY = "sb_publishable_4-mTzuGMadeDwQX21vP4Pw_nY3K6zMv";

let supabaseClient = null;
let duelChannel = null;
let remoteSession = {
  salaId: "",
  playerId: localStorage.getItem('matelogic_player_uuid') || ('p_' + Math.random().toString(36).substring(2, 10)),
  playerName: "Jugador",
  role: 'guest',
  active: false,
  isHost: false,
  salaState: null 
};
localStorage.setItem('matelogic_player_uuid', remoteSession.playerId);

// Aquesta funció crea la connexió només quan fa falta, evitant que la pàgina falli en arrencar
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  
  if (!SUPABASE_URL.startsWith('http')) {
    alert("Falta configurar les claus reals de Supabase al fitxer duel-remot.js!");
    throw new Error("Supabase URL invàlida. Posa la teva URL real.");
  }
  
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return supabaseClient;
}

async function initSupabaseChannel(salaId, role) {
  const sb = getSupabase(); // Inicialitzem aquí!
  
  if (duelChannel) {
    await sb.removeChannel(duelChannel);
  }
  
  remoteSession.salaId = salaId;
  remoteSession.role = role;
  remoteSession.isHost = (role === 'host');
  
  duelChannel = sb.channel(`room-${salaId}`, {
    config: { broadcast: { ack: false, self: false } }
  });

  duelChannel
    .on('broadcast', { event: 'STATE_UPDATE' }, ({ payload }) => {
      if (!remoteSession.isHost) {
        handleRemoteStateUpdate(payload.sala);
      }
    })
    .on('broadcast', { event: 'PLAYER_ACTION' }, ({ payload }) => {
      if (remoteSession.isHost) {
        processHostAction(payload);
      }
    })
    .on('broadcast', { event: 'SYNC_INPUT' }, ({ payload }) => {
      if (payload.playerId !== remoteSession.playerId && !canInteractRemote()) {
        duelState.tokens = payload.tokens || [];
        duelState.cursorIndex = payload.cursorIndex || 0;
        if (typeof updateDuelDisplay === 'function') updateDuelDisplay();
      }
    })
    .on('broadcast', { event: 'GUEST_JOINED' }, ({ payload }) => {
      if (remoteSession.isHost && remoteSession.salaState) {
        if (!remoteSession.salaState.vermell.id) {
          remoteSession.salaState.vermell.id = payload.playerId;
          remoteSession.salaState.status = 'PLAYING';
          if (remoteSession.salaState.config.temps > 0) {
            remoteSession.salaState.timerDeadline = Date.now() + (remoteSession.salaState.config.temps * 1000);
          }
        }
        broadcastStateFromHost();
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && !remoteSession.isHost) {
        duelChannel.send({ type: 'broadcast', event: 'GUEST_JOINED', payload: { playerId: remoteSession.playerId } });
      }
    });
}

function createRemoteDuelRoom() {
  try {
    const sb = getSupabase(); // Comprovem claus abans de continuar
  } catch (err) {
    return; // Si no hi ha claus, aturem sense trencar res
  }

  const salaId = Math.random().toString(36).substring(2, 6).toUpperCase();
  remoteSession.active = true;
  
  document.getElementById('duel-remote-join-box').classList.add('hidden');
  document.getElementById('duel-remote-lobby-box').classList.remove('hidden');
  document.getElementById('duel-room-code-display').textContent = salaId;

  // Usa les funcions globals si existeixen
  let gameData;
  if (typeof duelConfig !== 'undefined' && duelConfig.rusc === 'avui' && window.DAILY_GAME) {
    gameData = { target: DAILY_GAME.target, center: DAILY_GAME.center, outer: [...DAILY_GAME.outer] };
  } else if (typeof generarRuscAleatoriLocal === 'function') {
    gameData = generarRuscAleatoriLocal();
  } else {
    gameData = { target: 100, center: 5, outer: [1,2,3,4,6,7] }; // Fallback de seguretat
  }

  remoteSession.salaState = {
    id: salaId,
    status: 'WAITING',
    config: typeof duelConfig !== 'undefined' ? duelConfig : { rondes: 3, temps: 45 },
    gameData: gameData,
    turn: 0,
    totalTurns: ((typeof duelConfig !== 'undefined' ? duelConfig.rondes : 3) || 3) * 2,
    currentRound: 1,
    timerDeadline: 0,
    blau: { id: remoteSession.playerId, score: 0, solutions: [] },
    vermell: { id: null, score: 0, solutions: [] },
    usedCanonics: []
  };

  initSupabaseChannel(salaId, 'host');
}

function joinRemoteDuelRoom() {
  const code = document.getElementById('duel-join-input').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4) return;
  
  try {
    getSupabase(); // Comprovem claus
  } catch (err) {
    return;
  }
  
  remoteSession.active = true;
  initSupabaseChannel(code, 'guest');
}

function handleRemoteStateUpdate(sala) {
  remoteSession.salaState = sala;
  if (sala.status === 'WAITING') return;
  
  if (typeof closeModal === 'function') closeModal('duel-setup-modal');
  
  const duelScreen = document.getElementById('duel-screen');
  if (duelScreen) duelScreen.classList.remove('hidden');
  
  if (typeof duelState !== 'undefined') {
    duelState.isRemote = true;
    duelState.active = (sala.status === 'PLAYING');
    duelState.game = sala.gameData;
    duelState.outer = [...sala.gameData.outer];
    duelState.turn = sala.turn;
    duelState.blau = sala.blau;
    duelState.vermell = sala.vermell;
    duelState.usedCanonics = new Set(sala.usedCanonics || []);
  }
  
  const targetVal = document.getElementById('duel-target-val');
  const centerVal = document.getElementById('duel-center-val');
  if (targetVal) targetVal.textContent = sala.gameData.target;
  if (centerVal) centerVal.textContent = sala.gameData.center;
  
  if (typeof updateDuelScoreboard === 'function') updateDuelScoreboard();
  if (typeof renderDuelHexagons === 'function') renderDuelHexagons();
  if (typeof updateDuelTurnUI === 'function') updateDuelTurnUI();
  updateRemoteLockUI();

  if (sala.status === 'FINISHED' && typeof finishDuelGame === 'function') {
    finishDuelGame();
  }
}

function processHostAction(actionData) {
  const sala = remoteSession.salaState;
  if (!sala || sala.status !== 'PLAYING') return;

  const isBlau = (sala.turn % 2 === 0);
  const activeId = isBlau ? sala.blau.id : sala.vermell.id;

  if (activeId === actionData.playerId) {
    if (actionData.type === 'SUBMIT') {
      const equip = isBlau ? sala.blau : sala.vermell;
      equip.score += actionData.points;
      equip.solutions.push(actionData.solutionObj);
      sala.usedCanonics.push(actionData.canonic);
      if (actionData.clauComm) sala.usedCanonics.push(actionData.clauComm);
      avancaTornHost();
    } else if (actionData.type === 'PASS' || actionData.type === 'TIMEOUT') {
      avancaTornHost();
    }
  }
}

function avancaTornHost() {
  const sala = remoteSession.salaState;
  sala.turn++;
  sala.currentRound = Math.floor(sala.turn / 2) + 1;
  
  if (sala.turn >= sala.totalTurns) {
    sala.status = 'FINISHED';
  } else if (sala.config.temps > 0) {
    sala.timerDeadline = Date.now() + (sala.config.temps * 1000);
  }
  
  broadcastStateFromHost();
  handleRemoteStateUpdate(sala); // El host s'actualitza a si mateix
}

function broadcastStateFromHost() {
  if (duelChannel && remoteSession.isHost) {
    duelChannel.send({ type: 'broadcast', event: 'STATE_UPDATE', payload: { sala: remoteSession.salaState } });
  }
}

function sendSocketAction(type, extra = {}) {
  if (remoteSession.isHost) {
    processHostAction({ type, playerId: remoteSession.playerId, ...extra });
  } else if (duelChannel) {
    duelChannel.send({ type: 'broadcast', event: 'PLAYER_ACTION', payload: { type, playerId: remoteSession.playerId, ...extra } });
  }
}

function syncRemoteInputLive() {
  if (typeof duelState === 'undefined' || !duelState.isRemote || !canInteractRemote() || !duelChannel) return;
  duelChannel.send({ 
    type: 'broadcast', 
    event: 'SYNC_INPUT', 
    payload: { playerId: remoteSession.playerId, tokens: duelState.tokens, cursorIndex: duelState.cursorIndex } 
  });
}

function canInteractRemote() {
  if (typeof duelState === 'undefined' || !duelState.active || !duelState.isRemote || !remoteSession.salaState) return true;
  const isBlau = (remoteSession.salaState.turn % 2 === 0);
  return (isBlau && remoteSession.salaState.blau.id === remoteSession.playerId) || 
         (!isBlau && remoteSession.salaState.vermell.id === remoteSession.playerId);
}

function updateRemoteLockUI() {
  const pad = document.getElementById('duel-interactive-pad') || document.querySelector('.grid.grid-cols-6').parentElement;
  const interactuable = canInteractRemote();
  if (pad) {
    pad.style.opacity = interactuable ? '1' : '0.4';
    pad.style.pointerEvents = interactuable ? 'auto' : 'none';
  }
}

function closeWebSocket() {
  if (duelChannel && supabaseClient) {
    supabaseClient.removeChannel(duelChannel);
    duelChannel = null;
  }
  remoteSession.active = false;
}
