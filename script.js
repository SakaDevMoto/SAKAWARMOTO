import { AudioEngine } from "./js/audio.js";
import { LOADOUTS, getLoadout, seedFromText } from "./js/data.js";
import { BattleRoyaleGame } from "./js/game.js";
import { createRoomService, getNetworkDescriptor } from "./js/network.js";

const config = window.LAST_ZONE_CONFIG ?? {};
const descriptor = getNetworkDescriptor(config);
const roomService = createRoomService(config);
const audio = new AudioEngine();

const refs = {
  playerName: document.getElementById("playerName"),
  selectedWeaponBadge: document.getElementById("selectedWeaponBadge"),
  weaponGrid: document.getElementById("weaponGrid"),
  weaponDetail: document.getElementById("weaponDetail"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  createRoomButton: document.getElementById("createRoomButton"),
  joinRoomButton: document.getElementById("joinRoomButton"),
  practiceButton: document.getElementById("practiceButton"),
  leaveRoomButton: document.getElementById("leaveRoomButton"),
  startMatchButton: document.getElementById("startMatchButton"),
  copyRoomButton: document.getElementById("copyRoomButton"),
  networkNotice: document.getElementById("networkNotice"),
  roomSummary: document.getElementById("roomSummary"),
  playerList: document.getElementById("playerList"),
  gameCanvas: document.getElementById("gameCanvas"),
  healthBar: document.getElementById("healthBar"),
  healthLabel: document.getElementById("healthLabel"),
  shieldBar: document.getElementById("shieldBar"),
  shieldLabel: document.getElementById("shieldLabel"),
  abilityBar: document.getElementById("abilityBar"),
  abilityTooltip: document.getElementById("abilityTooltip"),
  hudDetails: document.getElementById("hudDetails"),
  statusGrid: document.getElementById("statusGrid"),
  killFeed: document.getElementById("killFeed"),
  scoreboard: document.getElementById("scoreboard"),
  stormReadout: document.getElementById("stormReadout"),
  stormTimer: document.getElementById("stormTimer"),
  aliveReadout: document.getElementById("aliveReadout"),
  roomCodeReadout: document.getElementById("roomCodeReadout"),
  killsReadout: document.getElementById("killsReadout"),
  loadoutReadout: document.getElementById("loadoutReadout"),
  statsReadout: document.getElementById("statsReadout"),
  syncReadout: document.getElementById("syncReadout"),
  winnerReadout: document.getElementById("winnerReadout"),
  matchStateLabel: document.getElementById("matchStateLabel"),
  respawnOverlay: document.getElementById("respawnOverlay"),
  respawnLabel: document.getElementById("respawnLabel"),
  respawnTimer: document.getElementById("respawnTimer"),
  movePad: document.getElementById("movePad"),
  moveStick: document.getElementById("moveStick"),
  aimPad: document.getElementById("aimPad"),
  aimStick: document.getElementById("aimStick"),
  mobileFireButton: document.getElementById("mobileFireButton"),
  mobileAbilityButtons: {
    Q: document.getElementById("mobileAbilityQ"),
    E: document.getElementById("mobileAbilityE"),
    R: document.getElementById("mobileAbilityR"),
  },
};

const state = {
  selectedLoadoutId: LOADOUTS[0].id,
  snapshot: null,
  noticeOverride: "",
  immersiveAppliedForMatchKey: null,
  gameViewActive: false,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

refs.playerName.value = "Player";
refs.selectedWeaponBadge.textContent = getLoadout(state.selectedLoadoutId).name;
refs.practiceButton.textContent = descriptor.mode === "playroom" ? "Sala Solo Instantanea" : "Playroom Indisponivel";

const game = new BattleRoyaleGame({
  canvas: refs.gameCanvas,
  ui: {
    healthBar: refs.healthBar,
    healthLabel: refs.healthLabel,
    shieldBar: refs.shieldBar,
    shieldLabel: refs.shieldLabel,
    abilityBar: refs.abilityBar,
    abilityTooltip: refs.abilityTooltip,
    hudDetails: refs.hudDetails,
    statusGrid: refs.statusGrid,
    killFeed: refs.killFeed,
    scoreboard: refs.scoreboard,
    stormReadout: refs.stormReadout,
    stormTimer: refs.stormTimer,
    aliveReadout: refs.aliveReadout,
    roomCodeReadout: refs.roomCodeReadout,
    killsReadout: refs.killsReadout,
    loadoutReadout: refs.loadoutReadout,
    statsReadout: refs.statsReadout,
    syncReadout: refs.syncReadout,
    winnerReadout: refs.winnerReadout,
    matchStateLabel: refs.matchStateLabel,
    respawnOverlay: refs.respawnOverlay,
    respawnLabel: refs.respawnLabel,
    respawnTimer: refs.respawnTimer,
    movePad: refs.movePad,
    moveStick: refs.moveStick,
    aimPad: refs.aimPad,
    aimStick: refs.aimStick,
    mobileFireButton: refs.mobileFireButton,
    mobileAbilityButtons: refs.mobileAbilityButtons,
  },
  audio,
  onPose: (pose) => {
    roomService.updatePose(pose).catch((error) => setNotice(error.message, true));
  },
  onAction: (action) => {
    roomService.requestAction(action).catch((error) => setNotice(error.message, true));
  },
});

function currentProfile({ customName = true } = {}) {
  const loadout = getLoadout(state.selectedLoadoutId);
  const trimmedName = refs.playerName.value.trim().slice(0, 18);
  const localRecord = state.snapshot?.players?.[state.snapshot?.localPlayerId] || null;
  const assignedAutoName =
    localRecord?.slotNumber > 0 ? `Player ${localRecord.slotNumber}` : localRecord?.name || "Player";
  const followsAssignedAutoName =
    customName && Boolean(trimmedName) && trimmedName === assignedAutoName && localRecord?.nameCustomized === false;
  const nameCustomized = customName && Boolean(trimmedName) && !followsAssignedAutoName;
  return {
    name: nameCustomized ? trimmedName : "",
    nameCustomized,
    loadoutId: state.selectedLoadoutId,
    color: loadout.theme,
  };
}

function setNotice(message, isError = false) {
  state.noticeOverride = message ? `<strong>${isError ? "Aviso:" : "Status:"}</strong> ${escapeHtml(message)}` : "";
  const roomId = state.snapshot?.roomId;
  const players = Object.values(state.snapshot?.players || {});
  const hostName = state.snapshot?.meta?.hostId
    ? escapeHtml(state.snapshot.players?.[state.snapshot.meta.hostId]?.name || "host")
    : null;
  const defaultNotice = `<strong>${escapeHtml(descriptor.label)}.</strong> ${escapeHtml(descriptor.detail)}`;
  const roomLine = roomId
    ? `<br><span>Sala atual: <strong>${escapeHtml(roomId)}</strong> // ${players.length}/10 jogadores${hostName ? ` // host: ${hostName}` : ""}</span>`
    : "";
  refs.networkNotice.innerHTML = (state.noticeOverride || defaultNotice) + roomLine;
}

function isMatchActive(snapshot) {
  return snapshot?.meta?.state === "running";
}

function currentMatchKey(snapshot) {
  if (!isMatchActive(snapshot)) {
    return null;
  }

  return `${snapshot.meta.startedAt || 0}:${snapshot.meta.seed || 0}:${snapshot.roomId || ""}`;
}

function isCoarsePointer() {
  return window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
}

async function requestLandscapeOrientation() {
  if (!isCoarsePointer() || !screen.orientation?.lock) {
    return false;
  }

  try {
    await screen.orientation.lock("landscape");
    return true;
  } catch {
    return false;
  }
}

function unlockOrientation() {
  if (!screen.orientation?.unlock) {
    return;
  }

  try {
    screen.orientation.unlock();
  } catch {
    // Alguns navegadores ignoram unlock fora de fullscreen.
  }
}

function syncGameView(snapshot) {
  const active = isMatchActive(snapshot);
  if (state.gameViewActive !== active) {
    state.gameViewActive = active;
    document.body.classList.toggle("is-game-view", active);
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }

  if (!active) {
    state.immersiveAppliedForMatchKey = null;
    unlockOrientation();
    return;
  }

  const matchKey = currentMatchKey(snapshot);
  if (matchKey && state.immersiveAppliedForMatchKey !== matchKey) {
    state.immersiveAppliedForMatchKey = matchKey;
    refs.gameCanvas.focus();
    requestLandscapeOrientation();
  }
}

function renderWeapons() {
  refs.weaponGrid.innerHTML = LOADOUTS.map(
    (loadout) => `
      <button
        type="button"
        class="weapon-tile ${loadout.id === state.selectedLoadoutId ? "is-active" : ""}"
        data-loadout-id="${loadout.id}"
      >
        <strong>${loadout.name}</strong>
        <span>${loadout.summary}</span>
        <small>3 habilidades exclusivas</small>
      </button>
    `
  ).join("");

  refs.weaponGrid.querySelectorAll("[data-loadout-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (state.snapshot?.meta?.state === "running") {
        setNotice("A troca de arma vale para o proximo round. Termine a partida atual primeiro.", true);
        return;
      }

      state.selectedLoadoutId = button.dataset.loadoutId;
      refs.selectedWeaponBadge.textContent = getLoadout(state.selectedLoadoutId).name;
      game.setSelectedLoadout(state.selectedLoadoutId);
      renderWeapons();
      renderWeaponDetail();
      await syncLobbyProfile();
    });
  });
}

