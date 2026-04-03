import { AudioEngine } from "./js/audio.js";
import { LOADOUTS, PLAYER_COLOR_OPTIONS, getLoadout, seedFromText } from "./js/data.js";
import { BattleRoyaleGame } from "./js/game.js";
import { consumeDeferredRoomNotice, createRoomService, getNetworkDescriptor } from "./js/network.js";

const config = window.LAST_ZONE_CONFIG ?? {};
const descriptor = getNetworkDescriptor(config);
const roomService = createRoomService(config);
const audio = new AudioEngine();
const FIELD_OF_VIEW_KEY = "last-zone-field-of-view";
const PLAYER_COLOR_KEY = "last-zone-player-color";
const DEFAULT_FIELD_OF_VIEW = 52;
const MIN_FIELD_OF_VIEW = 34;
const MAX_FIELD_OF_VIEW = 88;

const refs = {
  playerName: document.getElementById("playerName"),
  selectedColorBadge: document.getElementById("selectedColorBadge"),
  colorGrid: document.getElementById("colorGrid"),
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
  matchMenuOverlay: document.getElementById("matchMenuOverlay"),
  matchMenuTitle: document.getElementById("matchMenuTitle"),
  matchMenuBackButton: document.getElementById("matchMenuBackButton"),
  matchMenuCloseButton: document.getElementById("matchMenuCloseButton"),
  matchMenuActions: document.getElementById("matchMenuActions"),
  matchMenuEndButton: document.getElementById("matchMenuEndButton"),
  matchMenuLeaveButton: document.getElementById("matchMenuLeaveButton"),
  matchMenuVideoButton: document.getElementById("matchMenuVideoButton"),
  matchMenuVideoSection: document.getElementById("matchMenuVideoSection"),
  matchMenuVideoSlider: document.getElementById("matchMenuVideoSlider"),
  matchMenuVideoValue: document.getElementById("matchMenuVideoValue"),
  matchMenuSoundButton: document.getElementById("matchMenuSoundButton"),
  matchMenuSoundSection: document.getElementById("matchMenuSoundSection"),
  matchMenuSoundSlider: document.getElementById("matchMenuSoundSlider"),
  matchMenuSoundValue: document.getElementById("matchMenuSoundValue"),
  matchMenuTransferSection: document.getElementById("matchMenuTransferSection"),
  matchMenuTransferList: document.getElementById("matchMenuTransferList"),
  matchMenuModerationSection: document.getElementById("matchMenuModerationSection"),
  matchMenuModerationList: document.getElementById("matchMenuModerationList"),
  mobileControls: document.getElementById("mobileControls"),
  mobileMenuButton: document.getElementById("mobileMenuButton"),
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
  selectedColor: readStoredPlayerColor(),
  selectedLoadoutId: LOADOUTS[0].id,
  snapshot: null,
  noticeOverride: "",
  immersiveAppliedForMatchKey: null,
  gameViewActive: false,
  matchMenuOpen: false,
  matchMenuView: "root",
  matchVideoAdjusting: false,
  profileSyncTimer: 0,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isEditableTarget(target) {
  const tagName = target?.tagName?.toUpperCase?.() || "";
  return Boolean(target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(tagName));
}

function clampFieldOfView(value) {
  return Math.max(MIN_FIELD_OF_VIEW, Math.min(MAX_FIELD_OF_VIEW, Math.round(Number(value) || DEFAULT_FIELD_OF_VIEW)));
}

function normalizePlayerColor(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return PLAYER_COLOR_OPTIONS.find((option) => option.value.toLowerCase() === normalized)?.value || PLAYER_COLOR_OPTIONS[0].value;
}

function getPlayerColorOption(value) {
  const normalized = normalizePlayerColor(value);
  return PLAYER_COLOR_OPTIONS.find((option) => option.value === normalized) || PLAYER_COLOR_OPTIONS[0];
}

function colorWithAlpha(value, alpha) {
  const normalized = normalizePlayerColor(value);
  const hex = normalized.replace("#", "");
  if (hex.length !== 6) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function readStoredFieldOfView() {
  try {
    const stored = window.localStorage?.getItem(FIELD_OF_VIEW_KEY);
    if (stored !== null) {
      return clampFieldOfView(stored);
    }
  } catch {
    // Ignora falhas de acesso ao storage.
  }

  return DEFAULT_FIELD_OF_VIEW;
}

function readStoredPlayerColor() {
  try {
    const stored = window.localStorage?.getItem(PLAYER_COLOR_KEY);
    if (stored) {
      return normalizePlayerColor(stored);
    }
  } catch {
    // Ignora falhas de acesso ao storage.
  }

  return PLAYER_COLOR_OPTIONS[0].value;
}

function storeSelectedPlayerColor(value) {
  try {
    window.localStorage?.setItem(PLAYER_COLOR_KEY, normalizePlayerColor(value));
  } catch {
    // Ignora falhas de persistencia.
  }
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
    mobileControls: refs.mobileControls,
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
game.setFieldOfView(readStoredFieldOfView());

function currentProfile({ customName = true } = {}) {
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
    color: normalizePlayerColor(state.selectedColor),
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

function getHumanPlayers(snapshot) {
  return Object.values(snapshot?.players || {}).filter((player) => !player.isBot);
}

function getTransferCandidates(snapshot) {
  return getHumanPlayers(snapshot).filter((player) => player.id !== snapshot?.localPlayerId);
}

function getRoomModerationTargets(snapshot) {
  return getTransferCandidates(snapshot);
}

function getPlayerStateTag(snapshot, player) {
  const inMatch = snapshot.meta?.state === "running";
  if (player.isBot) {
    return "Bot";
  }
  if (snapshot.meta.hostId === player.id) {
    return "Host";
  }
  if (inMatch && player.alive === false) {
    return "Eliminado";
  }
  return "Na sala";
}

function formatBanDuration(durationMs, permanent = false) {
  if (permanent) {
    return "permanentemente";
  }

  const totalMinutes = Math.max(1, Math.ceil((Number(durationMs) || 0) / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days > 0) {
    parts.push(`${days} dia${days === 1 ? "" : "s"}`);
  }
  if (hours > 0) {
    parts.push(`${hours} hora${hours === 1 ? "" : "s"}`);
  }
  if (minutes > 0 && days === 0) {
    parts.push(`${minutes} min`);
  }

  return parts.slice(0, 2).join(" ") || "1 min";
}

function parseBanDurationInput(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(",", ".");
  if (!normalized) {
    return 0;
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*([mhd]?)$/i);
  if (!match) {
    return 0;
  }

  const amount = Number(match[1]);
  const unit = (match[2] || "m").toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  if (unit === "d") {
    return amount * 24 * 60 * 60 * 1000;
  }
  if (unit === "h") {
    return amount * 60 * 60 * 1000;
  }
  return amount * 60 * 1000;
}

function renderPlayerModerationActions(player, { compact = false } = {}) {
  const snapshot = state.snapshot;
  const canModerate =
    Boolean(snapshot?.isHost) && player.id !== snapshot?.localPlayerId && !player.isBot;
  if (!canModerate) {
    return "";
  }

  return `
    <div class="player-chip__actions ${compact ? "player-chip__actions--compact" : ""}">
      <button type="button" class="small-button" data-room-action="kick" data-player-id="${player.id}">
        Expulsar
      </button>
      <button type="button" class="small-button" data-room-action="ban-hour" data-player-id="${player.id}">
        Banir 1h
      </button>
      <button type="button" class="small-button" data-room-action="ban-custom" data-player-id="${player.id}">
        Banir...
      </button>
      <button
        type="button"
        class="small-button small-button--danger"
        data-room-action="ban-permanent"
        data-player-id="${player.id}"
      >
        Perm.
      </button>
    </div>
  `;
}

function renderMatchMenuModeration(snapshot) {
  if (!refs.matchMenuModerationSection || !refs.matchMenuModerationList) {
    return;
  }

  const isHost = Boolean(snapshot?.isHost);
  const targets = isHost ? getRoomModerationTargets(snapshot) : [];
  refs.matchMenuModerationSection.hidden = state.matchMenuView !== "root" || !isHost || !targets.length;
  refs.matchMenuModerationList.innerHTML = targets
    .map((player) => {
      const loadout = getLoadout(player.loadoutId || LOADOUTS[0].id);
      const color = normalizePlayerColor(player.color || loadout.theme);
      const colorOption = getPlayerColorOption(color);
      const accent = colorWithAlpha(color, 0.18);
      const border = colorWithAlpha(color, 0.42);
      return `
        <article
          class="match-menu__moderation-card"
          style="--player-color:${escapeHtml(color)};--player-color-soft:${escapeHtml(accent)};--player-color-border:${escapeHtml(border)}"
        >
          <div class="match-menu__moderation-head">
            <div>
              <strong>${escapeHtml(player.name || "Player")}</strong>
              <small>${escapeHtml(loadout.name)} // ${escapeHtml(colorOption.label)} // ${escapeHtml(getPlayerStateTag(snapshot, player))}</small>
            </div>
            <span class="player-chip__swatch" style="--player-color:${escapeHtml(color)}"></span>
          </div>
          ${renderPlayerModerationActions(player, { compact: true })}
        </article>
      `;
    })
    .join("");
}

function renderMatchMenu() {
  if (!refs.matchMenuOverlay || !refs.matchMenuTransferList) {
    return;
  }

  const snapshot = state.snapshot;
  const isHost = Boolean(snapshot?.isHost);
  const targets = isHost ? getTransferCandidates(snapshot) : [];
  const isRootView = state.matchMenuView === "root";
  const isVideoView = state.matchMenuView === "video";
  const isSoundView = state.matchMenuView === "sound";

  if (refs.matchMenuTitle) {
    refs.matchMenuTitle.textContent = isVideoView ? "Video" : isSoundView ? "Sons" : "Menu da Partida";
  }
  if (refs.matchMenuBackButton) {
    refs.matchMenuBackButton.hidden = isRootView;
  }
  if (refs.matchMenuActions) {
    refs.matchMenuActions.hidden = !isRootView;
  }

  refs.matchMenuEndButton.hidden = !isHost;
  refs.matchMenuLeaveButton.hidden = !snapshot?.roomId;
  if (refs.matchMenuVideoSection) {
    refs.matchMenuVideoSection.hidden = !isVideoView;
  }
  if (refs.matchMenuVideoSlider) {
    refs.matchMenuVideoSlider.value = String(Math.round(game.getFieldOfView()));
  }
  if (refs.matchMenuVideoValue) {
    refs.matchMenuVideoValue.textContent = String(Math.round(game.getFieldOfView()));
  }
  if (refs.matchMenuSoundSection) {
    refs.matchMenuSoundSection.hidden = !isSoundView;
  }
  if (refs.matchMenuSoundSlider) {
    refs.matchMenuSoundSlider.value = String(Math.round(audio.getEffectsVolume() * 100));
  }
  if (refs.matchMenuSoundValue) {
    refs.matchMenuSoundValue.textContent = `${Math.round(audio.getEffectsVolume() * 100)}%`;
  }
  refs.matchMenuTransferSection.hidden = !isRootView || !isHost || !targets.length;
  refs.matchMenuTransferList.innerHTML = targets
    .map(
      (player) => `
        <button type="button" class="button button--ghost" data-transfer-host="${player.id}">
          ${escapeHtml(player.name || "Player")}
        </button>
      `
    )
    .join("");
  renderMatchMenuModeration(snapshot);
  refs.matchMenuOverlay.classList.toggle("is-video-adjusting", state.matchVideoAdjusting);
}

function setMatchMenuOpen(open) {
  const nextValue = Boolean(open && state.gameViewActive && state.snapshot?.roomId);
  const wasOpen = state.matchMenuOpen;
  state.matchMenuOpen = nextValue;
  if (nextValue && !wasOpen) {
    state.matchMenuView = "root";
  }
  if (!nextValue) {
    state.matchMenuView = "root";
    state.matchVideoAdjusting = false;
  }

  if (refs.matchMenuOverlay) {
    refs.matchMenuOverlay.hidden = !nextValue;
    refs.matchMenuOverlay.classList.toggle("is-video-adjusting", nextValue && state.matchVideoAdjusting);
  }

  if (nextValue) {
    renderMatchMenu();
  }

  game.setMenuOpen(nextValue);

  if (!nextValue && state.gameViewActive) {
    refs.gameCanvas.focus();
  }
}

function scrollMatchMenuToTop() {
  if (refs.matchMenuOverlay) {
    refs.matchMenuOverlay.scrollTop = 0;
  }
  const panel = refs.matchMenuOverlay?.querySelector?.(".match-menu");
  if (panel) {
    panel.scrollTop = 0;
  }
}

function setMatchMenuView(view) {
  state.matchMenuView = view;
  if (view !== "video") {
    state.matchVideoAdjusting = false;
  }
  if (state.matchMenuOpen) {
    scrollMatchMenuToTop();
    renderMatchMenu();
  }
}

function openSoundMenu() {
  setMatchMenuView("sound");
}

function openVideoMenu() {
  setMatchMenuView("video");
}

function returnToRootMenu() {
  setMatchMenuView("root");
}

function setVideoAdjusting(adjusting) {
  state.matchVideoAdjusting = Boolean(adjusting && state.matchMenuOpen && state.matchMenuView === "video");
  if (refs.matchMenuOverlay) {
    refs.matchMenuOverlay.classList.toggle("is-video-adjusting", state.matchVideoAdjusting);
  }
}

function updateEffectsVolume(value) {
  const volume = Math.max(0, Math.min(100, Number(value) || 0));
  audio.setEffectsVolume(volume / 100);
  if (refs.matchMenuSoundValue) {
    refs.matchMenuSoundValue.textContent = `${Math.round(volume)}%`;
  }
}

function updateFieldOfView(value) {
  const fieldOfView = clampFieldOfView(value);
  game.setFieldOfView(fieldOfView);
  if (refs.matchMenuVideoSlider) {
    refs.matchMenuVideoSlider.value = String(fieldOfView);
  }
  if (refs.matchMenuVideoValue) {
    refs.matchMenuVideoValue.textContent = String(fieldOfView);
  }

  try {
    window.localStorage?.setItem(FIELD_OF_VIEW_KEY, String(fieldOfView));
  } catch {
    // Ignora falhas de persistencia.
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

function getOccupiedColors(snapshot) {
  const usedColors = new Set();
  const localPlayerId = snapshot?.localPlayerId || null;

  Object.values(snapshot?.players || {}).forEach((player) => {
    if (!player?.color || player.id === localPlayerId) {
      return;
    }

    usedColors.add(normalizePlayerColor(player.color));
  });

  return usedColors;
}

function clearScheduledProfileSync() {
  if (!state.profileSyncTimer) {
    return;
  }

  window.clearTimeout(state.profileSyncTimer);
  state.profileSyncTimer = 0;
}

function scheduleLobbyProfileSync() {
  game.setPlayerName(refs.playerName.value.trim() || "Player");

  if (!state.snapshot?.roomId || state.snapshot?.meta?.state === "running") {
    return;
  }

  clearScheduledProfileSync();
  state.profileSyncTimer = window.setTimeout(() => {
    state.profileSyncTimer = 0;
    syncLobbyProfile();
  }, 160);
}

function renderColorChoices(snapshot = state.snapshot) {
  if (!refs.colorGrid) {
    return;
  }

  const usedColors = getOccupiedColors(snapshot);
  const selectedColor = normalizePlayerColor(state.selectedColor);
  const selectedOption = getPlayerColorOption(selectedColor);

  if (refs.selectedColorBadge) {
    refs.selectedColorBadge.textContent = selectedOption.label;
  }

  refs.colorGrid.innerHTML = PLAYER_COLOR_OPTIONS.map((option) => {
    const occupied = usedColors.has(option.value);
    const active = option.value === selectedColor;
    return `
      <button
        type="button"
        class="color-swatch ${active ? "is-active" : ""}"
        data-player-color="${option.value}"
        ${occupied ? "disabled" : ""}
      >
        <span class="color-swatch__dot" style="--swatch:${escapeHtml(option.value)}"></span>
        <span class="color-swatch__copy">
          <span class="color-swatch__label">${escapeHtml(option.label)}</span>
          <small class="color-swatch__meta">${active ? "Sua cor" : occupied ? "Em uso" : "Livre"}</small>
        </span>
      </button>
    `;
  }).join("");

  refs.colorGrid.querySelectorAll("[data-player-color]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (state.snapshot?.meta?.state === "running") {
        setNotice("A troca de cor vale para o proximo round. Termine a partida atual primeiro.", true);
        return;
      }

      state.selectedColor = normalizePlayerColor(button.dataset.playerColor);
      storeSelectedPlayerColor(state.selectedColor);
      renderColorChoices(snapshot);
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
              <div class="detail-skill__head">
                <div>
                  <strong>${ability.slot}</strong> ${ability.name}
                </div>
                ${ability.damageLabel ? `<small class="detail-skill__damage">${ability.damageLabel}</small>` : ""}
              </div>
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
          const resolvedColor = normalizePlayerColor(player.color || loadout.theme);
          const colorOption = getPlayerColorOption(resolvedColor);
          const stateTag = getPlayerStateTag(snapshot, player);
          const accent = colorWithAlpha(resolvedColor, 0.16);
          const border = colorWithAlpha(resolvedColor, 0.36);
          return `
            <article
              class="player-chip ${player.id === snapshot.localPlayerId ? "is-local" : ""}"
              style="--player-color:${escapeHtml(resolvedColor)};--player-color-soft:${escapeHtml(accent)};--player-color-border:${escapeHtml(border)}"
            >
              <div class="player-chip__identity">
                <span class="player-chip__swatch" style="--player-color:${escapeHtml(resolvedColor)}"></span>
                <div>
                  <strong>${escapeHtml(player.name || "Player")}</strong>
                  <small>${escapeHtml(loadout.name)} // ${escapeHtml(colorOption.label)} // ${player.kills || 0}K ${player.deaths || 0}D</small>
                </div>
              </div>
              <div class="player-chip__side">
                <small class="player-chip__state">${escapeHtml(stateTag)}</small>
                ${renderPlayerModerationActions(player)}
              </div>
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
  const humanCount = getHumanPlayers(snapshot).length;
  const canStartSolo =
    descriptor.mode === "playroom" && !running && humanCount <= 1 && (!hasRoom || snapshot.isHost);
  refs.copyRoomButton.disabled = !hasRoom;
  refs.leaveRoomButton.disabled = !hasRoom;
  refs.startMatchButton.disabled = !hasRoom || running || !snapshot.isHost;
  refs.practiceButton.disabled = !canStartSolo;
  refs.createRoomButton.disabled = hasRoom;
  refs.joinRoomButton.disabled = hasRoom;
  refs.roomCodeInput.disabled = hasRoom;
}

async function syncLobbyProfile() {
  clearScheduledProfileSync();
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
    await roomService.createRoom(currentProfile({ customName: true }));
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
    await roomService.joinRoom(roomCode, currentProfile({ customName: true }));
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
    const humanCount = getHumanPlayers(state.snapshot).length;
    if (humanCount > 1) {
      setNotice("A sala solo so pode ser aberta quando voce estiver sozinho.", true);
      return;
    }

    if (state.snapshot?.roomId && !state.snapshot?.isHost) {
      setNotice("Voce precisa ser o host para abrir a sala solo.", true);
      return;
    }

    if (!state.snapshot?.roomId) {
      await roomService.createRoom(currentProfile({ customName: true }));
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

async function endMatchEarly() {
  try {
    await roomService.endMatch();
    setMatchMenuOpen(false);
    setNotice("A partida foi encerrada pelo host.");
  } catch (error) {
    setNotice(error.message, true);
  }
}

async function transferLeadership(playerId) {
  const target = state.snapshot?.players?.[playerId];
  if (!target) {
    setNotice("Nao encontrei esse jogador para transferir a lideranca.", true);
    return;
  }

  try {
    await roomService.transferLeadership(playerId);
    setMatchMenuOpen(false);
    setNotice(`Lideranca transferida para ${target.name}.`);
  } catch (error) {
    setNotice(error.message, true);
  }
}

async function kickPlayerFromRoom(playerId) {
  const target = state.snapshot?.players?.[playerId];
  if (!target) {
    setNotice("Nao encontrei esse jogador para expulsar.", true);
    return;
  }

  if (!window.confirm(`Expulsar ${target.name || "Player"} da sala agora?`)) {
    return;
  }

  try {
    await roomService.kickPlayer(playerId);
    setNotice(`${target.name || "Player"} foi expulso da sala. Ele pode voltar se entrar novamente com o codigo.`);
  } catch (error) {
    setNotice(error.message, true);
  }
}

async function banPlayerFromRoom(playerId, options = {}) {
  const target = state.snapshot?.players?.[playerId];
  if (!target) {
    setNotice("Nao encontrei esse jogador para banir.", true);
    return;
  }

  const label = formatBanDuration(options.durationMs, options.permanent);
  const actionLabel = options.permanent ? "banir permanentemente" : `banir por ${label}`;
  if (!window.confirm(`Confirma ${actionLabel} ${target.name || "Player"} desta sala?`)) {
    return;
  }

  try {
    await roomService.banPlayer(playerId, options);
    setNotice(`${target.name || "Player"} foi banido ${options.permanent ? "permanentemente" : `por ${label}`}.`);
  } catch (error) {
    setNotice(error.message, true);
  }
}

async function promptCustomBan(playerId) {
  const target = state.snapshot?.players?.[playerId];
  if (!target) {
    setNotice("Nao encontrei esse jogador para banir.", true);
    return;
  }

  const input = window.prompt(
    `Tempo do banimento para ${target.name || "Player"}.\nUse formatos como 30m, 2h ou 1d.\nSe digitar so um numero, ele sera tratado em minutos.`,
    "90m"
  );
  if (input === null) {
    return;
  }

  const durationMs = parseBanDurationInput(input);
  if (!durationMs) {
    setNotice("Tempo de banimento invalido. Use algo como 30m, 2h ou 1d.", true);
    return;
  }

  await banPlayerFromRoom(playerId, { durationMs });
}

async function handleRoomModerationAction(button) {
  const action = button?.dataset?.roomAction;
  const playerId = button?.dataset?.playerId;
  if (!action || !playerId) {
    return;
  }

  if (action === "kick") {
    await kickPlayerFromRoom(playerId);
    return;
  }

  if (action === "ban-hour") {
    await banPlayerFromRoom(playerId, { durationMs: 60 * 60 * 1000 });
    return;
  }

  if (action === "ban-permanent") {
    await banPlayerFromRoom(playerId, { permanent: true });
    return;
  }

  if (action === "ban-custom") {
    await promptCustomBan(playerId);
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

refs.playerName.addEventListener("input", scheduleLobbyProfileSync);
refs.playerName.addEventListener("change", syncLobbyProfile);
refs.playerName.addEventListener("blur", syncLobbyProfile);
refs.createRoomButton.addEventListener("click", createRoom);
refs.joinRoomButton.addEventListener("click", joinRoom);
refs.practiceButton.addEventListener("click", startSoloRoom);
refs.leaveRoomButton.addEventListener("click", leaveRoom);
refs.startMatchButton.addEventListener("click", startMatch);
refs.copyRoomButton.addEventListener("click", copyRoomCode);
refs.matchMenuCloseButton?.addEventListener("click", () => setMatchMenuOpen(false));
refs.matchMenuBackButton?.addEventListener("click", returnToRootMenu);
refs.matchMenuLeaveButton?.addEventListener("click", leaveRoom);
refs.matchMenuEndButton?.addEventListener("click", endMatchEarly);
refs.matchMenuVideoButton?.addEventListener("click", openVideoMenu);
refs.matchMenuSoundButton?.addEventListener("click", openSoundMenu);
refs.matchMenuVideoSlider?.addEventListener("input", (event) => updateFieldOfView(event.target.value));
refs.matchMenuSoundSlider?.addEventListener("input", (event) => updateEffectsVolume(event.target.value));
refs.matchMenuVideoSlider?.addEventListener("pointerdown", () => setVideoAdjusting(true));
refs.matchMenuVideoSlider?.addEventListener("pointerup", () => setVideoAdjusting(false));
refs.matchMenuVideoSlider?.addEventListener("pointercancel", () => setVideoAdjusting(false));
refs.matchMenuVideoSlider?.addEventListener("lostpointercapture", () => setVideoAdjusting(false));
refs.mobileMenuButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setMatchMenuOpen(!state.matchMenuOpen);
});
refs.matchMenuOverlay?.addEventListener("click", (event) => {
  if (event.target === refs.matchMenuOverlay) {
    setMatchMenuOpen(false);
  }
});
refs.matchMenuTransferList?.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-transfer-host]");
  if (!button) {
    return;
  }
  transferLeadership(button.dataset.transferHost);
});
refs.playerList?.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-room-action]");
  if (!button) {
    return;
  }
  handleRoomModerationAction(button);
});
refs.matchMenuModerationList?.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-room-action]");
  if (!button) {
    return;
  }
  handleRoomModerationAction(button);
});

window.addEventListener(
  "keydown",
  (event) => {
    if (!state.gameViewActive || isEditableTarget(event.target)) {
      return;
    }

    if (event.code === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setMatchMenuOpen(!state.matchMenuOpen);
      return;
    }

  if (state.matchMenuOpen) {
    event.preventDefault();
    event.stopPropagation();
  }
  },
  true
);

window.addEventListener(
  "pointerup",
  () => {
    if (state.matchVideoAdjusting) {
      setVideoAdjusting(false);
    }
  },
  true
);

window.addEventListener(
  "pointercancel",
  () => {
    if (state.matchVideoAdjusting) {
      setVideoAdjusting(false);
    }
  },
  true
);

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

  if (localRecord?.color) {
    state.selectedColor = normalizePlayerColor(localRecord.color);
    storeSelectedPlayerColor(state.selectedColor);
  }

  renderColorChoices(snapshot);
  renderPlayerList(snapshot);
  updateButtons(snapshot);
  game.setPlayerName(refs.playerName.value.trim() || "Player");
  game.setSelectedLoadout(state.selectedLoadoutId);
  game.setSnapshot(snapshot);
  syncGameView(snapshot);
  if (!state.gameViewActive || !snapshot.roomId) {
    setMatchMenuOpen(false);
  } else if (state.matchMenuOpen) {
    renderMatchMenu();
  }
  setNotice("");
});

renderColorChoices();
renderWeapons();
renderWeaponDetail();
setNotice("");

const deferredRoomNotice = consumeDeferredRoomNotice();
if (deferredRoomNotice) {
  setNotice(deferredRoomNotice, true);
}
