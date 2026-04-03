export const WORLD_SIZE = 2400;
export const PLAYER_RADIUS = 20;
export const MATCH_LENGTH_MS = 300000;
export const RESPAWN_DELAY_MS = 4200;
export const RESPAWN_SHIELD_MS = 2200;
export const MAX_PLAYERS = 10;
export const STATE_PUSH_INTERVAL = 50;

export const PLAYER_COLOR_OPTIONS = [
  { id: "ruby", label: "Rubi", value: "#ff5f6d" },
  { id: "blaze", label: "Blaze", value: "#ff9f43" },
  { id: "solar", label: "Solar", value: "#f6d743" },
  { id: "lime", label: "Lima", value: "#8bd448" },
  { id: "emerald", label: "Esmeralda", value: "#2ed573" },
  { id: "cyan", label: "Ciano", value: "#18dcff" },
  { id: "azure", label: "Azure", value: "#4d96ff" },
  { id: "indigo", label: "Indigo", value: "#6c5ce7" },
  { id: "violet", label: "Violeta", value: "#b84dff" },
  { id: "magenta", label: "Magenta", value: "#ff4db8" },
];

export const PLAYER_COLOR_PALETTE = PLAYER_COLOR_OPTIONS.map((option) => option.value);

export const LOADOUTS = [
  {
    id: "tempest",
    name: "Tempest Rifle",
    theme: "#5ff3d6",
    accent: "#1a5447",
    summary: "Pressao movel, rajadas constantes e controle de espaco.",
    moveSpeed: 236,
    maxHealth: 201,
    maxShield: 45,
    primary: {
      label: "Rifle ciclico",
      rate: 0.11,
      damage: 11,
      speed: 940,
      radius: 5.5,
      lifetime: 1.15,
      spread: 0.04,
      color: "#6fffe5",
      sfx: "rifle",
    },
    abilities: [
      {
        slot: "Q",
        id: "flash-step",
        name: "Flash Step",
        cooldown: 6000,
        summary: "Dash curto na mira, deixa um rastro ionizado e reposiciona rapido.",
      },
      {
        slot: "E",
        id: "pulse-mine",
        name: "Pulse Mine",
        cooldown: 15000,
        damageLabel: "34 dano",
        summary: "Arremessa uma mina na mira; ela detona por proximidade, causa dano em area e desacelera quem a aciona.",
      },
      {
        slot: "R",
        id: "overclock",
        name: "Overclock",
        cooldown: 18000,
        summary: "Aumenta velocidade e cadencia por 6 segundos.",
      },
    ],
  },
  {
    id: "ember",
    name: "Ember Shotgun",
    theme: "#ff9e63",
    accent: "#6b3116",
    summary: "Entrada agressiva, burst de perto e protecao para briga curta.",
    moveSpeed: 228,
    maxHealth: 201,
    maxShield: 35,
    primary: {
      label: "Escopeta vulcanica",
      rate: 0.72,
      damage: 9,
      pellets: 7,
      range: 420,
      spread: 0.38,
      color: "#ffb37d",
      sfx: "shotgun",
    },
    abilities: [
      {
        slot: "Q",
        id: "breach-slam",
        name: "Breach Slam",
        cooldown: 8000,
        damageLabel: "24 dano",
        summary: "Salto ofensivo com impacto em area no ponto de chegada.",
      },
      {
        slot: "E",
        id: "barrier-shell",
        name: "Barrier Shell",
        cooldown: 14000,
        summary: "Cria um escudo adicional temporario para atravessar trocas pesadas.",
      },
      {
        slot: "R",
        id: "dragon-roar",
        name: "Dragon Roar",
        cooldown: 17500,
        damageLabel: "30 dano",
        summary: "Sopro de fogo em cone que castiga inimigos muito proximos.",
      },
    ],
  },
  {
    id: "volt",
    name: "Volt Launcher",
    theme: "#ffe673",
    accent: "#66550d",
    summary: "Zona eletrica, explosoes lentas e controle de terreno.",
    moveSpeed: 224,
    maxHealth: 201,
    maxShield: 40,
    primary: {
      label: "Orbe de impacto",
      rate: 0.42,
      damage: 19,
      speed: 620,
      radius: 9,
      lifetime: 1.5,
      explosionRadius: 78,
      color: "#fff29e",
      sfx: "launcher",
    },
    abilities: [
      {
        slot: "Q",
        id: "arc-dash",
        name: "Arc Orb",
        cooldown: 9000,
        damageLabel: "22 / impacto",
        summary: "Orbe guiado que rastreia um alvo e ricocheteia ate 3 vezes, acelerando entre impactos.",
      },
      {
        slot: "E",
        id: "gravity-well",
        name: "Gravity Well",
        cooldown: 12500,
        damageLabel: "10 / pulso",
        summary: "Po de gravidade que puxa jogadores para o centro e causa pulsos de dano.",
      },
      {
        slot: "R",
        id: "storm-core",
        name: "Storm Core",
        cooldown: 19000,
        damageLabel: "13 / pulso",
        summary: "Nucleo tempestuoso em area com pulsos sucessivos de dano eletrico.",
      },
    ],
  },
  {
    id: "phantom",
    name: "Phantom Sniper",
    theme: "#b78cff",
    accent: "#4c2b6f",
    summary: "Precisao, camuflagem e leitura de alvo para picks cirurgicos.",
    moveSpeed: 232,
    maxHealth: 186,
    maxShield: 30,
    primary: {
      label: "Tiro de precisao",
      rate: 0.88,
      damage: 44,
      range: 1120,
      color: "#dcc0ff",
      sfx: "sniper",
    },
    abilities: [
      {
        slot: "Q",
        id: "phase-cloak",
        name: "Phase Cloak",
        cooldown: 10000,
        summary: "Camufla por 5 segundos, acelera o deslocamento e exige revelacao para ser rastreado.",
      },
      {
        slot: "E",
        id: "recon-beacon",
        name: "Recon Beacon",
        cooldown: 14500,
        summary: "Instala um beacon que pulsa revelacao numa area por alguns segundos.",
      },
      {
        slot: "R",
        id: "pierce-line",
        name: "Pierce Line",
        cooldown: 18500,
        damageLabel: "46 dano",
        summary: "Feixe perfurante de longo alcance que atravessa varios alvos alinhados.",
      },
    ],
  },
];