function renderWeaponDetail() {
  const loadout = getLoadout(state.selectedLoadoutId);
  refs.weaponDetail.innerHTML = `
    <h3>${loadout.name}</h3>
    <div class="detail-meta">
      <span class="field__tag">Movimento ${loadout.moveSpeed}</span>
      <span class="field__tag">Vida ${loadout.maxHealth}</span>
      <span class="field__tag">Escudo ${loadout.maxShield}</span>
    </div>
    <p>${loadout.summary}</p>
    <div class="detail-skill-list">
      <div class="detail-skill">
        <strong>Mouse</strong> ${loadout.primary.label}
      </div>
      ${loadout.abilities
        .map(
          (ability) => `
            <div class="detail-skill">
              <strong>${ability.slot}</strong> ${ability.name}<br>
              <small>${ability.summary}</small>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderPlayerList(snapshot) {
  const players = Object.values(snapshot.players || {}).sort((left, right) => (left.joinedAt || 0) - (right.joinedAt || 0));

  refs.playerList.innerHTML = players.length
    ? players
        .map((player) => {
          const loadout = getLoadout(player.loadoutId || LOADOUTS[0].id);
          const inMatch = snapshot.meta?.state === "running";
          const stateTag = player.isBot
            ? "Bot"
            : snapshot.meta.hostId === player.id
              ? "Host"
              : inMatch && player.alive === false
                ? "Eliminado"
                : "Na sala";
          return `
            <article class="player-chip">
              <div>
                <strong>${escapeHtml(player.name || "Player")}</strong>
                <small>${loadout.name} // ${player.kills || 0}K ${player.deaths || 0}D</small>
              </div>
              <small>${stateTag}</small>
            </article>
          `;
        })
        .join("")
    : `<article class="player-chip"><div><strong>Nenhuma sala ativa</strong><small>Crie ou entre em uma sala para jogar.</small></div><small>--</small></article>`;

  refs.roomSummary.textContent = snapshot.roomId ? `${snapshot.roomId} // ${players.length}/10` : "Nenhuma sala";
}

function updateButtons(snapshot) {
  const hasRoom = Boolean(snapshot.roomId);
  const running = snapshot.meta?.state === "running";
  const playerCount = Object.keys(snapshot.players || {}).length;
  const canStartSolo =
    descriptor.mode === "playroom" && !running && playerCount <= 1 && (!hasRoom || snapshot.isHost);
  refs.copyRoomButton.disabled = !hasRoom;
  refs.leaveRoomButton.disabled = !hasRoom;
  refs.startMatchButton.disabled = !hasRoom || running || !snapshot.isHost;
  refs.practiceButton.disabled = !canStartSolo;
  refs.createRoomButton.disabled = hasRoom;
  refs.joinRoomButton.disabled = hasRoom;
  refs.roomCodeInput.disabled = hasRoom;
}

async function syncLobbyProfile() {
  game.setPlayerName(refs.playerName.value.trim() || "Player");

  if (!state.snapshot?.roomId) {
    return;
  }

  try {
    await roomService.updateLobbyProfile(currentProfile({ customName: true }));
  } catch (error) {
    setNotice(error.message, true);
  }
}

async function createRoom() {
  try {
    await audio.boot();
    await roomService.createRoom(currentProfile({ customName: false }));
    setNotice("Sala criada. Compartilhe o codigo e aguarde ate 10 jogadores.");
    audio.play("join");
  } catch (error) {
    setNotice(error.message, true);
  }
}

async function joinRoom() {
  const roomCode = refs.roomCodeInput.value.trim().toUpperCase();
  if (!roomCode) {
    setNotice("Digite um codigo de sala antes de entrar.", true);
    return;
  }

  try {
    await audio.boot();
    await roomService.joinRoom(roomCode, currentProfile({ customName: false }));
    setNotice("Voce entrou na sala. Aguarde o host iniciar a partida.");
    audio.play("join");
  } catch (error) {
    setNotice(error.message, true);
  }
}

async function startMatch() {
  try {
    await audio.boot();
    const seed = Date.now() ^ seedFromText(`${state.snapshot?.roomId || "room"}-${state.selectedLoadoutId}`);
    await roomService.startMatch(seed);
    setNotice("Partida iniciada. O host agora simula dano, habilidades, respawn e placar para toda a sala.");
  } catch (error) {
    setNotice(error.message, true);
  }
}

async function startSoloRoom() {
  try {
    await audio.boot();
    const playerCount = Object.keys(state.snapshot?.players || {}).length;
    if (playerCount > 1) {
      setNotice("A sala solo so pode ser aberta quando voce estiver sozinho.", true);
      return;
    }

    if (state.snapshot?.roomId && !state.snapshot?.isHost) {
      setNotice("Voce precisa ser o host para abrir a sala solo.", true);
      return;
    }

    if (!state.snapshot?.roomId) {
      await roomService.createRoom(currentProfile({ customName: false }));
    }

    const seed = Date.now() ^ seedFromText(`solo-${state.selectedLoadoutId}`);
    await roomService.startSoloPractice(seed);
    setNotice("Sala solo criada. Um bot de treino entrou e a partida foi iniciada.");
  } catch (error) {
    setNotice(error.message, true);
  }
}

async function leaveRoom() {
  try {
    await roomService.leaveRoom();
  } catch (error) {
    setNotice(error.message, true);
  }
}

async function copyRoomCode() {
  if (!state.snapshot?.roomId) {
    return;
  }

  try {
    await navigator.clipboard.writeText(state.snapshot.roomId);
    audio.play("ui");
    setNotice("Codigo da sala copiado para a area de transferencia.");
  } catch (error) {
    setNotice("Nao consegui copiar automaticamente. Copie o codigo manualmente.", true);
  }
}

refs.playerName.addEventListener("change", syncLobbyProfile);
refs.playerName.addEventListener("blur", syncLobbyProfile);
refs.createRoomButton.addEventListener("click", createRoom);
refs.joinRoomButton.addEventListener("click", joinRoom);
refs.practiceButton.addEventListener("click", startSoloRoom);
refs.leaveRoomButton.addEventListener("click", leaveRoom);
refs.startMatchButton.addEventListener("click", startMatch);
refs.copyRoomButton.addEventListener("click", copyRoomCode);

document.addEventListener("pointerdown", () => {
  if (!document.body.classList.contains("is-game-view")) {
    return;
  }

  requestLandscapeOrientation();
});

roomService.subscribe((snapshot) => {
  state.snapshot = snapshot;
  const localRecord = snapshot.players?.[snapshot.localPlayerId] || null;

  if (snapshot.roomId) {
    refs.roomCodeInput.value = snapshot.roomId;
  } else {
    refs.roomCodeInput.value = "";
  }

  if (localRecord?.name && document.activeElement !== refs.playerName) {
    refs.playerName.value = localRecord.name;
  }

  renderPlayerList(snapshot);
  updateButtons(snapshot);
  game.setPlayerName(refs.playerName.value.trim() || "Player");
  game.setSelectedLoadout(state.selectedLoadoutId);
  game.setSnapshot(snapshot);
  syncGameView(snapshot);
  setNotice("");
});

renderWeapons();
renderWeaponDetail();
setNotice("");
