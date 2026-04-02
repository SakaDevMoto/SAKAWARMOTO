import {
  LOADOUTS,
  MAX_PLAYERS,
  MATCH_LENGTH_MS,
  PLAYER_RADIUS,
  RESPAWN_DELAY_MS,
  RESPAWN_SHIELD_MS,
  WORLD_SIZE,
  angleToVector,
  clamp,
  createRng,
  getLoadout,
  getSpawnPoint,
  getStormState,
  normalize,
  randomCode,
  seedFromText,
  uid,
  wrapAngle,
} from "./data.js";

const PROFILE_KEY = "lz_profile";
const POSE_KEY = "lz_pose";
const COMBAT_KEY = "lz_combat";
const MATCH_KEY = "lz_match";
const ACTION_RPC = "lz_action";
const SNAPSHOT_INTERVAL_MS = 70;
const HOST_TICK_MS = 50;
const MATCH_PUSH_INTERVAL_MS = 80;
const MINE_SLOW_DURATION_MS = 1800;
const RECON_REVEAL_DURATION_MS = 700;
const GRAVITY_PULL_STEP_SCALE = 0.012;
const GRAVITY_PULL_CENTER_PAD = 10;

function emptyMatchState() {
  return {
    state: "idle",
    hostId: null,
    seed: null,
    startedAt: null,
    endsAt: null,
    winnerId: null,
    contestants: 0,
    revision: 0,
    updatedAt: 0,
    events: [],
  };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function createProfileState(profile = {}) {
  const loadout = getLoadout(profile.loadoutId || LOADOUTS[0].id);
  return {
    name: profile.name || "Piloto",
    loadoutId: loadout.id,
    color: profile.color || loadout.theme,
    joinedAt: profile.joinedAt || Date.now(),
  };
}

function createPoseState(pose = {}) {
  return {
    x: clamp(pose.x ?? WORLD_SIZE / 2, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
    y: clamp(pose.y ?? WORLD_SIZE / 2, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
    aim: pose.aim ?? 0,
    updatedAt: pose.updatedAt || Date.now(),
  };
}

function createCombatState(profile = {}, patch = {}) {
  const loadout = getLoadout(profile.loadoutId || patch.loadoutId || LOADOUTS[0].id);
  return {
    name: profile.name || patch.name || "Piloto",
    loadoutId: loadout.id,
    color: profile.color || patch.color || loadout.theme,
    health: patch.health ?? loadout.maxHealth,
    shield: patch.shield ?? loadout.maxShield,
    alive: patch.alive ?? true,
    kills: patch.kills ?? 0,
    deaths: patch.deaths ?? 0,
    respawns: patch.respawns ?? 0,
    respawnAt: patch.respawnAt ?? 0,
    effects: patch.effects ?? {},
    maxHealth: loadout.maxHealth,
    maxShield: loadout.maxShield,
    updatedAt: patch.updatedAt || Date.now(),
  };
}

function sanitizeMatchState(value) {
  const fallback = emptyMatchState();
  if (!value || typeof value !== "object") {
    return fallback;
  }

  return {
    state: value.state || fallback.state,
    hostId: value.hostId || null,
    seed: Number.isFinite(Number(value.seed)) ? Number(value.seed) : null,
    startedAt: Number.isFinite(Number(value.startedAt)) ? Number(value.startedAt) : null,
    endsAt: Number.isFinite(Number(value.endsAt)) ? Number(value.endsAt) : null,
    winnerId: value.winnerId || null,
    contestants: Number.isFinite(Number(value.contestants)) ? Number(value.contestants) : 0,
    revision: Number.isFinite(Number(value.revision)) ? Number(value.revision) : 0,
    updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0,
    events: safeArray(value.events)
      .filter((event) => event && typeof event === "object")
      .sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0))
      .slice(-260),
  };
}

function mergeEffects(current = {}, patch = {}) {
  const next = {
    ...current,
    ...patch,
  };

  Object.keys(next).forEach((key) => {
    if (!next[key]) {
      delete next[key];
    }
  });

  return next;
}

function clonePlayerRecord(record) {
  return {
    ...record,
    effects: {
      ...(record.effects || {}),
    },
  };
}

function comparePlayersForScore(left, right) {
  if ((right.kills || 0) !== (left.kills || 0)) {
    return (right.kills || 0) - (left.kills || 0);
  }

  if ((left.deaths || 0) !== (right.deaths || 0)) {
    return (left.deaths || 0) - (right.deaths || 0);
  }

  const leftVitality = (left.health || 0) + (left.shield || 0);
  const rightVitality = (right.health || 0) + (right.shield || 0);
  if (rightVitality !== leftVitality) {
    return rightVitality - leftVitality;
  }

  return (left.joinedAt || 0) - (right.joinedAt || 0);
}

function hasPlayroomConfig(config) {
  return Boolean(
    (window.Playroom || null) &&
      typeof config?.playroomGameId === "string" &&
      config.playroomGameId.trim()
  );
}

export function getNetworkDescriptor(config) {
  if (hasPlayroomConfig(config)) {
    return {
      mode: "playroom",
      label: "Playroom online habilitado",
      detail: "Salas, codigo e sincronizacao rodam pelo Playroom sem backend proprio.",
    };
  }

  return {
    mode: "missing",
    label: "Playroom nao configurado",
    detail: "Preencha o gameId em playroom.config.js para abrir salas online pelo GitHub Pages.",
  };
}

class PlayroomRoomService {
  constructor(config) {
    this.mode = "playroom";
    this.config = config;
    this.playroom = window.Playroom || null;
    this.rpc = this.playroom?.RPC || window.RPC || null;
    this.listeners = new Set();
    this.players = new Map();
    this.snapshot = this.buildEmptySnapshot();
    this.localPlayer = null;
    this.roomId = null;
    this.connected = false;
    this.pollTimer = null;
    this.hostTimer = null;
    this.pendingProfile = null;
    this.pendingMatchSync = false;
    this.rpcRegistered = false;
    this.lastMatchPushAt = 0;
    this.matchState = emptyMatchState();
    this.authority = {
      players: new Map(),
      projectiles: new Map(),
      effects: new Map(),
    };
  }

  buildEmptySnapshot() {
    return {
      roomId: "",
      meta: emptyMatchState(),
      players: {},
      events: [],
      localPlayerId: null,
      isHost: false,
      networkMode: "playroom",
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitSnapshot() {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  buildSnapshot() {
    if (!this.connected || !this.playroom || !this.localPlayer) {
      return this.buildEmptySnapshot();
    }

    const match = sanitizeMatchState(this.playroom.getState(MATCH_KEY));
    const players = {};

    for (const [playerId, playerState] of this.players) {
      const record = this.readPlayerRecord(playerState);
      if (record) {
        players[playerId] = record;
      }
    }

    return {
      roomId: this.roomId || "",
      meta: match,
      players,
      events: match.events,
      localPlayerId: this.localPlayer.id,
      isHost: this.playroom.isHost(),
      networkMode: "playroom",
    };
  }

  readPlayerRecord(playerState) {
    const profile = playerState.getState(PROFILE_KEY) || createProfileState();
    const pose = playerState.getState(POSE_KEY) || createPoseState();
    const combat = playerState.getState(COMBAT_KEY) || createCombatState(profile);
    const loadout = getLoadout(profile.loadoutId || combat.loadoutId);

    return {
      id: playerState.id,
      name: profile.name || combat.name || "Piloto",
      loadoutId: profile.loadoutId || combat.loadoutId || loadout.id,
      color: profile.color || combat.color || loadout.theme,
      joinedAt: profile.joinedAt || Date.now(),
      x: pose.x,
      y: pose.y,
      aim: pose.aim ?? 0,
      health: combat.health ?? loadout.maxHealth,
      shield: combat.shield ?? loadout.maxShield,
      maxHealth: loadout.maxHealth,
      maxShield: loadout.maxShield,
      alive: combat.alive !== false,
      kills: combat.kills || 0,
      deaths: combat.deaths || 0,
      respawns: combat.respawns || 0,
      respawnAt: combat.respawnAt || 0,
      effects: combat.effects || {},
      updatedAt: Math.max(pose.updatedAt || 0, combat.updatedAt || 0),
    };
  }

  registerRpc() {
    if (!this.rpc || this.rpcRegistered) {
      return;
    }

    this.rpc.register(ACTION_RPC, async (data, sender) => {
      if (!this.playroom.isHost()) {
        return "ignored";
      }

      this.processAction(sender.id, data);
      return "ok";
    });

    this.rpcRegistered = true;
  }

  startPolling() {
    if (!this.pollTimer) {
      this.pollTimer = window.setInterval(() => {
        this.emitSnapshot();
        this.syncHostLoopStatus();
      }, SNAPSHOT_INTERVAL_MS);
    }
  }

  stopPolling() {
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  syncHostLoopStatus() {
    if (!this.connected || !this.playroom || !this.localPlayer) {
      this.stopHostLoop();
      return;
    }

    if (this.playroom.isHost()) {
      if (!this.hostTimer) {
        this.hostTimer = window.setInterval(() => {
          this.hostTick();
        }, HOST_TICK_MS);
      }
      return;
    }

    this.stopHostLoop();
  }

  stopHostLoop() {
    if (this.hostTimer) {
      window.clearInterval(this.hostTimer);
      this.hostTimer = null;
    }
  }

  registerPlayer(playerState) {
    if (!playerState) {
      return;
    }

    this.players.set(playerState.id, playerState);
    playerState.onQuit((state) => {
      this.players.delete(state.id);
      this.authority.players.delete(state.id);
      this.emitSnapshot();
    });

    this.emitSnapshot();
  }

  async connect(profile, roomCode = "") {
    if (!this.playroom) {
      throw new Error("Playroom nao carregou nesta pagina.");
    }

    const requestedRoomCode = String(roomCode || "").trim().toUpperCase();
    const profileState = createProfileState(profile);
    this.pendingProfile = profileState;
    this.registerRpc();

    await this.playroom.insertCoin({
      gameId: this.config.playroomGameId,
      roomCode: requestedRoomCode || undefined,
      skipLobby: true,
      maxPlayersPerRoom: Math.max(2, this.config.maxPlayersPerRoom || MAX_PLAYERS),
      reconnectGracePeriod: this.config.reconnectGracePeriodMs || 15000,
      baseUrl: this.config.roomBaseUrl || undefined,
      defaultStates: {
        [MATCH_KEY]: emptyMatchState(),
      },
      defaultPlayerStates: {
        [PROFILE_KEY]: profileState,
        [POSE_KEY]: createPoseState(),
        [COMBAT_KEY]: createCombatState(profileState),
      },
    });

    this.connected = true;
    this.localPlayer = this.playroom.myPlayer();
    this.roomId = this.playroom.getRoomCode();
    this.matchState = sanitizeMatchState(this.playroom.getState(MATCH_KEY));
    this.players.clear();
    this.registerPlayer(this.localPlayer);
    this.playroom.onPlayerJoin((playerState) => {
      this.registerPlayer(playerState);
    });
    this.playroom.onDisconnect(() => {
      this.connected = false;
      this.stopPolling();
      this.stopHostLoop();
      this.emitSnapshot();
    });

    const runningMatch = this.matchState.state === "running" || this.matchState.state === "ended";
    if (runningMatch && requestedRoomCode) {
      await this.localPlayer.leaveRoom();
      this.connected = false;
      throw new Error("Essa sala ja esta no meio de uma partida. Use outra sala.");
    }

    this.localPlayer.setState(PROFILE_KEY, profileState, true);
    if (!runningMatch) {
      this.localPlayer.setState(COMBAT_KEY, createCombatState(profileState), true);
      this.localPlayer.setState(POSE_KEY, createPoseState(), false);
    }

    this.startPolling();
    this.syncHostLoopStatus();
    this.emitSnapshot();
    return this.snapshot;
  }

  async createRoom(profile) {
    return this.connect(profile);
  }

  async joinRoom(roomCode, profile) {
    return this.connect(profile, roomCode);
  }

  async updateLobbyProfile(profile) {
    if (!this.localPlayer) {
      return;
    }

    const nextProfile = createProfileState({
      ...profile,
      joinedAt: this.localPlayer.getState(PROFILE_KEY)?.joinedAt || Date.now(),
    });

    this.localPlayer.setState(PROFILE_KEY, nextProfile, true);

    const match = sanitizeMatchState(this.playroom.getState(MATCH_KEY));
    if (match.state !== "running") {
      this.localPlayer.setState(COMBAT_KEY, createCombatState(nextProfile), true);
    }

    this.emitSnapshot();
  }

  async updatePose(pose) {
    if (!this.localPlayer || !this.connected) {
      return;
    }

    const currentPose = this.localPlayer.getState(POSE_KEY) || createPoseState();
    this.localPlayer.setState(
      POSE_KEY,
      createPoseState({
        ...currentPose,
        ...pose,
        updatedAt: Date.now(),
      }),
      false
    );
  }

  async requestAction(action) {
    if (!this.connected || !this.localPlayer) {
      return;
    }

    const payload = {
      ...action,
      seq: Number(action.seq || 0),
      createdAt: action.createdAt || Date.now(),
    };

    if (this.playroom.isHost()) {
      this.processAction(this.localPlayer.id, payload);
      return;
    }

    if (!this.rpc) {
      throw new Error("RPC do Playroom nao ficou disponivel nesta pagina.");
    }

    await this.rpc.call(ACTION_RPC, payload, this.rpc.Mode.HOST);
  }

  async startMatch(seed) {
    if (!this.connected || !this.playroom.isHost()) {
      throw new Error("Apenas o host pode iniciar a partida.");
    }

    const now = Date.now();
    const players = this.getOrderedPlayers();
    const normalizedSeed = Number(seed) || seedFromText(`${this.roomId}:${now}`);

    this.matchState = sanitizeMatchState(this.playroom.getState(MATCH_KEY));
    this.matchState = {
      state: "running",
      hostId: this.localPlayer.id,
      seed: normalizedSeed,
      startedAt: now,
      endsAt: now + MATCH_LENGTH_MS,
      winnerId: null,
      contestants: players.length,
      revision: (this.matchState.revision || 0) + 1,
      updatedAt: now,
      events: [],
    };

    this.authority.players.clear();
    this.authority.projectiles.clear();
    this.authority.effects.clear();

    players.forEach((player, index) => {
      const spawn = getSpawnPoint(index, players.length, normalizedSeed);
      const profile = this.getProfileState(player.id);
      const combat = createCombatState(profile, {
        health: getLoadout(profile.loadoutId).maxHealth,
        shield: getLoadout(profile.loadoutId).maxShield,
        alive: true,
        kills: 0,
        deaths: 0,
        respawns: 0,
        respawnAt: 0,
        effects: {},
      });

      player.setState(POSE_KEY, createPoseState({ x: spawn.x, y: spawn.y, aim: 0 }), false);
      player.setState(COMBAT_KEY, combat, true);
      this.authority.players.set(player.id, {
        nextPrimaryAt: 0,
        cooldowns: { Q: 0, E: 0, R: 0 },
        lastSeq: 0,
        stormCarry: 0,
        respawnQueuedAt: 0,
      });
    });

    this.pendingMatchSync = true;
    this.flushMatchState(true);
    this.emitSnapshot();
  }

  async leaveRoom() {
    if (!this.connected || !this.localPlayer) {
      return;
    }

    if (this.playroom.isHost()) {
      const others = this.getOrderedPlayers().filter((player) => player.id !== this.localPlayer.id);
      if (others.length && typeof this.playroom.transferHost === "function") {
        try {
          await this.playroom.transferHost(others[0].id);
        } catch (error) {
          console.warn("Nao foi possivel transferir o host antes de sair.", error);
        }
      }
    }

    await this.localPlayer.leaveRoom();
    window.location.reload();
  }

  getOrderedPlayers() {
    return Array.from(this.players.values()).sort((left, right) => {
      const leftJoinedAt = left.getState(PROFILE_KEY)?.joinedAt || 0;
      const rightJoinedAt = right.getState(PROFILE_KEY)?.joinedAt || 0;
      return leftJoinedAt - rightJoinedAt;
    });
  }

  getProfileState(playerId) {
    const playerState = this.players.get(playerId);
    return playerState?.getState(PROFILE_KEY) || createProfileState();
  }

  getPoseState(playerId) {
    const playerState = this.players.get(playerId);
    return playerState?.getState(POSE_KEY) || createPoseState();
  }

  getCombatState(playerId) {
    const playerState = this.players.get(playerId);
    const profile = this.getProfileState(playerId);
    return playerState?.getState(COMBAT_KEY) || createCombatState(profile);
  }

  setCombatState(playerId, patch, reliable = true) {
    const playerState = this.players.get(playerId);
    if (!playerState) {
      return null;
    }

    const profile = this.getProfileState(playerId);
    const current = this.getCombatState(playerId);
    const next = createCombatState(profile, {
      ...current,
      ...patch,
      effects: mergeEffects(current.effects, patch.effects || {}),
      updatedAt: Date.now(),
    });

    playerState.setState(COMBAT_KEY, next, reliable);
    return next;
  }

  setPoseState(playerId, patch, reliable = false) {
    const playerState = this.players.get(playerId);
    if (!playerState) {
      return null;
    }

    const current = this.getPoseState(playerId);
    const next = createPoseState({
      ...current,
      ...patch,
      updatedAt: Date.now(),
    });

    playerState.setState(POSE_KEY, next, reliable);
    return next;
  }

  getPlayerRecord(playerId) {
    const playerState = this.players.get(playerId);
    return playerState ? this.readPlayerRecord(playerState) : null;
  }

  getLiveRecords() {
    return this.getOrderedPlayers()
      .map((playerState) => this.readPlayerRecord(playerState))
      .filter(Boolean);
  }

  getScoreboardRecords() {
    return this.getLiveRecords().sort(comparePlayersForScore);
  }

  findRespawnPoint(playerId, now) {
    const players = this.getOrderedPlayers();
    const index = Math.max(
      0,
      players.findIndex((player) => player.id === playerId)
    );
    const record = this.getPlayerRecord(playerId);
    const profile = this.getProfileState(playerId);
    const respawnSeed =
      (this.matchState.seed || 0) +
      seedFromText(`${playerId}:${record?.respawns || 0}:${now}:${profile.loadoutId || LOADOUTS[0].id}`);

    return getSpawnPoint(index, Math.max(players.length, 1), respawnSeed);
  }

  ensureAuthorityPlayer(playerId) {
    const existing = this.authority.players.get(playerId);
    if (existing) {
      return existing;
    }

    const initial = {
      nextPrimaryAt: 0,
      cooldowns: { Q: 0, E: 0, R: 0 },
      lastSeq: 0,
      stormCarry: 0,
      respawnQueuedAt: 0,
    };
    this.authority.players.set(playerId, initial);
    return initial;
  }

  enqueueEvent(event) {
    this.matchState.events = [
      ...safeArray(this.matchState.events),
      {
        id: event.id || uid("evt_"),
        createdAt: event.createdAt || Date.now(),
        ...event,
      },
    ].slice(-260);

    this.matchState.updatedAt = Date.now();
    this.matchState.revision += 1;
    this.pendingMatchSync = true;
  }

  flushMatchState(reliable = false) {
    if (!this.connected || !this.playroom || !this.localPlayer) {
      return;
    }

    this.matchState = sanitizeMatchState({
      ...this.matchState,
      hostId: this.localPlayer.id,
    });
    this.playroom.setState(MATCH_KEY, this.matchState, reliable);
    this.lastMatchPushAt = Date.now();
    this.pendingMatchSync = false;
  }

  processAction(playerId, action) {
    const match = sanitizeMatchState(this.playroom.getState(MATCH_KEY));
    if (match.state !== "running") {
      return;
    }

    this.matchState = match;
    const actor = this.getPlayerRecord(playerId);
    if (!actor || actor.alive === false) {
      return;
    }

    const actorPose =
      action.pose && typeof action.pose === "object"
        ? {
            ...actor,
            ...createPoseState(action.pose),
          }
        : actor;

    const authority = this.ensureAuthorityPlayer(playerId);
    if ((action.seq || 0) <= authority.lastSeq) {
      return;
    }

    authority.lastSeq = action.seq || authority.lastSeq + 1;

    if (action.kind === "primary") {
      this.processPrimaryAction(actorPose, authority, action);
      return;
    }

    if (action.kind === "ability") {
      this.processAbilityAction(actorPose, authority, action);
    }
  }

  processPrimaryAction(actor, authority, action) {
    const now = Date.now();
    const loadout = getLoadout(actor.loadoutId);
    const primary = loadout.primary;
    const rateMs = Math.round(
      (actor.effects?.overclockUntil || 0) > now ? primary.rate * 760 : primary.rate * 1000
    );

    if (now < authority.nextPrimaryAt) {
      return;
    }

    authority.nextPrimaryAt = now + rateMs;

    if (loadout.id === "tempest" || loadout.id === "volt") {
      const angle = actor.aim + ((loadout.id === "tempest" ? Math.random() - 0.5 : 0) * (primary.spread || 0));
      const velocity = angleToVector(angle, primary.speed);
      const projectileId = uid("proj_");
      this.authority.projectiles.set(projectileId, {
        id: projectileId,
        ownerId: actor.id,
        loadoutId: loadout.id,
        x: actor.x + Math.cos(angle) * 26,
        y: actor.y + Math.sin(angle) * 26,
        vx: velocity.x,
        vy: velocity.y,
        radius: primary.radius,
        damage: primary.damage,
        lifetime: primary.lifetime,
        explosionRadius: primary.explosionRadius || null,
        color: primary.color,
        age: 0,
      });

      this.enqueueEvent({
        type: "projectile",
        ownerId: actor.id,
        loadoutId: loadout.id,
        x: actor.x + Math.cos(angle) * 26,
        y: actor.y + Math.sin(angle) * 26,
        vx: velocity.x,
        vy: velocity.y,
        radius: primary.radius,
        damage: primary.damage,
        lifetime: primary.lifetime,
        explosionRadius: primary.explosionRadius || null,
        color: primary.color,
      });
      return;
    }

    if (loadout.id === "phantom") {
      const hit = this.castRay(actor, actor.aim, primary.range, 14, false, actor.id);
      const end = hit?.point || {
        x: actor.x + Math.cos(actor.aim) * primary.range,
        y: actor.y + Math.sin(actor.aim) * primary.range,
      };

      this.enqueueEvent({
        type: "hitscan",
        ownerId: actor.id,
        loadoutId: loadout.id,
        x: actor.x,
        y: actor.y,
        toX: end.x,
        toY: end.y,
        color: primary.color,
        width: 4,
        sfx: "sniper",
      });

      if (hit?.targetId) {
        this.applyDamage(hit.targetId, primary.damage, actor.id, "Tiro de precisao");
      }
      return;
    }

    if (loadout.id === "ember") {
      const traces = [];
      const hits = new Map();

      for (let pellet = 0; pellet < primary.pellets; pellet += 1) {
        const angle = actor.aim + (Math.random() - 0.5) * primary.spread;
        const hit = this.castRay(actor, angle, primary.range, 18, false, actor.id);
        const point = hit?.point || {
          x: actor.x + Math.cos(angle) * primary.range,
          y: actor.y + Math.sin(angle) * primary.range,
        };
        traces.push(point);

        if (hit?.targetId) {
          hits.set(hit.targetId, (hits.get(hit.targetId) || 0) + primary.damage);
        }
      }

      this.enqueueEvent({
        type: "shotgun",
        ownerId: actor.id,
        loadoutId: loadout.id,
        x: actor.x,
        y: actor.y,
        traces,
        color: primary.color,
      });

      hits.forEach((damage, targetId) => {
        this.applyDamage(targetId, damage, actor.id, "Escopeta vulcanica");
      });
    }
  }

  processAbilityAction(actor, authority, action) {
    const now = Date.now();
    const loadout = getLoadout(actor.loadoutId);
    const ability = loadout.abilities.find((entry) => entry.slot === action.slot);

    if (!ability || now < authority.cooldowns[action.slot]) {
      return;
    }

    authority.cooldowns[action.slot] = now + ability.cooldown;

    switch (`${loadout.id}:${action.slot}`) {
      case "tempest:Q":
        this.performDash(actor, 190, loadout.theme);
        break;
      case "tempest:E":
        {
          const effectId = uid("mine_");
          this.authority.effects.set(uid("fx_"), {
            id: effectId,
            type: "mine",
            ownerId: actor.id,
            x: actor.x,
            y: actor.y,
            radius: 88,
            armedAt: now + 400,
            expiresAt: now + 7000,
            damage: 34,
            color: loadout.theme,
          });
          this.enqueueEvent({
            type: "mine",
            effectId,
            ownerId: actor.id,
            loadoutId: loadout.id,
            x: actor.x,
            y: actor.y,
            radius: 88,
            armedAt: now + 400,
            expiresAt: now + 7000,
            damage: 34,
            color: loadout.theme,
          });
        }
        break;
      case "tempest:R":
        this.setCombatState(actor.id, {
          effects: {
            overclockUntil: now + 6000,
          },
        });
        this.enqueueEvent({
          type: "buff",
          ownerId: actor.id,
          loadoutId: loadout.id,
          buff: "overclock",
          x: actor.x,
          y: actor.y,
          color: loadout.theme,
        });
        break;
      case "ember:Q": {
        const origin = { x: actor.x, y: actor.y };
        const finalPose = this.performDash(actor, 175, loadout.theme);
        this.enqueueEvent({
          type: "slam",
          ownerId: actor.id,
          loadoutId: loadout.id,
          fromX: origin.x,
          fromY: origin.y,
          toX: finalPose.x,
          toY: finalPose.y,
          radius: 128,
          color: loadout.theme,
        });
        this.radialDamage(finalPose.x, finalPose.y, 128, 24, actor.id, "Breach Slam");
        break;
      }
      case "ember:E":
        this.setCombatState(actor.id, {
          shield: Math.min(actor.maxShield + 36, actor.shield + 36),
          effects: {
            barrierUntil: now + 4500,
          },
        });
        this.enqueueEvent({
          type: "buff",
          ownerId: actor.id,
          loadoutId: loadout.id,
          buff: "barrier",
          x: actor.x,
          y: actor.y,
          color: loadout.theme,
        });
        break;
      case "ember:R":
        this.enqueueEvent({
          type: "cone",
          ownerId: actor.id,
          loadoutId: loadout.id,
          x: actor.x,
          y: actor.y,
          angle: actor.aim,
          range: 260,
          color: loadout.theme,
        });
        this.coneDamage(actor, actor.aim, 260, 0.72, 30, actor.id, "Dragon Roar");
        break;
      case "phantom:Q":
        this.setCombatState(actor.id, {
          effects: {
            cloakUntil: now + 5000,
          },
        });
        this.enqueueEvent({
          type: "buff",
          ownerId: actor.id,
          loadoutId: loadout.id,
          buff: "cloak",
          x: actor.x,
          y: actor.y,
          color: loadout.theme,
        });
        break;
      case "phantom:E": {
        const beacon = this.pointAlongAim(actor, 180);
        const effectId = uid("recon_");
        this.authority.effects.set(uid("fx_"), {
          id: effectId,
          type: "recon",
          ownerId: actor.id,
          x: beacon.x,
          y: beacon.y,
          radius: 260,
          expiresAt: now + 5200,
          pulseEvery: 850,
          nextPulseAt: now + 120,
          color: loadout.theme,
        });
        this.enqueueEvent({
          type: "recon",
          effectId,
          ownerId: actor.id,
          loadoutId: loadout.id,
          x: beacon.x,
          y: beacon.y,
          radius: 260,
          expiresAt: now + 5200,
          pulseEvery: 850,
          color: loadout.theme,
        });
        break;
      }
      case "phantom:R": {
        const hits = this.castRay(actor, actor.aim, 1450, 18, true, actor.id);
        const end = hits.points.at(-1) || {
          x: actor.x + Math.cos(actor.aim) * 1450,
          y: actor.y + Math.sin(actor.aim) * 1450,
        };
        this.enqueueEvent({
          type: "hitscan",
          ownerId: actor.id,
          loadoutId: loadout.id,
          x: actor.x,
          y: actor.y,
          toX: end.x,
          toY: end.y,
          color: loadout.theme,
          width: 8,
          sfx: "beam",
        });
        hits.targets.forEach((target) => {
          this.applyDamage(target.targetId, 46, actor.id, "Pierce Line");
        });
        break;
      }
      case "volt:Q": {
        const origin = { x: actor.x, y: actor.y };
        const finalPose = this.performDash(actor, 160, loadout.theme);
        const chains = this.getTargetsInRadius(finalPose.x, finalPose.y, 175, actor.id).slice(0, 3);
        this.enqueueEvent({
          type: "arc-dash",
          ownerId: actor.id,
          loadoutId: loadout.id,
          fromX: origin.x,
          fromY: origin.y,
          toX: finalPose.x,
          toY: finalPose.y,
          chains: chains.map((target) => ({
            id: target.id,
            x: target.x,
            y: target.y,
          })),
          color: loadout.theme,
        });
        chains.forEach((target) => {
          this.applyDamage(target.id, 22, actor.id, "Arc Dash");
        });
        break;
      }
      case "volt:E": {
        const field = this.pointAlongAim(actor, 210);
        const effectId = uid("gravity_");
        this.authority.effects.set(uid("fx_"), {
          id: effectId,
          type: "gravity",
          ownerId: actor.id,
          x: field.x,
          y: field.y,
          radius: 172,
          expiresAt: now + 4600,
          pull: 360,
          pulseEvery: 780,
          nextPulseAt: now + 120,
          color: loadout.theme,
        });
        this.enqueueEvent({
          type: "gravity",
          effectId,
          ownerId: actor.id,
          loadoutId: loadout.id,
          x: field.x,
          y: field.y,
          radius: 172,
          expiresAt: now + 4600,
          pull: 360,
          pulseEvery: 780,
          color: loadout.theme,
        });
        break;
      }
      case "volt:R": {
        const core = this.pointAlongAim(actor, 250);
        const effectId = uid("storm_");
        this.authority.effects.set(uid("fx_"), {
          id: effectId,
          type: "storm",
          ownerId: actor.id,
          x: core.x,
          y: core.y,
          radius: 150,
          expiresAt: now + 5600,
          damage: 13,
          pulseEvery: 1000,
          nextPulseAt: now + 1000,
          color: loadout.theme,
        });
        this.enqueueEvent({
          type: "storm",
          effectId,
          ownerId: actor.id,
          loadoutId: loadout.id,
          x: core.x,
          y: core.y,
          radius: 150,
          expiresAt: now + 5600,
          damage: 13,
          pulseEvery: 1000,
          color: loadout.theme,
        });
        break;
      }
      default:
        break;
    }
  }

  pointAlongAim(actor, distance) {
    return {
      x: clamp(actor.x + Math.cos(actor.aim) * distance, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
      y: clamp(actor.y + Math.sin(actor.aim) * distance, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
    };
  }

  performDash(actor, distance, color) {
    const to = {
      x: clamp(actor.x + Math.cos(actor.aim) * distance, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
      y: clamp(actor.y + Math.sin(actor.aim) * distance, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
    };

    this.setPoseState(actor.id, { x: to.x, y: to.y, aim: actor.aim }, false);
    this.enqueueEvent({
      type: "dash",
      ownerId: actor.id,
      loadoutId: actor.loadoutId,
      fromX: actor.x,
      fromY: actor.y,
      toX: to.x,
      toY: to.y,
      color,
    });

    return to;
  }

  getTargetsInRadius(x, y, radius, excludeId = null) {
    return this.getLiveRecords()
      .filter((record) => record.alive !== false && record.id !== excludeId)
      .map((record) => ({
        ...clonePlayerRecord(record),
        distance: Math.hypot(record.x - x, record.y - y),
      }))
      .filter((record) => record.distance <= radius)
      .sort((left, right) => left.distance - right.distance);
  }

  castRay(actor, angle, range, thickness, pierce, excludeId = null) {
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const targets = this.getLiveRecords()
      .filter((record) => record.alive !== false && record.id !== excludeId)
      .map((record) => {
        const projection =
          (record.x - actor.x) * directionX + (record.y - actor.y) * directionY;

        if (projection < 0 || projection > range) {
          return null;
        }

        const closestX = actor.x + directionX * projection;
        const closestY = actor.y + directionY * projection;
        const separation = Math.hypot(record.x - closestX, record.y - closestY);

        if (separation > PLAYER_RADIUS + thickness) {
          return null;
        }

        return {
          targetId: record.id,
          point: { x: closestX, y: closestY },
          projection,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.projection - right.projection);

    if (!pierce) {
      return targets[0] || null;
    }

    return {
      targets,
      points: targets.map((target) => target.point),
    };
  }

  radialDamage(x, y, radius, amount, ownerId, source) {
    this.getTargetsInRadius(x, y, radius, ownerId).forEach((target) => {
      this.applyDamage(target.id, amount, ownerId, source);
    });
  }

  coneDamage(actor, angle, range, arc, amount, ownerId, source) {
    this.getLiveRecords()
      .filter((record) => record.alive !== false && record.id !== ownerId)
      .forEach((record) => {
        const distance = Math.hypot(record.x - actor.x, record.y - actor.y);
        if (distance > range) {
          return;
        }

        const diff = Math.abs(wrapAngle(Math.atan2(record.y - actor.y, record.x - actor.x) - angle));
        if (diff <= arc) {
          this.applyDamage(record.id, amount, ownerId, source);
        }
      });
  }

  applyTimedEffect(targetId, effectKey, until) {
    const target = this.getPlayerRecord(targetId);
    if (!target || target.alive === false || !effectKey || until <= 0) {
      return;
    }

    this.setCombatState(targetId, {
      effects: {
        [effectKey]: Math.max(target.effects?.[effectKey] || 0, until),
      },
    });
  }

  pullTargetTowardPoint(targetId, centerX, centerY, maxStep) {
    const target = this.getPlayerRecord(targetId);
    if (!target || target.alive === false || maxStep <= 0) {
      return;
    }

    const dx = centerX - target.x;
    const dy = centerY - target.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= GRAVITY_PULL_CENTER_PAD) {
      return;
    }

    const pull = normalize(dx, dy);
    const step = Math.min(maxStep, Math.max(0, distance - GRAVITY_PULL_CENTER_PAD));
    if (step <= 0) {
      return;
    }

    this.setPoseState(
      targetId,
      {
        x: clamp(target.x + pull.x * step, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
        y: clamp(target.y + pull.y * step, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
      },
      false
    );
  }

  applyDamage(targetId, amount, ownerId, source) {
    const now = Date.now();
    const target = this.getPlayerRecord(targetId);
    if (!target || target.alive === false || amount <= 0) {
      return;
    }

    if ((target.effects?.spawnShieldUntil || 0) > now) {
      return;
    }

    let remaining = amount;
    const shieldDamage = Math.min(target.shield, remaining);
    const nextShield = Math.max(0, target.shield - shieldDamage);
    remaining -= shieldDamage;
    const nextHealth = Math.max(0, target.health - remaining);
    const nextAlive = nextHealth > 0;
    const nextEffects = {
      ...(target.effects || {}),
      revealedUntil: source === "Recon Beacon" ? now + 600 : target.effects?.revealedUntil,
    };

    this.setCombatState(targetId, {
      shield: nextShield,
      health: nextHealth,
      alive: nextAlive,
      effects: nextEffects,
    });

    this.enqueueEvent({
      type: "damage",
      ownerId,
      targetId,
      amount,
      source,
    });

    if (!nextAlive) {
      const authority = this.ensureAuthorityPlayer(targetId);
      authority.stormCarry = 0;
      authority.nextPrimaryAt = now + RESPAWN_DELAY_MS;
      authority.cooldowns = { Q: 0, E: 0, R: 0 };
      authority.respawnQueuedAt = now + RESPAWN_DELAY_MS;

      this.setCombatState(targetId, {
        health: 0,
        shield: 0,
        alive: false,
        deaths: (target.deaths || 0) + 1,
        respawnAt: now + RESPAWN_DELAY_MS,
        effects: {
          barrierUntil: null,
          cloakUntil: null,
          overclockUntil: null,
          revealedUntil: null,
          slowedUntil: null,
          spawnShieldUntil: null,
        },
      });

      if (ownerId && ownerId !== targetId) {
        const owner = this.getPlayerRecord(ownerId);
        if (owner) {
          this.setCombatState(ownerId, {
            kills: (owner.kills || 0) + 1,
          });
        }
      }

      this.enqueueEvent({
        type: "elimination",
        ownerId,
        targetId,
        byId: ownerId,
        source,
      });
    }
  }

  cleanupExpiredEffects(now) {
    this.getLiveRecords().forEach((record) => {
      const effectPatch = {};
      let changed = false;

      Object.entries(record.effects || {}).forEach(([key, value]) => {
        if ((value || 0) <= now) {
          effectPatch[key] = null;
          changed = true;
        }
      });

      if (changed) {
        this.setCombatState(record.id, {
          effects: effectPatch,
          shield:
            (record.effects?.barrierUntil || 0) <= now && record.shield > record.maxShield
              ? record.maxShield
              : record.shield,
        });
      }
    });
  }

  processRespawns(now) {
    this.getLiveRecords()
      .filter((record) => record.alive === false && (record.respawnAt || 0) > 0 && record.respawnAt <= now)
      .forEach((record) => {
        const profile = this.getProfileState(record.id);
        const loadout = getLoadout(profile.loadoutId);
        const authority = this.ensureAuthorityPlayer(record.id);
        const spawn = this.findRespawnPoint(record.id, now);

        authority.stormCarry = 0;
        authority.nextPrimaryAt = now + 350;
        authority.cooldowns = { Q: 0, E: 0, R: 0 };
        authority.respawnQueuedAt = 0;

        this.setPoseState(record.id, {
          x: spawn.x,
          y: spawn.y,
          aim: 0,
        });

        this.setCombatState(record.id, {
          health: loadout.maxHealth,
          shield: loadout.maxShield,
          alive: true,
          respawnAt: 0,
          respawns: (record.respawns || 0) + 1,
          effects: {
            barrierUntil: null,
            cloakUntil: null,
            overclockUntil: null,
            revealedUntil: null,
            slowedUntil: null,
            spawnShieldUntil: now + RESPAWN_SHIELD_MS,
          },
        });

        this.enqueueEvent({
          type: "respawn",
          playerId: record.id,
          loadoutId: loadout.id,
          x: spawn.x,
          y: spawn.y,
          color: loadout.theme,
        });
      });
  }

  hostTick() {
    if (!this.connected || !this.playroom || !this.localPlayer || !this.playroom.isHost()) {
      return;
    }

    const now = Date.now();
    this.matchState = sanitizeMatchState(this.playroom.getState(MATCH_KEY));

    if (this.matchState.hostId !== this.localPlayer.id) {
      this.matchState.hostId = this.localPlayer.id;
      this.pendingMatchSync = true;
    }

    this.authority.players.forEach((value, playerId) => {
      if (!this.players.has(playerId)) {
        this.authority.players.delete(playerId);
      }
    });

    if (this.matchState.state === "running") {
      this.simulateProjectiles(now);
      this.simulateEffects(now);
      this.applyStormDamage(now);
      this.cleanupExpiredEffects(now);
      this.processRespawns(now);
      this.evaluateWinner(now);
    }

    if (this.pendingMatchSync || now - this.lastMatchPushAt >= MATCH_PUSH_INTERVAL_MS) {
      this.flushMatchState(false);
      this.emitSnapshot();
    }
  }

  simulateProjectiles(now) {
    this.authority.projectiles.forEach((projectile, projectileId) => {
      projectile.lastUpdatedAt = projectile.lastUpdatedAt || now;
      const delta = (now - projectile.lastUpdatedAt) / 1000;
      projectile.lastUpdatedAt = now;
      projectile.age += delta;
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;

      const hit = this.getTargetsInRadius(
        projectile.x,
        projectile.y,
        projectile.radius + PLAYER_RADIUS,
        projectile.ownerId
      )[0];

      if (hit) {
        if (projectile.explosionRadius) {
          this.radialDamage(
            projectile.x,
            projectile.y,
            projectile.explosionRadius,
            projectile.damage,
            projectile.ownerId,
            "Orbe de impacto"
          );
        } else {
          this.applyDamage(hit.id, projectile.damage, projectile.ownerId, "Rifle ciclico");
        }

        this.authority.projectiles.delete(projectileId);
        return;
      }

      const expired =
        projectile.age >= projectile.lifetime ||
        projectile.x < 0 ||
        projectile.y < 0 ||
        projectile.x > WORLD_SIZE ||
        projectile.y > WORLD_SIZE;

      if (!expired) {
        return;
      }

      if (projectile.explosionRadius) {
        this.radialDamage(
          projectile.x,
          projectile.y,
          projectile.explosionRadius,
          projectile.damage,
          projectile.ownerId,
          "Orbe de impacto"
        );
      }

      this.authority.projectiles.delete(projectileId);
    });
  }

  simulateEffects(now) {
    this.authority.effects.forEach((effect, effectId) => {
      if ((effect.expiresAt || 0) <= now) {
        this.authority.effects.delete(effectId);
        return;
      }

      if (effect.type === "mine" && now >= effect.armedAt) {
        const victims = this.getTargetsInRadius(effect.x, effect.y, effect.radius, effect.ownerId);
        if (victims.length) {
          this.enqueueEvent({
            type: "mine-detonate",
            effectId: effect.id,
            ownerId: effect.ownerId,
            x: effect.x,
            y: effect.y,
            radius: effect.radius,
            color: effect.color,
          });
          victims.forEach((target) => {
            this.applyTimedEffect(target.id, "slowedUntil", now + MINE_SLOW_DURATION_MS);
            this.applyDamage(target.id, effect.damage, effect.ownerId, "Pulse Mine");
          });
          this.authority.effects.delete(effectId);
        }
        return;
      }

      if (effect.type === "storm" && now >= (effect.nextPulseAt || now)) {
        effect.nextPulseAt = now + effect.pulseEvery;
        this.enqueueEvent({
          type: "storm-pulse",
          effectId: effect.id,
          ownerId: effect.ownerId,
          x: effect.x,
          y: effect.y,
          radius: effect.radius,
          color: effect.color,
        });
        this.getTargetsInRadius(effect.x, effect.y, effect.radius, effect.ownerId).forEach((target) => {
          this.applyDamage(target.id, effect.damage, effect.ownerId, "Storm Core");
        });
        return;
      }

      if (effect.type === "gravity") {
        this.getTargetsInRadius(effect.x, effect.y, effect.radius, effect.ownerId).forEach((target) => {
          const falloff = clamp(1 - target.distance / Math.max(effect.radius, 1), 0.28, 1);
          this.pullTargetTowardPoint(
            target.id,
            effect.x,
            effect.y,
            effect.pull * GRAVITY_PULL_STEP_SCALE * falloff
          );
        });

        if (now >= (effect.nextPulseAt || now)) {
          effect.nextPulseAt = now + effect.pulseEvery;
          this.enqueueEvent({
            type: "gravity-pulse",
            effectId: effect.id,
            ownerId: effect.ownerId,
            x: effect.x,
            y: effect.y,
            radius: effect.radius,
            color: effect.color,
          });
        }
        return;
      }

      if (effect.type === "recon") {
        if (now >= (effect.nextPulseAt || now)) {
          effect.nextPulseAt = now + effect.pulseEvery;
          this.enqueueEvent({
            type: "recon-pulse",
            effectId: effect.id,
            ownerId: effect.ownerId,
            x: effect.x,
            y: effect.y,
            radius: effect.radius,
            color: effect.color,
          });
        }
        this.getTargetsInRadius(effect.x, effect.y, effect.radius, effect.ownerId).forEach((target) => {
          this.applyTimedEffect(target.id, "revealedUntil", now + RECON_REVEAL_DURATION_MS);
        });
      }
    });
  }

  applyStormDamage(now) {
    if (!this.matchState.startedAt || !this.matchState.seed) {
      return;
    }

    const storm = getStormState(this.matchState.startedAt, this.matchState.seed, now);
    this.getLiveRecords().forEach((record) => {
      if (record.alive === false) {
        return;
      }

      const distance = Math.hypot(record.x - storm.center.x, record.y - storm.center.y);
      if (distance <= storm.radius) {
        const authority = this.ensureAuthorityPlayer(record.id);
        authority.stormCarry = 0;
        return;
      }

      const authority = this.ensureAuthorityPlayer(record.id);
      authority.stormCarry += (storm.damagePerSecond * HOST_TICK_MS) / 1000;
      const damage = Math.floor(authority.stormCarry);
      if (damage <= 0) {
        return;
      }

      authority.stormCarry -= damage;
      this.applyDamage(record.id, damage, "storm", "Tempestade");
    });
  }

  evaluateWinner(now) {
    const endsAt = this.matchState.endsAt || ((this.matchState.startedAt || now) + MATCH_LENGTH_MS);
    if (now < endsAt) {
      return;
    }

    const leaderboard = this.getScoreboardRecords();

    this.matchState.state = "ended";
    this.matchState.winnerId = leaderboard[0]?.id || null;
    this.matchState.endsAt = endsAt;
    this.matchState.updatedAt = now;
    this.matchState.revision += 1;
    this.pendingMatchSync = true;
  }
}

class MissingConfigService {
  constructor() {
    this.mode = "missing";
    this.listeners = new Set();
    this.snapshot = {
      roomId: "",
      meta: emptyMatchState(),
      players: {},
      events: [],
      localPlayerId: null,
      isHost: false,
      networkMode: "missing",
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async createRoom() {
    throw new Error("Preencha o playroomGameId em playroom.config.js antes de criar a sala.");
  }

  async joinRoom() {
    throw new Error("Preencha o playroomGameId em playroom.config.js antes de entrar numa sala.");
  }

  async updateLobbyProfile() {}

  async updatePose() {}

  async requestAction() {}

  async startMatch() {
    throw new Error("Configure o Playroom para iniciar a partida online.");
  }

  async leaveRoom() {}
}

export function createRoomService(config) {
  return hasPlayroomConfig(config) ? new PlayroomRoomService(config) : new MissingConfigService();
}