export const LOADOUT_MAP = Object.fromEntries(LOADOUTS.map((loadout) => [loadout.id, loadout]));

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function uid(prefix = "") {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

export function randomCode(length = 5) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export function angleToVector(angle, magnitude = 1) {
  return {
    x: Math.cos(angle) * magnitude,
    y: Math.sin(angle) * magnitude,
  };
}

export function normalize(x, y) {
  const size = Math.hypot(x, y) || 1;
  return { x: x / size, y: y / size };
}

export function wrapAngle(angle) {
  while (angle > Math.PI) {
    angle -= Math.PI * 2;
  }
  while (angle < -Math.PI) {
    angle += Math.PI * 2;
  }
  return angle;
}

export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function seedFromText(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

export function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function getLoadout(loadoutId) {
  return LOADOUT_MAP[loadoutId] ?? LOADOUTS[0];
}

export function buildStormPhases(seed) {
  const rng = createRng(seed);
  const durations = [50000, 55000, 60000, 65000, 70000];
  const radii = [1030, 830, 610, 430, 250, 125];
  let center = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
  let offsetBudget = 0;
  let elapsed = 0;
  const phases = [];

  for (let index = 0; index < durations.length; index += 1) {
    const startRadius = radii[index];
    const endRadius = radii[index + 1];
    offsetBudget = Math.max(120, startRadius - endRadius - 65);
    const angle = rng() * Math.PI * 2;
    const distance = offsetBudget * (0.28 + rng() * 0.54);
    const target = {
      x: clamp(center.x + Math.cos(angle) * distance, endRadius + 60, WORLD_SIZE - endRadius - 60),
      y: clamp(center.y + Math.sin(angle) * distance, endRadius + 60, WORLD_SIZE - endRadius - 60),
    };

    phases.push({
      index,
      damagePerSecond: 2 + index,
      startAt: elapsed,
      endAt: elapsed + durations[index],
      startRadius,
      endRadius,
      startCenter: center,
      endCenter: target,
    });

    center = target;
    elapsed += durations[index];
  }

  return phases;
}

export function getStormState(startedAt, seed, now = Date.now()) {
  const phases = buildStormPhases(seed);
  const elapsed = clamp(now - startedAt, 0, MATCH_LENGTH_MS);

  for (const phase of phases) {
    if (elapsed <= phase.endAt) {
      const span = phase.endAt - phase.startAt || 1;
      const progress = clamp((elapsed - phase.startAt) / span, 0, 1);
      return {
        radius: lerp(phase.startRadius, phase.endRadius, progress),
        center: {
          x: lerp(phase.startCenter.x, phase.endCenter.x, progress),
          y: lerp(phase.startCenter.y, phase.endCenter.y, progress),
        },
        damagePerSecond: phase.damagePerSecond,
        phaseIndex: phase.index,
        closingIn: true,
        remainingMs: phase.endAt - elapsed,
      };
    }
  }

  const lastPhase = phases.at(-1);
  return {
    radius: lastPhase.endRadius,
    center: lastPhase.endCenter,
    damagePerSecond: lastPhase.damagePerSecond + 1,
    phaseIndex: lastPhase.index,
    closingIn: false,
    remainingMs: 0,
  };
}

export function getSpawnPoint(index, totalPlayers, seed) {
  const rng = createRng(seed + index * 97);
  const ringRadius = WORLD_SIZE * 0.34;
  const angle = (index / Math.max(totalPlayers, 1)) * Math.PI * 2 + rng() * 0.35;
  return {
    x: clamp(WORLD_SIZE / 2 + Math.cos(angle) * ringRadius + (rng() - 0.5) * 180, 80, WORLD_SIZE - 80),
    y: clamp(WORLD_SIZE / 2 + Math.sin(angle) * ringRadius + (rng() - 0.5) * 180, 80, WORLD_SIZE - 80),
  };
}
