import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

import {
  LOADOUTS,
  PLAYER_RADIUS,
  STATE_PUSH_INTERVAL,
  WORLD_SIZE,
  clamp,
  createRng,
  formatClock,
  getLoadout,
  getStormState,
  normalize,
  wrapAngle,
} from "./data.js";

const TAU = Math.PI * 2;
const MOBILE_QUERY = "(pointer: coarse)";
const PLAYER_Y = 18;
const CAMERA_HEIGHT = 620;
const CAMERA_DISTANCE = 500;
const CAMERA_LOOK_HEIGHT = 24;
const DEFAULT_FIELD_OF_VIEW = 52;
const MIN_FIELD_OF_VIEW = 34;
const MAX_FIELD_OF_VIEW = 88;
const ARC_ORB_SPEED = 280;
const ARC_ORB_LIFETIME = 3.8;
const ARC_ORB_TARGET_RANGE = 460;
const ARC_ORB_TARGET_ARC = 0.96;
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const HALF_WORLD_SIZE = WORLD_SIZE * 0.5;

function disposeMaterial(material) {
  if (!material) {
    return;
  }

  if (Array.isArray(material)) {
    material.forEach((entry) => entry?.dispose?.());
    return;
  }

  material.dispose?.();
}

function disposeObject(object) {
  if (!object) {
    return;
  }

  object.traverse((node) => {
    node.geometry?.dispose?.();
    disposeMaterial(node.material);
  });
}

function scoreSort(left, right) {
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderAbilityIconSvg(ability) {
  switch (ability?.id) {
    case "flash-step":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12h8"></path>
          <path d="M9 7l5 5-5 5"></path>
          <path d="M15 7h5"></path>
          <path d="M17 17h3"></path>
        </svg>
      `;
    case "pulse-mine":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.5"></circle>
          <circle cx="12" cy="12" r="7.5"></circle>
          <path d="M12 2.5v3"></path>
          <path d="M12 18.5v3"></path>
          <path d="M2.5 12h3"></path>
          <path d="M18.5 12h3"></path>
        </svg>
      `;
    case "overclock":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 2 6 13h5l-1 9 8-12h-5z"></path>
          <path d="M4 5l2 2"></path>
          <path d="M18 17l2 2"></path>
        </svg>
      `;
    case "breach-slam":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v7"></path>
          <path d="M9 7l3 3 3-3"></path>
          <path d="M5 17h14"></path>
          <path d="M7 21h10"></path>
          <path d="M4 14l2 2"></path>
          <path d="M20 14l-2 2"></path>
        </svg>
      `;
    case "barrier-shell":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 5.5 6v5.2c0 4.3 2.6 7.9 6.5 9.8 3.9-1.9 6.5-5.5 6.5-9.8V6z"></path>
          <path d="M8.5 12h7"></path>
          <path d="M12 8.5v7"></path>
        </svg>
      `;
    case "dragon-roar":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12c3.2-3.6 6.7-4.8 10.5-4.1"></path>
          <path d="M4 12c3.2 3.6 6.7 4.8 10.5 4.1"></path>
          <path d="M10.5 9.2 15 6l.2 4"></path>
          <path d="M10.5 14.8 15 18l.2-4"></path>
          <path d="M16 10.2h4"></path>
          <path d="M16 13.8h3.2"></path>
        </svg>
      `;
    case "arc-dash":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="8" cy="12" r="2.5"></circle>
          <path d="M10.5 10.2c2.2-2.6 5-3.8 8-3.7"></path>
          <path d="M11 13.8c2.1 2.2 4.8 3.3 7.5 3.2"></path>
          <path d="M17.5 6.5 20 8.8l-3.3.8"></path>
          <path d="M17.5 17.5 20 15.2l-3.3-.8"></path>
        </svg>
      `;
    case "gravity-well":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="2.8"></circle>
          <path d="M12 3.5v4"></path>
          <path d="M12 16.5v4"></path>
          <path d="M3.5 12h4"></path>
          <path d="M16.5 12h4"></path>
          <path d="M6.2 6.2 9 9"></path>
          <path d="M17.8 6.2 15 9"></path>
        </svg>
      `;
    case "storm-core":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2.8v3"></path>
          <path d="M12 18.2v3"></path>
          <path d="M2.8 12h3"></path>
          <path d="M18.2 12h3"></path>
          <path d="M7 7l2.2 2.2"></path>
          <path d="M17 7l-2.2 2.2"></path>
          <path d="M7 17l2.2-2.2"></path>
        </svg>
      `;
    default:
      return "";
  }
}

function resolvePlayerColor(player, fallback = "#5ff3d6") {
  return player?.color || fallback;
}

function isEditableTarget(target) {
  const tagName = target?.tagName?.toUpperCase?.() || "";
  return Boolean(target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(tagName));
}

export class BattleRoyaleGame {
  constructor({ canvas, ui, audio, onPose, onAction }) {
    this.canvas = canvas;
    this.ui = ui;
    this.audio = audio;
    this.onPose = onPose;
    this.onAction = onAction;

    this.snapshot = {
      roomId: "",
      meta: {
        state: "idle",
        hostId: null,
        seed: null,
        startedAt: null,
        endsAt: null,
        winnerId: null,
        events: [],
      },
      players: {},
      events: [],
      localPlayerId: null,
      isHost: false,
      networkMode: "missing",
    };

    this.playerName = "Player";
    this.selectedLoadoutId = LOADOUTS[0].id;
    this.localPose = {
      x: WORLD_SIZE / 2,
      y: WORLD_SIZE / 2,
      aim: 0,
    };
    this.remotePlayers = new Map();
    this.playerVisuals = new Map();
    this.mapDecor = this.createMapDecor();
    this.decorVisuals = [];
    this.projectiles = [];
    this.groundEffects = [];
    this.beams = [];
    this.particles = [];
    this.killFeed = [];
    this.hitFlashes = new Map();
    this.damageNumbers = [];
    this.lastDurabilityByPlayer = new Map();
    this.lastDamageVisualAt = new Map();
    this.processedEvents = new Set();
    this.processedQueue = [];
    this.statusTrailAt = new Map();
    this.currentMatchKey = null;
    this.actionSeq = 0;
    this.lastPosePushAt = 0;
    this.lastHudRefresh = 0;
    this.lastFrame = 0;
    this.localTimers = {
      primaryReadyAt: 0,
      Q: 0,
      E: 0,
      R: 0,
    };
    this.localEffectPreviewUntil = {
      barrier: 0,
    };
    this.showMatchDetails = false;
    this.menuOpen = false;

    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = {
      x: canvas.clientWidth * 0.5 || canvas.width * 0.5,
      y: canvas.clientHeight * 0.5 || canvas.height * 0.5,
      down: false,
      inside: false,
    };

    this.mobile = {
      enabled: window.matchMedia(MOBILE_QUERY).matches,
      move: { pointerId: null, x: 0, y: 0, anchorClientX: 0, anchorClientY: 0 },
      aim: { pointerId: null, x: 0, y: 0, active: false, anchorClientX: 0, anchorClientY: 0 },
      manualFire: false,
      fire: false,
      abilityTarget: {
        active: false,
        pointerId: null,
        slot: null,
        effectId: null,
        previewKey: null,
        target: null,
        startClientX: 0,
        startClientY: 0,
        startWorld: null,
      },
    };
    this.performanceProfile = {
      pixelRatioCap: this.mobile.enabled ? 1.1 : 1.6,
      fxScale: this.mobile.enabled ? 0.72 : 1,
      maxParticles: this.mobile.enabled ? 160 : 300,
      shadowsEnabled: !this.mobile.enabled,
    };
    this.rendererMetrics = {
      width: 0,
      height: 0,
      pixelRatio: 0,
    };
    this.hudCache = {
      killFeedHtml: "",
      scoreboardHtml: "",
    };
    this.abilityUiState = {
      desktopKey: "",
      desktopButtons: new Map(),
      mobileKey: "",
    };
    this.sharedGeometries = {
      projectile: new THREE.SphereGeometry(1, 10, 10),
      burstParticle: new THREE.SphereGeometry(1, 8, 8),
      tinyParticle: new THREE.SphereGeometry(1, 6, 6),
    };
    this.tempVectors = {
      focus: new THREE.Vector3(),
      desiredCamera: new THREE.Vector3(),
    };

    this.camera = {
      x: WORLD_SIZE / 2,
      y: WORLD_SIZE / 2,
    };
    this.fieldOfView = DEFAULT_FIELD_OF_VIEW;

    this.pointerNdc = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#050d15");
    this.scene.fog = new THREE.Fog("#06111b", 850, 3600);

    this.camera3D = new THREE.PerspectiveCamera(this.fieldOfView, 16 / 9, 1, 5200);
    this.worldRoot = new THREE.Group();
    this.fxRoot = new THREE.Group();
    this.scene.add(this.worldRoot);
    this.scene.add(this.fxRoot);

    this.buildScene();
    this.applyPerformanceProfile(true);
    this.syncRendererSize(true);
    this.bindInput();
    this.bindMobileControls();
    this.bindAbilityUi();
    this.refreshAbilityBar();
    this.loop = this.loop.bind(this);
    window.requestAnimationFrame(this.loop);
  }

  createMapDecor() {
    const rng = createRng(9328401);
    return Array.from({ length: 34 }, () => ({
      x: 150 + rng() * (WORLD_SIZE - 300),
      y: 150 + rng() * (WORLD_SIZE - 300),
      radius: 30 + rng() * 70,
      height: 28 + rng() * 90,
      tint: rng() > 0.5 ? "#5ff3d6" : "#ff9e63",
      rotation: rng() * TAU,
      wobble: 0.6 + rng() * 0.8,
    }));
  }

  buildScene() {
    const hemi = new THREE.HemisphereLight("#8dc7ff", "#081018", 1.2);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight("#fff3d0", 1.4);
    sun.position.set(260, 720, 180);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -1600;
    sun.shadow.camera.right = 1600;
    sun.shadow.camera.top = 1600;
    sun.shadow.camera.bottom = -1600;
    this.scene.add(sun);
    this.sunLight = sun;

    const rim = new THREE.PointLight("#55e7df", 0.8, 2400, 2);
    rim.position.set(0, 360, 0);
    this.scene.add(rim);

    const floorGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 36, 36);
    floorGeometry.rotateX(-Math.PI / 2);
    const floorPositions = floorGeometry.attributes.position;
    const rng = createRng(884422);
    for (let index = 0; index < floorPositions.count; index += 1) {
      const x = floorPositions.getX(index);
      const z = floorPositions.getZ(index);
      const ripple =
        Math.sin((x + WORLD_SIZE * 0.25) * 0.003) * 2.6 +
        Math.cos((z - WORLD_SIZE * 0.18) * 0.004) * 2.1 +
        (rng() - 0.5) * 1.4;
      floorPositions.setY(index, ripple);
    }
    floorGeometry.computeVertexNormals();

    const floor = new THREE.Mesh(
      floorGeometry,
      new THREE.MeshStandardMaterial({
        color: "#0b1722",
        roughness: 0.92,
        metalness: 0.14,
      })
    );
    floor.receiveShadow = true;
    this.worldRoot.add(floor);

    const floorGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE * 0.92, WORLD_SIZE * 0.92),
      new THREE.MeshBasicMaterial({
        color: "#103047",
        transparent: true,
        opacity: 0.18,
      })
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.y = 0.8;
    this.worldRoot.add(floorGlow);

    const grid = new THREE.GridHelper(WORLD_SIZE, 36, "#275f77", "#103042");
    grid.position.y = 1.2;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.32;
    });
    this.worldRoot.add(grid);

    this.createArenaWalls();
    this.createDecorMeshes();
    this.createStormVisual();
  }

  createArenaWalls() {
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: "#1a2d3d",
      roughness: 0.8,
      metalness: 0.12,
      emissive: "#0b1420",
      emissiveIntensity: 0.35,
    });
    const wallHeight = 48;
    const thickness = 24;
    const length = WORLD_SIZE + thickness * 2;
    const wallConfigs = [
      { position: [0, wallHeight * 0.5, -WORLD_SIZE * 0.5 - thickness * 0.5], size: [length, wallHeight, thickness] },
      { position: [0, wallHeight * 0.5, WORLD_SIZE * 0.5 + thickness * 0.5], size: [length, wallHeight, thickness] },
      { position: [-WORLD_SIZE * 0.5 - thickness * 0.5, wallHeight * 0.5, 0], size: [thickness, wallHeight, length] },
      { position: [WORLD_SIZE * 0.5 + thickness * 0.5, wallHeight * 0.5, 0], size: [thickness, wallHeight, length] },
    ];

    wallConfigs.forEach((config) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(...config.size), wallMaterial.clone());
      wall.position.set(...config.position);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.worldRoot.add(wall);
    });
  }

  createDecorMeshes() {
    this.mapDecor.forEach((decor) => {
      const group = new THREE.Group();
      const baseColor = new THREE.Color(decor.tint);

      const plinth = new THREE.Mesh(
        new THREE.CylinderGeometry(decor.radius * 0.34, decor.radius * 0.46, 14, 10),
        new THREE.MeshStandardMaterial({
          color: "#0f202c",
          roughness: 0.9,
          metalness: 0.08,
        })
      );
      plinth.position.y = 7;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      group.add(plinth);

      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(decor.radius * 0.42, decor.height, decor.radius * 0.24),
        new THREE.MeshStandardMaterial({
          color: baseColor.clone().multiplyScalar(0.55),
          emissive: baseColor,
          emissiveIntensity: 0.36,
          roughness: 0.3,
          metalness: 0.55,
        })
      );
      shard.position.y = decor.height * 0.5 + 12;
      shard.rotation.x = decor.rotation * 0.28;
      shard.rotation.z = decor.rotation * 0.44;
      shard.castShadow = true;
      group.add(shard);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(decor.radius * 0.54, 2.8, 12, 42),
        new THREE.MeshBasicMaterial({
          color: baseColor,
          transparent: true,
          opacity: 0.4,
        })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 8;
      group.add(ring);

      const position = this.toScenePoint(decor.x, decor.y, 0);
      group.position.copy(position);
      group.rotation.y = decor.rotation;
      group.userData = { wobble: decor.wobble, baseY: 8, ring };
      this.worldRoot.add(group);
      this.decorVisuals.push(group);
    });
  }

  createStormVisual() {
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 240, 96, 1, true),
      new THREE.MeshBasicMaterial({
        color: "#ff6757",
        transparent: true,
        opacity: 0.11,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    wall.position.y = 120;

    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.02, 16, 128),
      new THREE.MeshBasicMaterial({
        color: "#ffd166",
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })
    );
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 7;

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1.05, 128),
      new THREE.MeshBasicMaterial({
        color: "#ff6757",
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 2;

    const group = new THREE.Group();
    group.visible = false;
    group.add(wall);
    group.add(edge);
    group.add(halo);
    this.fxRoot.add(group);

    this.stormVisual = { group, wall, edge, halo };
  }

  bindInput() {
    this.canvas.tabIndex = 0;
    this.canvas.style.touchAction = "none";

    const updatePointer = (event) => {
      const bounds = this.canvas.getBoundingClientRect();
      this.mouse.x = clamp(event.clientX - bounds.left, 0, bounds.width);
      this.mouse.y = clamp(event.clientY - bounds.top, 0, bounds.height);
      this.mouse.inside = true;
    };

    this.canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "touch") {
        updatePointer(event);
      }
    });

    this.canvas.addEventListener("pointerdown", async (event) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") {
        updatePointer(event);
        if (event.button === 0) {
          this.mouse.down = true;
        }
        await this.audio.boot();
        this.canvas.focus();
      }
    });

    window.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "touch" && event.button === 0) {
        this.mouse.down = false;
      }
    });

    this.canvas.addEventListener("pointerleave", () => {
      this.mouse.inside = false;
    });

    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    window.addEventListener("keydown", async (event) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.code === "Tab") {
        if (this.snapshot.meta?.state === "running" || this.snapshot.meta?.state === "ended") {
          event.preventDefault();
          this.showMatchDetails = true;
        }
        return;
      }

      const isGameplayKey = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyR", "Enter"].includes(event.code);
      if (isGameplayKey && this.snapshot.meta?.state === "running") {
        event.preventDefault();
      }

      if (!this.keys.has(event.code)) {
        this.justPressed.add(event.code);
      }

      this.keys.add(event.code);
      await this.audio.boot();
    });

    window.addEventListener("keyup", (event) => {
      if (event.code === "Tab") {
        this.showMatchDetails = false;
        return;
      }
      this.keys.delete(event.code);
    });

    window.addEventListener("blur", () => {
      this.clearControlState();
      this.showMatchDetails = false;
      this.hideAbilityTooltip();
    });

    window.addEventListener("resize", () => {
      this.syncRendererSize();
    });

    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(() => {
        this.syncRendererSize();
      });
      this.resizeObserver.observe(this.canvas);
      if (this.canvas.parentElement) {
        this.resizeObserver.observe(this.canvas.parentElement);
      }
    }
  }

  bindMobileControls() {
    if (!this.ui.mobileControls || !this.ui.movePad || !this.ui.aimPad) {
      return;
    }

    const container = this.ui.mobileControls;

    const placeStick = (pad, event) => {
      const bounds = container.getBoundingClientRect();
      const padWidth = pad.offsetWidth || 124;
      const padHeight = pad.offsetHeight || padWidth;
      const halfWidth = padWidth * 0.5;
      const halfHeight = padHeight * 0.5;
      const localX = clamp(event.clientX - bounds.left, halfWidth + 4, bounds.width - halfWidth - 4);
      const localY = clamp(event.clientY - bounds.top, halfHeight + 4, bounds.height - halfHeight - 4);
      pad.style.left = `${localX - halfWidth}px`;
      pad.style.top = `${localY - halfHeight}px`;
      pad.classList.add("is-visible");
      return {
        anchorClientX: bounds.left + localX,
        anchorClientY: bounds.top + localY,
      };
    };

    const updateStick = (event, stick, state, isAim = false) => {
      if (state.pointerId !== event.pointerId) {
        return;
      }

      const padSize = stick?.parentElement?.offsetWidth || 124;
      const radius = Math.max(20, padSize * 0.34);
      const dx = event.clientX - (state.anchorClientX || event.clientX);
      const dy = event.clientY - (state.anchorClientY || event.clientY);
      const distance = Math.min(radius, Math.hypot(dx, dy) || 0);
      const angle = Math.atan2(dy, dx);
      const offsetX = Math.cos(angle) * distance;
      const offsetY = Math.sin(angle) * distance;

      state.x = clamp(offsetX / radius, -1, 1);
      state.y = clamp(offsetY / radius, -1, 1);
      if (isAim) {
        state.active = Math.hypot(state.x, state.y) > 0.16;
        this.syncMobileFireState();
      }

      if (stick) {
        stick.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
      }
    };

    const activateStick = async (event, pad, stick, state, isAim = false) => {
      if (!this.mobile.enabled || state.pointerId !== null) {
        return false;
      }

      const anchor = placeStick(pad, event);
      state.pointerId = event.pointerId;
      state.anchorClientX = anchor.anchorClientX;
      state.anchorClientY = anchor.anchorClientY;
      await this.audio.boot();
      updateStick(event, stick, state, isAim);
      return true;
    };

    const releaseStick = (event, stick, state, isAim = false) => {
      if (state.pointerId !== event.pointerId) {
        return;
      }
      this.resetJoystick(state, stick, isAim);
    };

    container.addEventListener("pointerdown", async (event) => {
      if (!this.mobile.enabled || event.pointerType !== "touch") {
        return;
      }
      if (
        event.target?.closest?.(".mobile-action") ||
        event.target?.closest?.("#aimPad") ||
        event.target?.closest?.(".mobile-menu-button")
      ) {
        return;
      }

      const bounds = container.getBoundingClientRect();
      const localX = event.clientX - bounds.left;
      const leftHalf = localX < bounds.width * 0.5;

      event.preventDefault();
      this.canvas.focus();

      if (leftHalf) {
        await activateStick(event, this.ui.movePad, this.ui.moveStick, this.mobile.move);
      }
    });

    this.ui.aimPad.addEventListener("pointerdown", async (event) => {
      if (!this.mobile.enabled || event.pointerType !== "touch" || this.mobile.aim.pointerId !== null) {
        return;
      }

      event.preventDefault();
      this.canvas.focus();
      const bounds = this.ui.aimPad.getBoundingClientRect();
      this.mobile.aim.pointerId = event.pointerId;
      this.mobile.aim.anchorClientX = bounds.left + bounds.width * 0.5;
      this.mobile.aim.anchorClientY = bounds.top + bounds.height * 0.5;
      await this.audio.boot();
      updateStick(event, this.ui.aimStick, this.mobile.aim, true);
    });

    window.addEventListener("pointermove", (event) => {
      updateStick(event, this.ui.moveStick, this.mobile.move);
      updateStick(event, this.ui.aimStick, this.mobile.aim, true);
    });

    const releaseDynamicSticks = (event) => {
      releaseStick(event, this.ui.moveStick, this.mobile.move);
      releaseStick(event, this.ui.aimStick, this.mobile.aim, true);
    };

    window.addEventListener("pointerup", releaseDynamicSticks);
    window.addEventListener("pointercancel", releaseDynamicSticks);

    if (this.ui.mobileFireButton) {
      let firePointerId = null;
      const activateFire = async (event) => {
        if (!this.mobile.enabled) {
          return;
        }
        event.preventDefault();
        firePointerId = event.pointerId;
        this.ui.mobileFireButton.setPointerCapture?.(event.pointerId);
        this.mobile.manualFire = true;
        this.syncMobileFireState();
        this.ui.mobileFireButton.classList.add("is-active");
        await this.audio.boot();
      };
      const releaseFire = (event) => {
        if (event && firePointerId !== null && event.pointerId !== firePointerId) {
          return;
        }
        firePointerId = null;
        this.mobile.manualFire = false;
        this.syncMobileFireState();
        this.ui.mobileFireButton.classList.remove("is-active");
      };

      this.ui.mobileFireButton.addEventListener("pointerdown", activateFire);
      this.ui.mobileFireButton.addEventListener("pointerup", releaseFire);
      this.ui.mobileFireButton.addEventListener("pointercancel", releaseFire);
      this.ui.mobileFireButton.addEventListener("pointerleave", releaseFire);
      this.ui.mobileFireButton.addEventListener("lostpointercapture", releaseFire);
    }

    Object.entries(this.ui.mobileAbilityButtons || {}).forEach(([slot, button]) => {
      let activePointerId = null;
      let holdTimer = null;
      let showingTooltip = false;
      let targeting = false;

      const clearHold = () => {
        if (holdTimer) {
          window.clearTimeout(holdTimer);
          holdTimer = null;
        }
      };

      const currentLoadout = () => getLoadout(this.getLocalRecord()?.loadoutId || this.selectedLoadoutId);

      const shouldStartPointTargeting = (event) => {
        const loadout = currentLoadout();
        if (!this.isPointTargetAbility(loadout.id, slot)) {
          return false;
        }

        const bounds = button.getBoundingClientRect();
        const outside =
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom;
        if (outside) {
          return true;
        }

        const centerX = bounds.left + bounds.width * 0.5;
        const centerY = bounds.top + bounds.height * 0.5;
        return Math.hypot(event.clientX - centerX, event.clientY - centerY) > Math.min(bounds.width, bounds.height) * 0.52;
      };

      const startTargeting = (event) => {
        const now = Date.now();
        const localRecord = this.getLocalRecord();
        const loadout = currentLoadout();
        if (!localRecord || localRecord.alive === false || this.getAbilityCooldownRemaining(slot, now) > 0) {
          return false;
        }

        targeting = true;
        showingTooltip = false;
        clearHold();
        this.hideAbilityTooltip();
        const startWorld = this.clientToWorld(event.clientX, event.clientY);
        this.mobile.abilityTarget = {
          active: true,
          pointerId: event.pointerId,
          slot,
          effectId: `mobile_effect_${this.snapshot.localPlayerId || "player"}_${slot}_${this.actionSeq + 1}_${Math.round(now)}`,
          previewKey: `mobile-target-${slot}`,
          target: null,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startWorld,
        };
        button.classList.add("is-targeting");
        this.syncMobileFireState();
        this.updateMobileAbilityTarget(event, localRecord, loadout, slot);
        return true;
      };

      button.addEventListener("pointerdown", async (event) => {
        if (!this.mobile.enabled) {
          return;
        }
        event.preventDefault();
        activePointerId = event.pointerId;
        targeting = false;
        showingTooltip = false;
        button.setPointerCapture?.(event.pointerId);
        button.classList.add("is-active");
        await this.audio.boot();
        holdTimer = window.setTimeout(() => {
          showingTooltip = true;
          this.showAbilityTooltip(button);
        }, 420);
      });

      button.addEventListener("pointermove", (event) => {
        if (activePointerId !== event.pointerId) {
          return;
        }

        if (targeting) {
          const localRecord = this.getLocalRecord();
          if (!localRecord || localRecord.alive === false) {
            return;
          }
          this.updateMobileAbilityTarget(event, localRecord, currentLoadout(), slot);
          return;
        }

        if (shouldStartPointTargeting(event)) {
          startTargeting(event);
        }
      });

      const clear = (event, triggerAbility = false) => {
        if (event && activePointerId !== null && event.pointerId !== activePointerId) {
          return;
        }
        const targetState = this.mobile.abilityTarget;
        const localRecord = this.getLocalRecord();
        const targetedPoint =
          targeting &&
          targetState.active &&
          targetState.pointerId === activePointerId &&
          targetState.slot === slot &&
          targetState.target;

        clearHold();
        if (triggerAbility && localRecord?.alive !== false) {
          if (targetedPoint) {
            this.castAbility(slot, Date.now(), localRecord, {
              targetX: targetState.target.x,
              targetY: targetState.target.y,
              effectId: targetState.effectId,
            });
          } else if (!showingTooltip) {
            this.castAbility(slot, Date.now(), localRecord);
          }
        }

        showingTooltip = false;
        targeting = false;
        activePointerId = null;
        button.classList.remove("is-active");
        button.classList.remove("is-targeting");
        this.hideAbilityTooltip();
        this.clearMobileAbilityTargeting();
      };

      button.addEventListener("pointerup", (event) => clear(event, true));
      button.addEventListener("pointercancel", clear);
      button.addEventListener("lostpointercapture", clear);
    });
  }

  bindAbilityUi() {
    if (!this.ui.abilityBar) {
      return;
    }

    const resolveButton = (target) => target?.closest?.("[data-ability-slot]");

    this.ui.abilityBar.addEventListener("pointerdown", (event) => {
      const button = resolveButton(event.target);
      if (!button) {
        return;
      }
      event.preventDefault();
      this.canvas.focus();
    });

    this.ui.abilityBar.addEventListener("pointerover", (event) => {
      if (this.mobile.enabled) {
        return;
      }
      const button = resolveButton(event.target);
      if (!button) {
        return;
      }
      this.showAbilityTooltip(button);
    });

    this.ui.abilityBar.addEventListener("pointermove", (event) => {
      if (this.mobile.enabled) {
        return;
      }
      const button = resolveButton(event.target);
      if (!button) {
        this.hideAbilityTooltip();
        return;
      }
      this.showAbilityTooltip(button);
    });

    this.ui.abilityBar.addEventListener("pointerleave", () => {
      this.hideAbilityTooltip();
    });
  }

  showAbilityTooltip(target) {
    if (!this.ui.abilityTooltip || !target) {
      return;
    }

    const abilityName = target.dataset.abilityName || target.dataset.abilitySlot || "";
    const abilityDetail = target.dataset.abilityDetail || "";
    const abilityDamage = target.dataset.abilityDamage || "";
    if (!abilityName && !abilityDetail) {
      this.hideAbilityTooltip();
      return;
    }

    this.ui.abilityTooltip.innerHTML = `
      <div class="ability-tooltip__head">
        <strong>${escapeHtml(abilityName)}</strong>
        ${abilityDamage ? `<small class="ability-tooltip__damage">${escapeHtml(abilityDamage)}</small>` : ""}
      </div>
      <span>${escapeHtml(abilityDetail)}</span>
    `;
    this.ui.abilityTooltip.hidden = false;

    const targetRect = target.getBoundingClientRect();
    const tooltipRect = this.ui.abilityTooltip.getBoundingClientRect();
    const left = clamp(
      targetRect.left + targetRect.width * 0.5 - tooltipRect.width * 0.5,
      12,
      window.innerWidth - tooltipRect.width - 12
    );
    const top = Math.max(12, targetRect.top - tooltipRect.height - 12);
    this.ui.abilityTooltip.style.left = `${left}px`;
    this.ui.abilityTooltip.style.top = `${top}px`;
  }

  hideAbilityTooltip() {
    if (!this.ui.abilityTooltip) {
      return;
    }
    this.ui.abilityTooltip.hidden = true;
  }

  syncMobileFireState() {
    const aimFiring =
      this.mobile.enabled &&
      this.mobile.aim.pointerId !== null &&
      !this.mobile.abilityTarget.active &&
      (this.mobile.aim.active || Math.hypot(this.mobile.aim.x, this.mobile.aim.y) > 0.12);
    this.mobile.fire = Boolean(this.mobile.manualFire || aimFiring);
  }

  isPointTargetAbility(loadoutId, slot) {
    return new Set(["tempest:E", "volt:E", "volt:R"]).has(`${loadoutId}:${slot}`);
  }

  getAbilityCooldownRemaining(slot, now = Date.now()) {
    return Math.max(0, (this.localTimers[slot] || 0) - now);
  }

  disposeGroundEffect(effect) {
    if (!effect?.group) {
      return;
    }
    this.fxRoot.remove(effect.group);
    disposeObject(effect.group);
  }

  clearMobileAbilityTargeting() {
    this.groundEffects = this.groundEffects.filter((effect) => {
      if (!effect?.previewKey || !String(effect.previewKey).startsWith("mobile-target-")) {
        return true;
      }
      this.disposeGroundEffect(effect);
      return false;
    });
    this.mobile.abilityTarget = {
      active: false,
      pointerId: null,
      slot: null,
      effectId: null,
      previewKey: null,
      target: null,
      startClientX: 0,
      startClientY: 0,
      startWorld: null,
    };
    this.syncMobileFireState();
  }

  resetJoystick(state, stick, isAim = false) {
    state.pointerId = null;
    state.x = 0;
    state.y = 0;
    state.anchorClientX = 0;
    state.anchorClientY = 0;
    if (isAim) {
      state.active = false;
      this.syncMobileFireState();
    }
    stick?.parentElement?.classList.remove("is-visible");
    if (stick) {
      stick.style.transform = "translate(-50%, -50%)";
    }
  }

  clearControlState() {
    this.mouse.down = false;
    this.mouse.inside = false;
    this.mobile.manualFire = false;
    this.mobile.fire = false;
    this.resetJoystick(this.mobile.move, this.ui.moveStick);
    this.resetJoystick(this.mobile.aim, this.ui.aimStick, true);
    this.clearMobileAbilityTargeting();
    this.keys.clear();
    this.justPressed.clear();
  }

  getPlayerCount() {
    return Object.keys(this.snapshot.players || {}).length;
  }

  resolvePerformanceProfile() {
    const playerCount = this.getPlayerCount();
    const busy = playerCount >= 5;
    const crowded = playerCount >= 8;
    const mobile = this.mobile.enabled;

    return {
      pixelRatioCap: mobile ? (crowded ? 0.9 : busy ? 1 : 1.1) : crowded ? 1.2 : busy ? 1.4 : 1.6,
      fxScale: mobile ? (crowded ? 0.42 : busy ? 0.56 : 0.72) : crowded ? 0.58 : busy ? 0.76 : 1,
      maxParticles: mobile ? (crowded ? 90 : busy ? 120 : 160) : crowded ? 160 : busy ? 220 : 300,
      shadowsEnabled: !mobile && playerCount < 8,
    };
  }

  applyPerformanceProfile(force = false) {
    const next = this.resolvePerformanceProfile();
    const current = this.performanceProfile || {};
    const changed =
      force ||
      current.pixelRatioCap !== next.pixelRatioCap ||
      current.fxScale !== next.fxScale ||
      current.maxParticles !== next.maxParticles ||
      current.shadowsEnabled !== next.shadowsEnabled;

    this.performanceProfile = next;

    if (changed) {
      this.renderer.shadowMap.enabled = next.shadowsEnabled;
      this.renderer.shadowMap.needsUpdate = true;
      if (this.sunLight) {
        this.sunLight.castShadow = next.shadowsEnabled;
      }
    }

    return changed;
  }

  scaleFxCount(count) {
    if (!count) {
      return 0;
    }

    const maxParticles = this.performanceProfile?.maxParticles || 0;
    const remainingBudget = Math.max(0, maxParticles - this.particles.length);
    if (remainingBudget <= 0) {
      return 0;
    }

    const scaled = Math.max(1, Math.round(count * (this.performanceProfile?.fxScale || 1)));
    return Math.min(remainingBudget, scaled);
  }

  syncRendererSize(force = false) {
    const width = Math.max(1, Math.floor(this.canvas.clientWidth || this.canvas.width || 1280));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight || this.canvas.height || 720));
    this.applyPerformanceProfile(force);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.performanceProfile.pixelRatioCap);

    if (
      !force &&
      this.rendererMetrics.width === width &&
      this.rendererMetrics.height === height &&
      Math.abs(this.rendererMetrics.pixelRatio - pixelRatio) < 0.01
    ) {
      return;
    }

    this.rendererMetrics.width = width;
    this.rendererMetrics.height = height;
    this.rendererMetrics.pixelRatio = pixelRatio;

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera3D.aspect = width / height;
    this.camera3D.updateProjectionMatrix();
  }

  setPlayerName(name) {
    this.playerName = name || "Player";
  }

  setSelectedLoadout(loadoutId) {
    this.selectedLoadoutId = loadoutId;
    this.refreshAbilityBar();
  }

  setFieldOfView(value) {
    this.fieldOfView = clamp(Number(value) || DEFAULT_FIELD_OF_VIEW, MIN_FIELD_OF_VIEW, MAX_FIELD_OF_VIEW);
    this.camera3D.fov = this.fieldOfView;
    this.camera3D.updateProjectionMatrix();
  }

  getFieldOfView() {
    return this.fieldOfView;
  }

  setMenuOpen(open) {
    this.menuOpen = Boolean(open);
    this.clearControlState();
    this.showMatchDetails = false;
    this.hideAbilityTooltip();
  }

  setSnapshot(snapshot) {
    this.snapshot = snapshot;
    const qualityChanged = this.applyPerformanceProfile();
    if (qualityChanged) {
      this.syncRendererSize(true);
    }
    const localRecord = this.getLocalRecord();

    if (localRecord) {
      this.selectedLoadoutId = getLoadout(localRecord.loadoutId || this.selectedLoadoutId).id;
      this.playerName = localRecord.name || this.playerName;
    }

    const nextMatchKey =
      snapshot.meta?.state === "running" ? `${snapshot.meta.startedAt}:${snapshot.meta.seed}` : null;

    if (nextMatchKey && nextMatchKey !== this.currentMatchKey) {
      this.handleMatchStart();
      this.currentMatchKey = nextMatchKey;
    }

    if (!nextMatchKey && snapshot.meta?.state !== "running") {
      this.currentMatchKey = null;
    }

    this.syncLocalPoseFromSnapshot();
    this.updateRemotePlayers(snapshot.players || {});
    this.consumeEvents(snapshot.events || []);
    this.syncDamageFeedbackFromSnapshot(snapshot.players || {});
    this.refreshHud(Date.now());
  }

  handleMatchStart() {
    this.clearTransientVisuals();
    this.killFeed = [];
    this.processedEvents.clear();
    this.processedQueue = [];
    this.hitFlashes.clear();
    this.lastDurabilityByPlayer.clear();
    this.lastDamageVisualAt.clear();
    this.showMatchDetails = false;
    this.hideAbilityTooltip();
    this.localTimers = {
      primaryReadyAt: 0,
      Q: 0,
      E: 0,
      R: 0,
    };
    this.localEffectPreviewUntil.barrier = 0;
    this.audio.play("start");
  }

  clearTransientVisuals() {
    this.projectiles.forEach((projectile) => {
      this.disposeProjectileVisual(projectile);
    });
    this.groundEffects.forEach((effect) => {
      this.fxRoot.remove(effect.group);
      disposeObject(effect.group);
    });
    this.beams.forEach((beam) => {
      this.fxRoot.remove(beam.mesh);
      disposeObject(beam.mesh);
    });
    this.particles.forEach((particle) => {
      this.fxRoot.remove(particle.mesh);
      particle.material?.dispose?.();
    });
    this.damageNumbers.forEach((number) => {
      this.disposeDamageNumber(number);
    });

    this.projectiles = [];
    this.groundEffects = [];
    this.beams = [];
    this.particles = [];
    this.damageNumbers = [];
  }

  getLocalRecord() {
    return this.snapshot.players?.[this.snapshot.localPlayerId] || null;
  }

  collectProjectileCollisionPlayers(localCombatVisual = null) {
    const players = [];
    this.remotePlayers.forEach((player) => {
      if (player.alive !== false) {
        players.push(player);
      }
    });
    if (localCombatVisual && localCombatVisual.alive !== false) {
      players.push(localCombatVisual);
    }
    return players;
  }

  syncLocalPoseFromSnapshot() {
    const localRecord = this.getLocalRecord();
    if (!localRecord) {
      return;
    }

    const farAway = Math.hypot(localRecord.x - this.localPose.x, localRecord.y - this.localPose.y) > 120;
    if (this.snapshot.meta?.state !== "running" || farAway || localRecord.alive === false) {
      this.localPose.x = localRecord.x;
      this.localPose.y = localRecord.y;
      this.localPose.aim = localRecord.aim;
      return;
    }

    this.localPose.x += (localRecord.x - this.localPose.x) * 0.2;
    this.localPose.y += (localRecord.y - this.localPose.y) * 0.2;
    this.localPose.aim = localRecord.aim;
  }

  updateRemotePlayers(players) {
    const activeIds = new Set();

    Object.entries(players).forEach(([playerId, player]) => {
      if (playerId === this.snapshot.localPlayerId) {
        return;
      }

      activeIds.add(playerId);
      const existing = this.remotePlayers.get(playerId) || {
        x: player.x,
        y: player.y,
        targetX: player.x,
        targetY: player.y,
        aim: player.aim,
      };

      existing.id = player.id;
      existing.name = player.name;
      existing.loadoutId = player.loadoutId;
      existing.color = player.color;
      existing.health = player.health;
      existing.shield = player.shield;
      existing.maxHealth = player.maxHealth;
      existing.maxShield = player.maxShield;
      existing.alive = player.alive !== false;
      existing.kills = player.kills || 0;
      existing.deaths = player.deaths || 0;
      existing.respawns = player.respawns || 0;
      existing.respawnAt = player.respawnAt || 0;
      existing.effects = player.effects || {};
      existing.targetX = player.x;
      existing.targetY = player.y;
      existing.aim = player.aim;
      this.remotePlayers.set(playerId, existing);
    });

    Array.from(this.remotePlayers.keys()).forEach((playerId) => {
      if (!activeIds.has(playerId)) {
        this.remotePlayers.delete(playerId);
      }
    });
  }

  syncDamageFeedbackFromSnapshot(players) {
    const activeIds = new Set();
    const now = Date.now();

    Object.entries(players || {}).forEach(([playerId, player]) => {
      activeIds.add(playerId);
      const previous = this.lastDurabilityByPlayer.get(playerId);
      const currentTotal = Math.max(0, (player.health || 0) + (player.shield || 0));

      if (
        previous &&
        previous.alive !== false &&
        currentTotal < previous.total
      ) {
        const drop = previous.total - currentTotal;
        const lastVisualAt = this.lastDamageVisualAt.get(playerId) || 0;
        if (drop > 0.1 && now - lastVisualAt > 180) {
          const position = {
            x: player.x,
            y: player.y,
          };
          this.lastDamageVisualAt.set(playerId, now);
          this.hitFlashes.set(playerId, now + 220);
          this.spawnBurst(position.x, position.y, "#ff8f78", 7, 75, 18);
          this.spawnDamageNumber(playerId, drop, position);
        }
      }

      this.lastDurabilityByPlayer.set(playerId, {
        total: currentTotal,
        alive: player.alive !== false,
      });
    });

    Array.from(this.lastDurabilityByPlayer.keys()).forEach((playerId) => {
      if (!activeIds.has(playerId)) {
        this.lastDurabilityByPlayer.delete(playerId);
      }
    });
  }

  consumeEvents(events) {
    events.forEach((event) => {
      if (!event?.id || this.processedEvents.has(event.id)) {
        return;
      }

      this.processedEvents.add(event.id);
      this.processedQueue.push(event.id);
      if (this.processedQueue.length > 700) {
        const removed = this.processedQueue.shift();
        this.processedEvents.delete(removed);
      }

      this.processEvent(event);
    });
  }

  processEvent(event) {
    switch (event.type) {
      case "projectile":
        if (event.ownerId === this.snapshot.localPlayerId) {
          break;
        }
        this.projectiles.push(this.createProjectileVisual(event));
        this.spawnTinyDots(
          event.x,
          event.y,
          event.color,
          event.loadoutId === "volt" ? 4 : 2,
          event.loadoutId === "volt" ? 18 : 14,
          PLAYER_Y + 6
        );
        break;
      case "projectile-impact":
        if (event.loadoutId === "volt") {
          this.spawnVoltProjectileImpactVisual(event.x, event.y, event.color, event.radius || 78);
        } else {
          this.spawnBurst(event.x, event.y, event.color, 10, 86, PLAYER_Y + 10);
          this.spawnTinyDots(event.x, event.y, event.color, 4, 18, PLAYER_Y + 8);
        }
        break;
      case "hitscan":
        this.beams.push(this.createBeamVisual(event.x, event.y, event.toX, event.toY, event.color, event.width || 4, 0.14));
        this.spawnTinyDots(event.x, event.y, event.color, 2, 12, PLAYER_Y + 6);
        this.spawnTinyDots(event.toX, event.toY, event.color, 2, 12, PLAYER_Y + 8);
        break;
      case "shotgun":
        if (event.ownerId !== this.snapshot.localPlayerId) {
          this.spawnShotgunVolleyVisual(event.x, event.y, event.traces || [], event.color);
        }
        break;
      case "mine":
        this.syncTempestMinePreview({
          ...event,
          type: "mine",
        });
        break;
      case "gravity":
        this.syncPersistentGroundEffect(event);
        if (
          event.ownerId !== this.snapshot.localPlayerId &&
          Number.isFinite(event.fromX) &&
          Number.isFinite(event.fromY)
        ) {
          this.spawnVoltFieldDeployVisual(event.fromX, event.fromY, event.x, event.y, event.color, "gravity");
        }
        break;
      case "storm":
        this.syncPersistentGroundEffect(event);
        if (
          event.ownerId !== this.snapshot.localPlayerId &&
          Number.isFinite(event.fromX) &&
          Number.isFinite(event.fromY)
        ) {
          this.spawnVoltFieldDeployVisual(event.fromX, event.fromY, event.x, event.y, event.color, "storm");
        }
        break;
      case "recon":
        this.syncPersistentGroundEffect(event);
        break;
      case "mine-detonate":
        this.retireGroundEffect(event.effectId, "mine");
        this.groundEffects.push(
          this.createGroundEffectVisual({
            type: "mine-detonate",
            x: event.x,
            y: event.y,
            radius: event.radius || 92,
            color: event.color,
            expiresAt: Date.now() + 460,
          })
        );
        this.spawnBurst(event.x, event.y, event.color, 22, 165, 18);
        break;
      case "dash":
        this.beams.push(this.createBeamVisual(event.fromX, event.fromY, event.toX, event.toY, event.color, 10, 0.18));
        this.spawnBurst(event.toX, event.toY, event.color, 14, 120, 16);
        break;
      case "slam":
        if (event.ownerId !== this.snapshot.localPlayerId) {
          this.spawnSlamImpactVisual(
            event.toX || event.x,
            event.toY || event.y,
            event.color,
            event.radius || 120
          );
        }
        break;
      case "cone":
        if (event.ownerId !== this.snapshot.localPlayerId) {
          this.spawnDragonRoarVisual(
            event.x,
            event.y,
            event.angle || 0,
            event.range || 240,
            event.color
          );
        }
        break;
      case "arc-dash":
        this.beams.push(this.createBeamVisual(event.fromX, event.fromY, event.toX, event.toY, event.color, 11, 0.18));
        (event.chains || []).forEach((chain) => {
          this.beams.push(this.createBeamVisual(event.toX, event.toY, chain.x, chain.y, event.color, 4.2, 0.14));
        });
        this.spawnBurst(event.toX, event.toY, event.color, 10, 110, 18);
        break;
      case "arc-orb-launch":
        this.upsertArcOrbVisual({
          projectileId: event.projectileId,
          ownerId: event.ownerId,
          x: event.x,
          y: event.y,
          targetId: event.targetId || null,
          targetX: event.targetX,
          targetY: event.targetY,
          speed: event.speed || ARC_ORB_SPEED,
          color: event.color,
        });
        if (event.ownerId !== this.snapshot.localPlayerId) {
          this.spawnBurst(event.x, event.y, event.color, 8, 76, PLAYER_Y + 12);
        }
        break;
      case "arc-orb-hop":
        this.spawnVoltArcHopVisual(event.fromX, event.fromY, event.toX, event.toY, event.color);
        this.upsertArcOrbVisual({
          projectileId: event.projectileId,
          ownerId: event.ownerId,
          x: event.fromX,
          y: event.fromY,
          targetId: event.targetId || null,
          targetX: event.toX,
          targetY: event.toY,
          speed: event.speed || ARC_ORB_SPEED * 6,
          color: event.color,
        });
        break;
      case "arc-orb-end":
        this.expireArcOrbVisual(event.projectileId, event.x, event.y, event.color);
        break;
      case "buff":
        this.processBuffEvent(event);
        break;
      case "storm-pulse":
        this.groundEffects.push(
          this.createGroundEffectVisual({
            type: "storm-pulse",
            x: event.x,
            y: event.y,
            radius: event.radius || 150,
            color: event.color,
            expiresAt: Date.now() + 420,
          })
        );
        this.spawnVoltStormPulseVisual(event.x, event.y, event.color, event.radius || 150);
        break;
      case "recon-pulse":
        this.groundEffects.push(
          this.createGroundEffectVisual({
            type: "scan-pulse",
            x: event.x,
            y: event.y,
            radius: event.radius || 260,
            color: event.color,
            expiresAt: Date.now() + 620,
          })
        );
        this.spawnBurst(event.x, event.y, event.color, 10, 70, 20);
        break;
      case "gravity-pulse":
        this.groundEffects.push(
          this.createGroundEffectVisual({
            type: "gravity-pulse",
            x: event.x,
            y: event.y,
            radius: event.radius || 172,
            color: event.color,
            expiresAt: Date.now() + 520,
          })
        );
        this.spawnVoltGravityPulseVisual(event.x, event.y, event.color, event.radius || 172);
        break;
      case "damage": {
        this.lastDamageVisualAt.set(event.targetId, Date.now());
        this.hitFlashes.set(event.targetId, Date.now() + 220);
        const target = this.snapshot.players?.[event.targetId];
        const impactX = Number.isFinite(event.x) ? event.x : target?.x;
        const impactY = Number.isFinite(event.y) ? event.y : target?.y;
        const impactPosition =
          Number.isFinite(impactX) && Number.isFinite(impactY)
            ? {
                x: impactX,
                y: impactY,
              }
            : null;
        if (impactPosition) {
          this.spawnBurst(impactPosition.x, impactPosition.y, "#ff8f78", 7, 75, 18);
        }
        this.spawnDamageNumber(event.targetId, event.amount, impactPosition);
        if (event.targetId === this.snapshot.localPlayerId) {
          this.audio.play("hit");
        }
        break;
      }
      case "respawn": {
        this.spawnBurst(event.x, event.y, event.color, 24, 170, 28);
        this.groundEffects.push(
          this.createGroundEffectVisual({
            type: "spawn",
            x: event.x,
            y: event.y,
            radius: 86,
            color: event.color,
            expiresAt: Date.now() + 680,
          })
        );
        if (event.playerId === this.snapshot.localPlayerId) {
          this.audio.play("respawn");
        }
        break;
      }
      case "elimination": {
        const attacker =
          event.byId === this.snapshot.localPlayerId
            ? this.playerName
            : this.snapshot.players?.[event.byId]?.name || "Tempestade";
        const target =
          event.targetId === this.snapshot.localPlayerId
            ? this.playerName
            : this.snapshot.players?.[event.targetId]?.name || "Player";
        this.killFeed.unshift({
          id: event.id,
          text: `${attacker} eliminou ${target}`,
          expiresAt: Date.now() + 2800,
        });
        this.killFeed = this.killFeed.slice(0, 3);
        this.audio.play("elimination");
        break;
      }
      default:
        break;
    }
  }

  processBuffEvent(event) {
    this.spawnBurst(event.x, event.y, event.color, 12, 95, 20);

    if (event.buff === "overclock") {
      this.groundEffects.push(
        this.createGroundEffectVisual({
          type: "overclock-burst",
          x: event.x,
          y: event.y,
          radius: 74,
          color: event.color,
          expiresAt: Date.now() + 560,
        })
      );
      this.spawnBurst(event.x, event.y, "#ffffff", 8, 85, 24);
      return;
    }

    if (event.buff === "barrier") {
      this.groundEffects.push(
        this.createGroundEffectVisual({
          type: "shield-pop",
          x: event.x,
          y: event.y,
          radius: 84,
          color: event.color,
          expiresAt: Date.now() + 520,
        })
      );
      this.spawnBurst(event.x, event.y, "#fff2df", 10, 92, 26);
      this.spawnTinyDots(event.x, event.y, event.color, 6, 18, PLAYER_Y + 12);
      this.spawnFloatingTextAtWorld("+36", event.x, event.y, "#9ee4ff");
      return;
    }

    if (event.buff === "cloak") {
      this.groundEffects.push(
        this.createGroundEffectVisual({
          type: "cloak-burst",
          x: event.x,
          y: event.y,
          radius: 72,
          color: event.color,
          expiresAt: Date.now() + 680,
        })
      );
      this.spawnBurst(event.x, event.y, event.color, 14, 60, 26);
    }
  }

  retireGroundEffect(effectId, fallbackType = null) {
    this.groundEffects.forEach((effect) => {
      const matchesId = effectId && effect.effectId === effectId;
      const matchesFallback =
        !effectId &&
        fallbackType &&
        effect.type === fallbackType;

      if (matchesId || matchesFallback) {
        effect.expiresAt = Math.min(effect.expiresAt || Infinity, Date.now() + 90);
      }
    });
  }

  createProjectileVisual(event) {
    const isVolt = event.loadoutId === "volt";
    const isArcOrb = event.kind === "arc-orb";
    const radius = Math.max(
      0.95,
      Math.min(isArcOrb ? 2.8 : isVolt ? 2.45 : 2.1, (event.radius || 4) * 0.24)
    );
    const renderHeight = isArcOrb ? PLAYER_Y + 10 : PLAYER_Y + 6;
    const mesh = new THREE.Group();
    const materials = [];

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: isVolt ? "#fff8d1" : event.color || "#ffffff",
      transparent: true,
      opacity: 0.98,
    });
    materials.push(coreMaterial);
    const core = new THREE.Mesh(this.sharedGeometries.projectile, coreMaterial);
    core.scale.setScalar(isArcOrb ? radius * 0.72 : radius);
    mesh.add(core);

    let shell = null;
    let halo = null;
    if (isVolt || isArcOrb) {
      const shellMaterial = new THREE.MeshBasicMaterial({
        color: event.color || "#fff29e",
        transparent: true,
        opacity: isArcOrb ? 0.58 : 0.38,
      });
      materials.push(shellMaterial);
      shell = new THREE.Mesh(this.sharedGeometries.projectile, shellMaterial);
      shell.scale.setScalar(radius * (isArcOrb ? 1.72 : 1.38));
      mesh.add(shell);

      const haloMaterial = new THREE.MeshBasicMaterial({
        color: event.color || "#fff29e",
        transparent: true,
        opacity: isArcOrb ? 0.24 : 0.16,
        depthWrite: false,
      });
      materials.push(haloMaterial);
      halo = new THREE.Mesh(this.sharedGeometries.projectile, haloMaterial);
      halo.scale.setScalar(radius * (isArcOrb ? 2.25 : 1.85));
      mesh.add(halo);
    }

    mesh.position.set(event.x - HALF_WORLD_SIZE, renderHeight, event.y - HALF_WORLD_SIZE);
    this.fxRoot.add(mesh);

    return {
      ...event,
      age: 0,
      mesh,
      core,
      shell,
      halo,
      materials,
      baseRadius: radius,
      renderHeight,
    };
  }

  disposeProjectileVisual(projectile) {
    if (!projectile?.mesh) {
      return;
    }
    this.fxRoot.remove(projectile.mesh);
    (projectile.materials || []).forEach((material) => disposeMaterial(material));
  }

  createBeamVisual(fromX, fromY, toX, toY, color, width, life) {
    const from = this.toScenePoint(fromX, fromY, PLAYER_Y + 3);
    const to = this.toScenePoint(toX, toY, PLAYER_Y + 3);
    const direction = to.clone().sub(from);
    const length = Math.max(1, direction.length());
    const radius = Math.max(1.5, width * 0.2);
    const material = new THREE.MeshBasicMaterial({
      color: color || "#ffffff",
      transparent: true,
      opacity: 0.92,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 10, 1, true), material);
    mesh.position.copy(from.clone().add(direction.clone().multiplyScalar(0.5)));
    mesh.scale.y = length;
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    this.fxRoot.add(mesh);

    return {
      mesh,
      material,
      life,
      maxLife: life,
    };
  }

  createGroundEffectVisual(effect) {
    const group = new THREE.Group();
    const color = effect.color || "#ffffff";
    const radius = Math.max(18, effect.radius || effect.range || 40);
    const triggerRadius = Math.max(16, effect.triggerRadius || radius * 0.62);
    group.position.copy(this.toScenePoint(effect.x, effect.y, 0));
    const highEnergyTypes = new Set([
      "shockwave",
      "spawn",
      "mine-detonate",
      "storm-pulse",
      "scan-pulse",
      "gravity-pulse",
      "shield-pop",
      "cloak-burst",
      "overclock-burst",
    ]);

    if (effect.type === "cone-burst") {
      const wedge = new THREE.Mesh(
        new THREE.CircleGeometry(1, 42, -0.72, 1.44),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.24,
          side: THREE.DoubleSide,
        })
      );
      wedge.rotation.x = -Math.PI / 2;
      wedge.position.y = 2;
      wedge.scale.set(radius, radius, radius);
      group.add(wedge);
      group.rotation.y = -((effect.angle || 0) + 0.72);
    } else {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.68, 1, 72),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: highEnergyTypes.has(effect.type) ? 0.28 : effect.type === "shockwave" ? 0.28 : 0.16,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 2;
      ring.scale.set(radius, radius, radius);
      group.add(ring);
      group.userData.ring = ring;

      const edge = new THREE.Mesh(
        new THREE.TorusGeometry(1, effect.type === "spawn" ? 0.034 : 0.028, 12, 72),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: highEnergyTypes.has(effect.type) ? 0.84 : 0.6,
        })
      );
      edge.rotation.x = Math.PI / 2;
      edge.position.y = 4;
      edge.scale.set(radius, radius, radius);
      group.add(edge);
      group.userData.edge = edge;

      if (
        effect.type === "mine" ||
        effect.type === "recon" ||
        effect.type === "gravity" ||
        effect.type === "storm" ||
        effect.type === "storm-pulse" ||
        effect.type === "gravity-pulse" ||
        effect.type === "scan-pulse"
      ) {
        const core = new THREE.Mesh(
          new THREE.CylinderGeometry(Math.max(8, radius * 0.12), Math.max(12, radius * 0.18), effect.type === "storm" ? 52 : 22, 10),
          new THREE.MeshStandardMaterial({
            color: "#0f1b28",
            emissive: color,
            emissiveIntensity: highEnergyTypes.has(effect.type) ? 0.78 : 0.45,
            roughness: 0.45,
            metalness: 0.4,
            transparent: true,
            opacity: effect.type === "gravity" || effect.type === "gravity-pulse" ? 0.82 : 0.92,
          })
        );
        core.position.y = effect.type === "storm" || effect.type === "storm-pulse" ? 28 : 12;
        group.add(core);
        group.userData.core = core;
      }

      if (effect.type === "mine") {
        const triggerFill = new THREE.Mesh(
          new THREE.CircleGeometry(1, 56),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        triggerFill.rotation.x = -Math.PI / 2;
        triggerFill.position.y = 1.5;
        triggerFill.scale.set(triggerRadius, triggerRadius, triggerRadius);
        group.add(triggerFill);
        group.userData.triggerFill = triggerFill;

        const triggerRing = new THREE.Mesh(
          new THREE.RingGeometry(0.76, 0.82, 56),
          new THREE.MeshBasicMaterial({
            color: "#fff1a8",
            transparent: true,
            opacity: 0.24,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        triggerRing.rotation.x = -Math.PI / 2;
        triggerRing.position.y = 3;
        triggerRing.scale.set(triggerRadius, triggerRadius, triggerRadius);
        group.add(triggerRing);
        group.userData.triggerRing = triggerRing;

        const mineBase = new THREE.Mesh(
          new THREE.CylinderGeometry(16, 21, 10, 14),
          new THREE.MeshStandardMaterial({
            color: "#142532",
            emissive: color,
            emissiveIntensity: 0.34,
            roughness: 0.36,
            metalness: 0.52,
          })
        );
        mineBase.position.y = 8;
        group.add(mineBase);
        group.userData.mineBase = mineBase;

        const mineCap = new THREE.Mesh(
          new THREE.SphereGeometry(7.4, 18, 14),
          new THREE.MeshStandardMaterial({
            color: "#dffcff",
            emissive: color,
            emissiveIntensity: 0.84,
            roughness: 0.18,
            metalness: 0.26,
          })
        );
        mineCap.position.y = 16;
        group.add(mineCap);
        group.userData.mineCap = mineCap;

        const mineBeacon = new THREE.Mesh(
          new THREE.CylinderGeometry(2.2, 7.4, 34, 10, 1, true),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.22,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        mineBeacon.position.y = 28;
        group.add(mineBeacon);
        group.userData.mineBeacon = mineBeacon;
      }
    }

    group.userData.type = effect.type;
    group.userData.effectId = effect.effectId || null;
    group.userData.createdAt = Date.now();
    group.userData.expiresAt = effect.expiresAt || Date.now() + 1200;
    group.userData.pull = effect.pull || 0;
    group.userData.pulseEvery = effect.pulseEvery || 0;
    group.userData.radius = radius;
    group.userData.triggerRadius = triggerRadius;
    group.userData.armedAt = effect.armedAt || 0;
    this.fxRoot.add(group);

    return {
      ...effect,
      effectId: effect.effectId || null,
      radius,
      triggerRadius,
      group,
    };
  }

  spawnShotgunVolleyVisual(x, y, traces, color) {
    const emberColor = color || "#ffb37d";
    const safeTraces = Array.isArray(traces) ? traces.filter(Boolean) : [];
    this.spawnBurst(x, y, emberColor, 12, 108, PLAYER_Y + 10);
    this.spawnTinyDots(x, y, "#fff2d8", 5, 24, PLAYER_Y + 12);
    safeTraces.forEach((trace, index) => {
      this.beams.push(
        this.createBeamVisual(
          x,
          y,
          trace.x,
          trace.y,
          index % 2 === 0 ? emberColor : "#ffd39d",
          4.8,
          0.14
        )
      );
      this.spawnTinyDots(trace.x, trace.y, emberColor, 2, 18, PLAYER_Y + 9);
      if (index < 4) {
        this.spawnBurst(trace.x, trace.y, "#ffd39d", 2, 54, PLAYER_Y + 10);
      }
    });
  }

  spawnSlamImpactVisual(x, y, color, radius = 128) {
    this.groundEffects.push(
      this.createGroundEffectVisual({
        type: "shockwave",
        x,
        y,
        radius,
        color,
        expiresAt: Date.now() + 460,
      })
    );
    this.spawnBurst(x, y, color, 22, 178, 18);
    this.spawnBurst(x, y, "#fff0d7", 10, 126, 28);
    this.spawnTinyDots(x, y, color, 8, 26, PLAYER_Y + 12);
    const spokes = 6;
    for (let index = 0; index < spokes; index += 1) {
      const angle = (index / spokes) * TAU + Math.PI / 6;
      this.beams.push(
        this.createBeamVisual(
          x,
          y,
          x + Math.cos(angle) * radius * 0.72,
          y + Math.sin(angle) * radius * 0.72,
          color,
          4.4,
          0.12
        )
      );
    }
  }

  spawnDragonRoarVisual(x, y, angle, range, color) {
    this.groundEffects.push(
      this.createGroundEffectVisual({
        type: "cone-burst",
        x,
        y,
        angle,
        range,
        radius: range,
        color,
        expiresAt: Date.now() + 400,
      })
    );
    this.spawnBurst(x, y, color, 18, 102, PLAYER_Y + 12);
    this.spawnTinyDots(x, y, "#fff3dd", 6, 22, PLAYER_Y + 14);
    const segments = 7;
    for (let index = 0; index < segments; index += 1) {
      const t = segments === 1 ? 0.5 : index / (segments - 1);
      const flameAngle = angle - 0.72 + t * 1.44;
      const flameLength = range * (0.6 + Math.random() * 0.24);
      this.beams.push(
        this.createBeamVisual(
          x + Math.cos(flameAngle) * 18,
          y + Math.sin(flameAngle) * 18,
          x + Math.cos(flameAngle) * flameLength,
          y + Math.sin(flameAngle) * flameLength,
          index % 2 === 0 ? color : "#ffd472",
          7 - Math.abs(t - 0.5) * 2.4,
          0.16
        )
      );
      this.spawnBurst(
        x + Math.cos(flameAngle) * flameLength * 0.55,
        y + Math.sin(flameAngle) * flameLength * 0.55,
        "#ffcf78",
        2,
        72,
        PLAYER_Y + 12
      );
    }
    this.spawnConeBurst(x, y, angle, range, color);
  }

  spawnVoltProjectileImpactVisual(x, y, color, radius = 78) {
    this.groundEffects.push(
      this.createGroundEffectVisual({
        type: "storm-pulse",
        x,
        y,
        radius,
        color,
        expiresAt: Date.now() + 320,
      })
    );
    this.spawnBurst(x, y, color, 20, 138, PLAYER_Y + 14);
    this.spawnBurst(x, y, "#fff6c8", 8, 96, PLAYER_Y + 18);
    this.spawnTinyDots(x, y, color, 8, 24, PLAYER_Y + 12);
  }

  spawnVoltFieldDeployVisual(fromX, fromY, x, y, color, type = "gravity") {
    const width = type === "storm" ? 6.4 : 5.2;
    this.beams.push(this.createBeamVisual(fromX, fromY, x, y, color, width, 0.14));
    this.spawnBurst(x, y, color, type === "storm" ? 14 : 10, type === "storm" ? 118 : 92, PLAYER_Y + 12);
    this.spawnTinyDots(x, y, "#fff6cc", type === "storm" ? 5 : 4, 22, PLAYER_Y + 14);
  }

  spawnVoltGravityPulseVisual(x, y, color, radius = 172) {
    this.spawnBurst(x, y, color, 14, 98, PLAYER_Y + 12);
    this.spawnTinyDots(x, y, "#fff7d4", 6, 18, PLAYER_Y + 12);
    const rays = 5;
    for (let index = 0; index < rays; index += 1) {
      const angle = (index / rays) * TAU + Math.PI / 5;
      this.beams.push(
        this.createBeamVisual(
          x,
          y,
          x + Math.cos(angle) * radius * 0.32,
          y + Math.sin(angle) * radius * 0.32,
          color,
          3.8,
          0.1
        )
      );
    }
  }

  spawnVoltStormPulseVisual(x, y, color, radius = 150) {
    this.spawnBurst(x, y, color, 18, 126, PLAYER_Y + 14);
    this.spawnBurst(x, y, "#fff3b2", 8, 88, PLAYER_Y + 18);
    this.spawnTinyDots(x, y, "#fff7d4", 8, 24, PLAYER_Y + 14);
    const rays = 7;
    for (let index = 0; index < rays; index += 1) {
      const angle = (index / rays) * TAU + Math.PI / 7;
      this.beams.push(
        this.createBeamVisual(
          x,
          y,
          x + Math.cos(angle) * radius * 0.42,
          y + Math.sin(angle) * radius * 0.42,
          color,
          4.8,
          0.12
        )
      );
    }
  }

  spawnVoltArcHopVisual(fromX, fromY, toX, toY, color) {
    this.spawnBurst(fromX, fromY, color, 10, 84, PLAYER_Y + 12);
    this.beams.push(this.createBeamVisual(fromX, fromY, toX, toY, color, 5.4, 0.12));
    this.spawnTinyDots(toX, toY, "#fff6c8", 4, 18, PLAYER_Y + 12);
  }

  findProjectileVisualById(projectileId) {
    return this.projectiles.find((projectile) => projectile.id === projectileId) || null;
  }

  upsertArcOrbVisual({
    projectileId,
    ownerId,
    x,
    y,
    targetId = null,
    targetX,
    targetY,
    speed = ARC_ORB_SPEED,
    color,
    lifetime = ARC_ORB_LIFETIME,
  }) {
    if (!projectileId || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    let existing = this.findProjectileVisualById(projectileId);
    if (!existing) {
      existing = this.createProjectileVisual({
        id: projectileId,
        kind: "arc-orb",
        ownerId,
        loadoutId: "volt",
        x,
        y,
        radius: 14,
        color,
      });
      this.projectiles.push(existing);
    }

    existing.kind = "arc-orb";
    existing.ownerId = ownerId;
    existing.loadoutId = "volt";
    existing.x = x;
    existing.y = y;
    existing.targetId = targetId;
    existing.targetX = targetX;
    existing.targetY = targetY;
    existing.speed = speed;
    existing.lifetime = lifetime;
    existing.age = 0;
    existing.renderHeight = PLAYER_Y + 10;
    existing.mesh.position.set(x - HALF_WORLD_SIZE, existing.renderHeight, y - HALF_WORLD_SIZE);
    return existing;
  }

  expireArcOrbVisual(projectileId, x, y, color) {
    const projectile = this.findProjectileVisualById(projectileId);
    if (projectile) {
      this.disposeProjectileVisual(projectile);
      this.projectiles = this.projectiles.filter((entry) => entry !== projectile);
    }
    this.spawnVoltProjectileImpactVisual(x, y, color, 56);
  }

  createNameplateSprite(name) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) {
      const fallbackMaterial = new THREE.SpriteMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0,
      });
      const fallbackSprite = new THREE.Sprite(fallbackMaterial);
      fallbackSprite.position.set(0, PLAYER_Y + 52, 0);
      return {
        canvas,
        context: null,
        texture: null,
        sprite: fallbackSprite,
        renderedKey: null,
      };
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(0, PLAYER_Y + 52, 0);
    sprite.scale.set(90, 24, 1);

    const label = {
      canvas,
      context,
      texture,
      sprite,
      renderedKey: null,
    };

    this.updateNameplateSprite(label, name, false);
    return label;
  }

  updateNameplateSprite(label, name, isLocal) {
    if (!label.context || !label.sprite) {
      return;
    }
    const safeName = String(name || "Player").slice(0, 18);
    const renderKey = `${safeName}:${isLocal ? "local" : "remote"}`;
    if (label.renderedKey === renderKey) {
      return;
    }

    label.renderedKey = renderKey;
    const { canvas, context, texture, sprite } = label;
    const width = canvas.width;
    const height = canvas.height;

    context.clearRect(0, 0, width, height);
    context.fillStyle = isLocal ? "rgba(85, 231, 223, 0.92)" : "rgba(8, 19, 30, 0.78)";
    context.strokeStyle = isLocal ? "rgba(85, 231, 223, 1)" : "rgba(255,255,255,0.16)";
    context.lineWidth = 4;
    this.roundRect(context, 40, 24, width - 80, height - 52, 28);
    context.fill();
    context.stroke();

    context.font = '700 50px "Oxanium", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = isLocal ? "#061018" : "#f3fbff";
    context.fillText(safeName, width / 2, height / 2 - 4);

    texture.needsUpdate = true;
    const widthScale = Math.max(74, Math.min(134, 56 + safeName.length * 4.8));
    sprite.scale.set(widthScale, 24, 1);
  }

  roundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }

  createFloatingTextSprite(text, fillStyle = "#fff3c0") {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    const scaleX = Math.max(34, Math.min(56, 26 + String(text).length * 6));
    const scaleY = 26;

    if (!context) {
      const material = new THREE.SpriteMaterial({
        color: fillStyle,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(scaleX, scaleY, 1);
      return {
        sprite,
        material,
        texture: null,
        scaleX,
        scaleY,
      };
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '800 94px "Oxanium", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 12;
    context.strokeStyle = "rgba(5, 9, 18, 0.95)";
    context.fillStyle = fillStyle;
    context.strokeText(text, canvas.width / 2, canvas.height / 2 + 2);
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(scaleX, scaleY, 1);
    return {
      sprite,
      material,
      texture,
      scaleX,
      scaleY,
    };
  }

  getDisplayedPlayerPosition(playerId) {
    if (!playerId) {
      return null;
    }

    if (playerId === this.snapshot.localPlayerId) {
      return {
        x: this.localPose.x,
        y: this.localPose.y,
      };
    }

    const remote = this.remotePlayers.get(playerId);
    if (remote) {
      return {
        x: remote.x,
        y: remote.y,
      };
    }

    const player = this.snapshot.players?.[playerId];
    if (!player) {
      return null;
    }

    return {
      x: player.x,
      y: player.y,
    };
  }

  spawnDamageNumber(playerId, amount, positionOverride = null) {
    const damage = Math.max(0, Math.round(amount || 0));
    if (!damage) {
      return;
    }

    const target =
      positionOverride &&
      Number.isFinite(positionOverride.x) &&
      Number.isFinite(positionOverride.y)
        ? positionOverride
        : this.getDisplayedPlayerPosition(playerId);
    if (!target) {
      return;
    }

    const label = this.createFloatingTextSprite(
      String(damage),
      playerId === this.snapshot.localPlayerId ? "#ffd3d3" : "#ffe08f"
    );
    const position = this.toScenePoint(target.x, target.y, PLAYER_Y + 88 + Math.random() * 10);
    position.x += (Math.random() - 0.5) * 22;
    position.z += (Math.random() - 0.5) * 18;
    label.sprite.position.copy(position);
    this.fxRoot.add(label.sprite);

    this.damageNumbers.push({
      ...label,
      x: position.x,
      y: position.y,
      z: position.z,
      vx: (Math.random() - 0.5) * 10,
      vy: 42 + Math.random() * 18,
      vz: (Math.random() - 0.5) * 8,
      life: 0.72,
      maxLife: 0.72,
    });
  }

  spawnFloatingTextAtWorld(text, x, y, fillStyle = "#fff3c0") {
    if (!text || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    const label = this.createFloatingTextSprite(String(text), fillStyle);
    const position = this.toScenePoint(x, y, PLAYER_Y + 72 + Math.random() * 8);
    position.x += (Math.random() - 0.5) * 18;
    position.z += (Math.random() - 0.5) * 14;
    label.sprite.position.copy(position);
    this.fxRoot.add(label.sprite);

    this.damageNumbers.push({
      ...label,
      x: position.x,
      y: position.y,
      z: position.z,
      vx: (Math.random() - 0.5) * 8,
      vy: 36 + Math.random() * 14,
      vz: (Math.random() - 0.5) * 6,
      life: 0.78,
      maxLife: 0.78,
    });
  }

  disposeDamageNumber(number) {
    this.fxRoot.remove(number.sprite);
    number.texture?.dispose?.();
    number.material?.dispose?.();
  }

  ensurePlayerVisual(playerId, player) {
    const existing = this.playerVisuals.get(playerId);
    if (existing) {
      return existing;
    }

    const loadout = getLoadout(player.loadoutId);
    const theme = new THREE.Color(resolvePlayerColor(player, loadout.theme));
    const group = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(20, 2.2, 12, 32),
      new THREE.MeshBasicMaterial({
        color: theme,
        transparent: true,
        opacity: 0.45,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.4;
    group.add(ring);

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: theme.clone().multiplyScalar(0.9),
      emissive: theme,
      emissiveIntensity: 0.4,
      roughness: 0.45,
      metalness: 0.22,
      transparent: true,
      opacity: 1,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(13, 18, 28, 12), bodyMaterial);
    body.position.y = PLAYER_Y;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const coreMaterial = new THREE.MeshStandardMaterial({
      color: theme.clone().lerp(new THREE.Color("#f3fbff"), 0.24),
      emissive: theme,
      emissiveIntensity: 0.9,
      roughness: 0.18,
      metalness: 0.4,
      transparent: true,
      opacity: 1,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(8, 14, 14), coreMaterial);
    core.position.y = PLAYER_Y + 9;
    core.castShadow = true;
    group.add(core);

    const weapon = new THREE.Mesh(
      new THREE.BoxGeometry(24, 5, 8),
      new THREE.MeshStandardMaterial({
        color: theme.clone().lerp(new THREE.Color("#ffffff"), 0.14),
        emissive: theme,
        emissiveIntensity: 0.4,
        roughness: 0.38,
        metalness: 0.48,
      })
    );
    weapon.position.set(18, PLAYER_Y + 6, 0);
    weapon.castShadow = true;
    group.add(weapon);

    const barrier = new THREE.Mesh(
      new THREE.SphereGeometry(26, 24, 18),
      new THREE.MeshBasicMaterial({
        color: theme,
        transparent: true,
        opacity: 0.24,
      })
    );
    barrier.position.y = PLAYER_Y + 4;
    barrier.visible = false;
    group.add(barrier);

    const barrierColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(24.5, 24.5, 34, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: theme,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    barrierColumn.position.y = PLAYER_Y + 4;
    barrierColumn.visible = false;
    group.add(barrierColumn);

    const barrierRing = new THREE.Mesh(
      new THREE.TorusGeometry(28, 1.8, 12, 44),
      new THREE.MeshBasicMaterial({
        color: theme,
        transparent: true,
        opacity: 0.78,
      })
    );
    barrierRing.position.y = PLAYER_Y + 10;
    barrierRing.rotation.x = Math.PI / 2;
    barrierRing.visible = false;
    group.add(barrierRing);

    const overclock = new THREE.Mesh(
      new THREE.TorusGeometry(15, 1.8, 10, 28),
      new THREE.MeshBasicMaterial({
        color: theme,
        transparent: true,
        opacity: 0.75,
      })
    );
    overclock.position.y = PLAYER_Y + 22;
    overclock.rotation.x = Math.PI / 2;
    overclock.visible = false;
    group.add(overclock);

    const spawnShield = new THREE.Mesh(
      new THREE.SphereGeometry(24, 20, 16),
      new THREE.MeshBasicMaterial({
        color: "#9ee4ff",
        transparent: true,
        opacity: 0.18,
      })
    );
    spawnShield.position.y = PLAYER_Y + 4;
    spawnShield.visible = false;
    group.add(spawnShield);

    const cloakAura = new THREE.Mesh(
      new THREE.TorusGeometry(17, 1.6, 10, 32),
      new THREE.MeshBasicMaterial({
        color: theme,
        transparent: true,
        opacity: 0.72,
      })
    );
    cloakAura.position.y = PLAYER_Y + 28;
    cloakAura.rotation.x = Math.PI / 2;
    cloakAura.visible = false;
    group.add(cloakAura);

    const revealedAura = new THREE.Mesh(
      new THREE.TorusGeometry(20, 1.6, 10, 36),
      new THREE.MeshBasicMaterial({
        color: "#fff29e",
        transparent: true,
        opacity: 0.76,
      })
    );
    revealedAura.position.y = PLAYER_Y + 34;
    revealedAura.rotation.x = Math.PI / 2;
    revealedAura.visible = false;
    group.add(revealedAura);

    const slowedAura = new THREE.Mesh(
      new THREE.TorusGeometry(22, 1.7, 10, 36),
      new THREE.MeshBasicMaterial({
        color: theme,
        transparent: true,
        opacity: 0.68,
      })
    );
    slowedAura.position.y = 4.5;
    slowedAura.rotation.x = Math.PI / 2;
    slowedAura.visible = false;
    group.add(slowedAura);

    const healthGroup = new THREE.Group();
    healthGroup.position.set(0, PLAYER_Y + 40, 0);

    const healthBack = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 4),
      new THREE.MeshBasicMaterial({
        color: "#102030",
        transparent: true,
        opacity: 0.75,
      })
    );
    healthGroup.add(healthBack);

    const healthFill = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 4),
      new THREE.MeshBasicMaterial({
        color: "#ff786d",
      })
    );
    healthFill.position.z = 0.2;
    healthGroup.add(healthFill);

    const nameplate = this.createNameplateSprite(player.name || "Player");
    group.add(nameplate.sprite);
    group.add(healthGroup);
    this.worldRoot.add(group);

    const visual = {
      group,
      body,
      bodyMaterial,
      core,
      coreMaterial,
      ring,
      weapon,
      barrier,
      barrierColumn,
      barrierRing,
      overclock,
      spawnShield,
      cloakAura,
      revealedAura,
      slowedAura,
      healthGroup,
      healthFill,
      nameplate,
    };
    this.playerVisuals.set(playerId, visual);
    return visual;
  }

  removeMissingPlayerVisuals(activeIds) {
    Array.from(this.playerVisuals.entries()).forEach(([playerId, visual]) => {
      if (activeIds.has(playerId)) {
        return;
      }

      this.worldRoot.remove(visual.group);
      visual.nameplate?.texture?.dispose?.();
      visual.nameplate?.sprite?.material?.dispose?.();
      disposeObject(visual.group);
      this.playerVisuals.delete(playerId);
    });
  }

  update(deltaMs, now) {
    const delta = Math.min(deltaMs, 40) / 1000;
    const localRecord = this.getLocalRecord();
    const localCombatForProjectiles = this.getLocalCombatVisual(localRecord);
    const projectileCollisionPlayers = this.collectProjectileCollisionPlayers(localCombatForProjectiles);

    this.remotePlayers.forEach((player) => {
      player.x += (player.targetX - player.x) * 0.22;
      player.y += (player.targetY - player.y) * 0.22;
    });

    this.updateVisuals(delta, now);
    this.updateProjectiles(delta, projectileCollisionPlayers);
    this.updateGroundEffects(now);

    if (this.snapshot.meta?.state === "running" && localRecord?.alive !== false && !this.menuOpen) {
      this.updateMovement(delta, now, localRecord);
      this.updateCombat(now, localRecord);
      this.pushPose(now);
    } else {
      this.justPressed.clear();
    }

    this.camera.x += (this.localPose.x - this.camera.x) * 0.12;
    this.camera.y += (this.localPose.y - this.camera.y) * 0.12;
    this.updatePlayerVisuals(now, this.getLocalCombatVisual(localRecord));
    this.updateStormVisual(now);
    this.updateWorldDecor(now);
    this.updateCamera();
    this.refreshHud(now);
  }

  updateVisuals(delta, now) {
    this.beams = this.beams.filter((beam) => {
      beam.life -= delta;
      beam.material.opacity = Math.max(0, (beam.life / beam.maxLife) * 0.92);
      if (beam.life > 0) {
        return true;
      }
      this.fxRoot.remove(beam.mesh);
      disposeObject(beam.mesh);
      return false;
    });

    this.particles = this.particles.filter((particle) => {
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.z += particle.vz * delta;
      particle.vy -= particle.gravity * delta;
      particle.mesh.position.set(particle.x, particle.y, particle.z);
      particle.material.opacity = Math.max(0, particle.life / particle.maxLife);
      if (particle.life > 0) {
        return true;
      }
      this.fxRoot.remove(particle.mesh);
      particle.material?.dispose?.();
      return false;
    });

    this.damageNumbers = this.damageNumbers.filter((number) => {
      number.life -= delta;
      number.x += number.vx * delta;
      number.y += number.vy * delta;
      number.z += number.vz * delta;
      number.sprite.position.set(number.x, number.y, number.z);
      const opacity = Math.max(0, number.life / number.maxLife);
      const scaleBoost = 1 + (1 - opacity) * 0.12;
      number.material.opacity = opacity;
      number.sprite.scale.set(number.scaleX * scaleBoost, number.scaleY * scaleBoost, 1);
      if (number.life > 0) {
        return true;
      }
      this.disposeDamageNumber(number);
      return false;
    });

    this.killFeed = this.killFeed.filter((entry) => entry.expiresAt > now);

    Array.from(this.hitFlashes.entries()).forEach(([playerId, until]) => {
      if (until <= now) {
        this.hitFlashes.delete(playerId);
      }
    });
  }

  updateProjectiles(delta, collisionPlayers = []) {
    const nextProjectiles = [];

    this.projectiles.forEach((projectile) => {
      projectile.age += delta;
      if (projectile.kind === "arc-orb") {
        const liveTarget = projectile.targetId
          ? this.getDisplayedPlayerPosition(projectile.targetId)
          : null;
        if (liveTarget) {
          projectile.targetX = liveTarget.x;
          projectile.targetY = liveTarget.y;
        }

        const targetX = Number.isFinite(projectile.targetX) ? projectile.targetX : projectile.x;
        const targetY = Number.isFinite(projectile.targetY) ? projectile.targetY : projectile.y;
        const dx = targetX - projectile.x;
        const dy = targetY - projectile.y;
        const distance = Math.hypot(dx, dy);
        const step = (projectile.speed || ARC_ORB_SPEED) * delta;
        if (distance > 0.001) {
          const travel = Math.min(step, Math.max(distance - 2, 0));
          projectile.x += (dx / distance) * travel;
          projectile.y += (dy / distance) * travel;
        }

        const pulse = 1.04 + Math.sin(projectile.age * 18) * 0.12;
        projectile.core?.scale?.setScalar(projectile.baseRadius * 0.72 * pulse);
        projectile.shell?.scale?.setScalar(projectile.baseRadius * 1.72 * (1 + Math.sin(projectile.age * 24) * 0.08));
        projectile.halo?.scale?.setScalar(projectile.baseRadius * 2.25 * (1 + Math.sin(projectile.age * 16) * 0.12));
        if (projectile.shell?.material) {
          projectile.shell.material.opacity = 0.5 + Math.sin(projectile.age * 20) * 0.08;
        }
        if (projectile.halo?.material) {
          projectile.halo.material.opacity = 0.22 + Math.sin(projectile.age * 14) * 0.04;
        }
        projectile.mesh.position.set(
          projectile.x - HALF_WORLD_SIZE,
          projectile.renderHeight || PLAYER_Y + 10,
          projectile.y - HALF_WORLD_SIZE
        );

        if (projectile.age < (projectile.lifetime || ARC_ORB_LIFETIME)) {
          nextProjectiles.push(projectile);
        } else {
          this.disposeProjectileVisual(projectile);
        }
        return;
      }

      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.mesh.position.set(
        projectile.x - HALF_WORLD_SIZE,
        projectile.renderHeight || PLAYER_Y + 6,
        projectile.y - HALF_WORLD_SIZE
      );
      if (projectile.loadoutId === "volt") {
        const pulse = 1 + Math.sin(projectile.age * 24) * 0.08;
        projectile.shell?.scale?.setScalar(projectile.baseRadius * 1.38 * pulse);
        projectile.halo?.scale?.setScalar(projectile.baseRadius * 1.85 * (1 + Math.sin(projectile.age * 18) * 0.1));
        if (projectile.shell?.material) {
          projectile.shell.material.opacity = 0.34 + Math.sin(projectile.age * 18) * 0.06;
        }
        if (projectile.halo?.material) {
          projectile.halo.material.opacity = 0.14 + Math.sin(projectile.age * 15) * 0.03;
        }
      }

      const hitRadius = PLAYER_RADIUS + (projectile.radius || 4);
      const hitRadiusSq = hitRadius * hitRadius;
      let victim = null;

      for (const player of collisionPlayers) {
        if (player.id === projectile.ownerId || player.alive === false) {
          continue;
        }
        const dx = player.x - projectile.x;
        const dy = player.y - projectile.y;
        if (dx * dx + dy * dy <= hitRadiusSq) {
          victim = player;
          break;
        }
      }

      const expired =
        projectile.age >= projectile.lifetime ||
        projectile.x < PLAYER_RADIUS ||
        projectile.y < PLAYER_RADIUS ||
        projectile.x > WORLD_SIZE ||
        projectile.y > WORLD_SIZE;

      if (victim || expired) {
        this.spawnTinyDots(
          projectile.x,
          projectile.y,
          projectile.color,
          victim ? (projectile.loadoutId === "volt" ? 6 : 4) : 2,
          projectile.loadoutId === "volt" ? 24 : 18,
          PLAYER_Y + 8
        );
        this.disposeProjectileVisual(projectile);
        return;
      }

      nextProjectiles.push(projectile);
    });

    this.projectiles = nextProjectiles;
  }

  updateGroundEffects(now) {
    this.groundEffects = this.groundEffects.filter((effect) => {
      if ((effect.expiresAt || 0) <= now) {
        this.fxRoot.remove(effect.group);
        disposeObject(effect.group);
        return false;
      }

      const pulse = 0.94 + Math.sin(now * 0.01 + effect.radius * 0.05) * 0.12;
      const edge = effect.group.userData.edge;
      const ring = effect.group.userData.ring;
      const core = effect.group.userData.core;
      const triggerFill = effect.group.userData.triggerFill;
      const triggerRing = effect.group.userData.triggerRing;
      const mineBase = effect.group.userData.mineBase;
      const mineCap = effect.group.userData.mineCap;
      const mineBeacon = effect.group.userData.mineBeacon;
      const energyBoost =
        effect.type === "storm-pulse" ||
        effect.type === "scan-pulse" ||
        effect.type === "gravity-pulse" ||
        effect.type === "mine-detonate" ||
        effect.type === "shield-pop" ||
        effect.type === "cloak-burst" ||
        effect.type === "overclock-burst";

      if (edge) {
        edge.rotation.z += energyBoost ? 0.025 : 0.01;
        const edgeScale = energyBoost ? effect.radius * (pulse * 1.12) : effect.radius * pulse;
        edge.scale.set(edgeScale, edgeScale, edgeScale);
        if (effect.type === "mine" && now >= (effect.armedAt || 0)) {
          edge.material.opacity = 0.98;
        }
      }

      if (ring) {
        const ringScale = energyBoost ? effect.radius * (pulse * 1.18) : effect.radius * pulse;
        ring.scale.set(ringScale, ringScale, ringScale);
        if (effect.type === "mine") {
          ring.material.opacity = now >= (effect.armedAt || Infinity) ? 0.4 : 0.24;
        }
      }

      if (core) {
        core.rotation.y += energyBoost ? 0.05 : 0.02;
        core.position.y = (effect.type === "storm" || effect.type === "storm-pulse" ? 28 : 12) + Math.sin(now * 0.008) * (energyBoost ? 6 : 3);
      }

      if (triggerFill) {
        const armed = now >= (effect.armedAt || 0);
        const fillScale = effect.triggerRadius * (armed ? pulse : 0.98);
        triggerFill.scale.set(fillScale, fillScale, fillScale);
        triggerFill.material.opacity = armed ? 0.12 + Math.sin(now * 0.01) * 0.02 : 0.08;
      }

      if (triggerRing) {
        const armed = now >= (effect.armedAt || 0);
        const pulseScale = effect.triggerRadius * (armed ? pulse * 1.02 : 0.96);
        triggerRing.scale.set(pulseScale, pulseScale, pulseScale);
        triggerRing.material.opacity = armed ? 0.38 + Math.sin(now * 0.012) * 0.08 : 0.2;
        triggerRing.rotation.z += armed ? 0.018 : 0.008;
      }

      if (mineBase) {
        mineBase.rotation.y += 0.03;
      }

      if (mineCap) {
        const armed = now >= (effect.armedAt || 0);
        mineCap.position.y = 16 + Math.sin(now * 0.014) * (armed ? 1.2 : 0.45);
        mineCap.material.emissiveIntensity = armed ? 1.08 : 0.56;
      }

      if (mineBeacon) {
        const armed = now >= (effect.armedAt || 0);
        mineBeacon.position.y = 28 + Math.sin(now * 0.01) * (armed ? 2.4 : 1.2);
        mineBeacon.material.opacity = armed ? 0.28 + Math.sin(now * 0.012) * 0.08 : 0.15;
        mineBeacon.scale.x = armed ? 1.06 + Math.sin(now * 0.014) * 0.08 : 0.92;
        mineBeacon.scale.z = mineBeacon.scale.x;
      }

      return true;
    });
  }

  getMovementInputVector() {
    const keyboardX = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const keyboardY = (this.keys.has("KeyS") ? 1 : 0) - (this.keys.has("KeyW") ? 1 : 0);
    const x = clamp(keyboardX + this.mobile.move.x, -1, 1);
    const y = clamp(keyboardY + this.mobile.move.y, -1, 1);
    const magnitude = Math.hypot(x, y);
    if (magnitude <= 0.08) {
      return { x: 0, y: 0, magnitude: 0 };
    }

    const normalized = normalize(x, y);
    return {
      x: normalized.x,
      y: normalized.y,
      magnitude,
    };
  }

  getDashDirection(originPose) {
    const movement = this.getMovementInputVector();
    if (movement.magnitude > 0.08) {
      return movement;
    }

    return {
      x: Math.cos(originPose.aim),
      y: Math.sin(originPose.aim),
      magnitude: 1,
    };
  }

  findLocalArcOrbTarget(originPose, excludedIds = null) {
    const excludedSet = excludedIds instanceof Set ? excludedIds : new Set(excludedIds || []);
    let best = null;
    let bestDistance = ARC_ORB_TARGET_RANGE;

    Object.values(this.snapshot.players || {}).forEach((player) => {
      if (
        !player ||
        player.id === this.snapshot.localPlayerId ||
        player.alive === false ||
        excludedSet.has(player.id)
      ) {
        return;
      }

      const dx = player.x - originPose.x;
      const dy = player.y - originPose.y;
      const distance = Math.hypot(dx, dy);
      if (distance > ARC_ORB_TARGET_RANGE) {
        return;
      }

      const diff = Math.abs(wrapAngle(Math.atan2(dy, dx) - originPose.aim));
      if (diff > ARC_ORB_TARGET_ARC) {
        return;
      }

      if (distance <= bestDistance) {
        best = player;
        bestDistance = distance;
      }
    });

    return best;
  }

  updateMovement(delta, now, localRecord) {
    const movement = this.getMovementInputVector();
    const loadout = getLoadout(localRecord.loadoutId || this.selectedLoadoutId);
    let speed = loadout.moveSpeed;

    if ((localRecord.effects?.overclockUntil || 0) > now) {
      speed *= 1.22;
    }

    if ((localRecord.effects?.cloakUntil || 0) > now) {
      speed *= 1.12;
    }

    if ((localRecord.effects?.slowedUntil || 0) > now) {
      speed *= 0.68;
    }

    if (this.mobile.abilityTarget.active && this.mobile.abilityTarget.target) {
      this.localPose.aim = Math.atan2(
        this.mobile.abilityTarget.target.y - this.localPose.y,
        this.mobile.abilityTarget.target.x - this.localPose.x
      );
    } else if (this.mobile.aim.active) {
      this.localPose.aim = Math.atan2(this.mobile.aim.y, this.mobile.aim.x);
    } else if (this.mouse.inside) {
      const worldMouse = this.screenToWorld(this.mouse.x, this.mouse.y);
      this.localPose.aim = Math.atan2(worldMouse.y - this.localPose.y, worldMouse.x - this.localPose.x);
    }

    this.localPose.x = clamp(this.localPose.x + movement.x * speed * delta, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS);
    this.localPose.y = clamp(this.localPose.y + movement.y * speed * delta, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS);

    if (this.justPressed.has("Enter")) {
      this.camera.x = this.localPose.x;
      this.camera.y = this.localPose.y;
    }
  }

  updateCombat(now, localRecord) {
    if (this.mouse.down || this.mobile.fire) {
      this.tryPrimary(now, localRecord);
    }

    if (this.justPressed.has("KeyQ")) {
      this.tryAbility("Q", now, localRecord);
    }
    if (this.justPressed.has("KeyE")) {
      this.tryAbility("E", now, localRecord);
    }
    if (this.justPressed.has("KeyR")) {
      this.tryAbility("R", now, localRecord);
    }

    this.justPressed.clear();
  }

  pointAlongPose(originPose, distance) {
    return {
      x: clamp(originPose.x + Math.cos(originPose.aim) * distance, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
      y: clamp(originPose.y + Math.sin(originPose.aim) * distance, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
    };
  }

  clientToWorld(clientX, clientY) {
    const bounds = this.canvas.getBoundingClientRect();
    return this.screenToWorld(
      clamp(clientX - bounds.left, 0, bounds.width),
      clamp(clientY - bounds.top, 0, bounds.height)
    );
  }

  resolveTempestMineTarget(originPose, options = {}) {
    if (Number.isFinite(options.targetX) && Number.isFinite(options.targetY)) {
      return {
        x: clamp(options.targetX, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
        y: clamp(options.targetY, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
      };
    }

    if (this.mobile.aim.active) {
      return this.pointAlongPose(originPose, 210);
    }

    if (this.mouse.inside) {
      const target = this.screenToWorld(this.mouse.x, this.mouse.y);
      return {
        x: clamp(target.x, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
        y: clamp(target.y, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
      };
    }

    return this.pointAlongPose(originPose, 210);
  }

  resolveAbilityTarget(originPose, loadout, slot, options = {}) {
    if (!this.isPointTargetAbility(loadout.id, slot)) {
      return null;
    }

    switch (`${loadout.id}:${slot}`) {
      case "tempest:E":
        return this.resolveTempestMineTarget(originPose, options);
      case "volt:E":
        if (Number.isFinite(options.targetX) && Number.isFinite(options.targetY)) {
          return {
            x: clamp(options.targetX, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
            y: clamp(options.targetY, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
          };
        }
        return this.pointAlongPose(originPose, 210);
      case "volt:R":
        if (Number.isFinite(options.targetX) && Number.isFinite(options.targetY)) {
          return {
            x: clamp(options.targetX, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
            y: clamp(options.targetY, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
          };
        }
        return this.pointAlongPose(originPose, 250);
      default:
        return null;
    }
  }

  buildAbilityEffectSpec(loadout, slot, target, color, effectId, now, preview = false) {
    if (!target) {
      return null;
    }

    const infiniteExpiry = Number.POSITIVE_INFINITY;
    switch (`${loadout.id}:${slot}`) {
      case "tempest:E":
        return {
          type: "mine",
          effectId,
          x: target.x,
          y: target.y,
          radius: 132,
          triggerRadius: 82,
          armedAt: preview ? infiniteExpiry : now + 350,
          expiresAt: preview ? infiniteExpiry : now + 8200,
          color,
        };
      case "volt:E":
        return {
          type: "gravity",
          effectId,
          x: target.x,
          y: target.y,
          radius: 172,
          pull: 360,
          damage: 10,
          pulseEvery: 780,
          expiresAt: preview ? infiniteExpiry : now + 4600,
          color,
        };
      case "volt:R":
        return {
          type: "storm",
          effectId,
          x: target.x,
          y: target.y,
          radius: 150,
          pulseEvery: 1000,
          damage: 13,
          expiresAt: preview ? infiniteExpiry : now + 5600,
          color,
        };
      default:
        return null;
    }
  }

  upsertMobileAbilityPreview(effect) {
    if (!effect?.previewKey) {
      return;
    }

    const existingIndex = this.groundEffects.findIndex((entry) => entry.previewKey === effect.previewKey);
    const existing = existingIndex >= 0 ? this.groundEffects[existingIndex] : null;

    if (existing && existing.type !== effect.type) {
      this.disposeGroundEffect(existing);
      this.groundEffects.splice(existingIndex, 1);
    }

    const nextExisting = this.groundEffects.find((entry) => entry.previewKey === effect.previewKey);
    if (!nextExisting) {
      this.groundEffects.push(this.createGroundEffectVisual(effect));
      return;
    }

    this.updateGroundEffectEntry(nextExisting, effect);
  }

  updateMobileAbilityTarget(event, localRecord, loadout, slot) {
    const directTarget = this.clientToWorld(event.clientX, event.clientY);
    const targetState = this.mobile.abilityTarget;
    const startWorld = targetState.startWorld || directTarget;
    const pixelDx = event.clientX - (targetState.startClientX || event.clientX);
    const pixelDy = event.clientY - (targetState.startClientY || event.clientY);
    const pixelDistance = Math.hypot(pixelDx, pixelDy);
    const worldDx = directTarget.x - startWorld.x;
    const worldDy = directTarget.y - startWorld.y;
    const acceleration =
      pixelDistance <= 10
        ? 1
        : 1 + clamp(Math.pow((pixelDistance - 10) / 44, 1.02), 0, 1.75);
    const boostedTarget = {
      x: startWorld.x + worldDx * acceleration,
      y: startWorld.y + worldDy * acceleration,
    };
    const clampedTarget = {
      x: clamp(boostedTarget.x, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
      y: clamp(boostedTarget.y, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
    };
    const effectId = targetState.effectId;
    const previewKey = targetState.previewKey;
    const playerColor = resolvePlayerColor(localRecord, loadout.theme);
    this.mobile.abilityTarget.target = clampedTarget;
    this.localPose.aim = Math.atan2(clampedTarget.y - this.localPose.y, clampedTarget.x - this.localPose.x);

    const previewEffect = this.buildAbilityEffectSpec(
      loadout,
      slot,
      clampedTarget,
      playerColor,
      effectId,
      Date.now(),
      true
    );

    if (previewEffect) {
      this.upsertMobileAbilityPreview({
        ...previewEffect,
        previewKey,
      });
    }
  }

  placeTempestMinePreview(effect) {
    if (!effect?.effectId) {
      return;
    }

    const existing = this.groundEffects.find(
      (entry) => entry.effectId === effect.effectId && entry.type === "mine"
    );
    if (existing) {
      return;
    }

    if (Number.isFinite(effect.fromX) && Number.isFinite(effect.fromY)) {
      this.beams.push(
        this.createBeamVisual(effect.fromX, effect.fromY, effect.x, effect.y, effect.color, 3.2, 0.12)
      );
    }
    this.spawnBurst(effect.x, effect.y, effect.color, 10, 86, 14);
    this.groundEffects.push(
      this.createGroundEffectVisual({
        ...effect,
        type: "mine",
      })
    );
  }

  syncTempestMinePreview(effect) {
    const existing = this.groundEffects.find(
      (entry) => entry.effectId === effect.effectId && entry.type === "mine"
    );
    if (!existing) {
      this.placeTempestMinePreview(effect);
      return;
    }

    this.updateGroundEffectEntry(existing, effect);
  }

  updateGroundEffectEntry(existing, effect) {
    if (!existing || !effect) {
      return;
    }

    existing.x = effect.x ?? existing.x;
    existing.y = effect.y ?? existing.y;
    existing.radius = Math.max(18, effect.radius || existing.radius || 40);
    existing.triggerRadius = Math.max(
      16,
      effect.triggerRadius || existing.triggerRadius || existing.radius * 0.62
    );
    existing.armedAt = effect.armedAt ?? existing.armedAt ?? 0;
    existing.expiresAt = effect.expiresAt ?? existing.expiresAt;
    existing.group.position.copy(this.toScenePoint(existing.x, existing.y, 0));
    existing.group.userData.expiresAt = existing.expiresAt ?? existing.group.userData.expiresAt;
    existing.group.userData.armedAt = existing.armedAt ?? existing.group.userData.armedAt;
    existing.group.userData.radius = existing.radius;
    existing.group.userData.triggerRadius = existing.triggerRadius;
  }

  syncPersistentGroundEffect(effect) {
    if (!effect?.type) {
      return;
    }

    const existing = effect.effectId
      ? this.groundEffects.find(
          (entry) => entry.effectId === effect.effectId && entry.type === effect.type
        )
      : null;

    if (!existing) {
      this.groundEffects.push(this.createGroundEffectVisual(effect));
      return;
    }

    this.updateGroundEffectEntry(existing, effect);
  }

  spawnLocalProjectilePreview(originPose, loadout, color, seq) {
    const primary = loadout.primary;
    if (!primary?.speed || !primary?.lifetime) {
      return;
    }

    const angle =
      originPose.aim +
      ((loadout.id === "tempest" ? Math.random() - 0.5 : 0) * (primary.spread || 0));
    const projectile = {
      id: `local_proj_${this.snapshot.localPlayerId || "player"}_${seq}_${Math.round(performance.now())}`,
      ownerId: this.snapshot.localPlayerId,
      loadoutId: loadout.id,
      x: originPose.x + Math.cos(angle) * 26,
      y: originPose.y + Math.sin(angle) * 26,
      vx: Math.cos(angle) * primary.speed,
      vy: Math.sin(angle) * primary.speed,
      radius: primary.radius,
      lifetime: primary.lifetime,
      explosionRadius: primary.explosionRadius || null,
      color,
    };

    this.projectiles.push(this.createProjectileVisual(projectile));
    this.spawnTinyDots(projectile.x, projectile.y, color, loadout.id === "volt" ? 4 : 2, loadout.id === "volt" ? 18 : 14, PLAYER_Y + 6);
    if (loadout.id === "volt") {
      this.spawnBurst(projectile.x, projectile.y, "#fff6c8", 4, 42, PLAYER_Y + 10);
    }
  }

  tryPrimary(now, localRecord) {
    const loadout = getLoadout(localRecord.loadoutId || this.selectedLoadoutId);
    const playerColor = resolvePlayerColor(localRecord, loadout.theme);
    const primary = loadout.primary;
    const rateMs = Math.round((localRecord.effects?.overclockUntil || 0) > now ? primary.rate * 760 : primary.rate * 1000);

    if (now < this.localTimers.primaryReadyAt) {
      return;
    }

    this.localTimers.primaryReadyAt = now + rateMs;
    this.audio.play(primary.sfx);
    const originPose = { ...this.localPose };
    const seq = ++this.actionSeq;
    this.onAction?.({
      kind: "primary",
      pose: originPose,
      seq,
      createdAt: now,
    });

    if (loadout.id === "tempest" || loadout.id === "volt") {
      this.spawnLocalProjectilePreview(originPose, loadout, playerColor, seq);
      return;
    }

    if (loadout.id === "phantom") {
      const end = {
        x: originPose.x + Math.cos(originPose.aim) * primary.range,
        y: originPose.y + Math.sin(originPose.aim) * primary.range,
      };
      this.beams.push(this.createBeamVisual(originPose.x, originPose.y, end.x, end.y, playerColor, 4, 0.08));
      this.spawnTinyDots(originPose.x, originPose.y, playerColor, 2, 12, PLAYER_Y + 6);
      this.spawnTinyDots(end.x, end.y, playerColor, 2, 12, PLAYER_Y + 8);
      return;
    }

    if (loadout.id === "ember") {
      const traces = [];
      for (let pellet = 0; pellet < primary.pellets; pellet += 1) {
        const angle = originPose.aim + (Math.random() - 0.5) * primary.spread;
        traces.push({
          x: originPose.x + Math.cos(angle) * primary.range,
          y: originPose.y + Math.sin(angle) * primary.range,
        });
      }
      this.spawnShotgunVolleyVisual(originPose.x, originPose.y, traces, playerColor);
    }
  }

  castAbility(slot, now, localRecord, options = {}) {
    const loadout = getLoadout(localRecord.loadoutId || this.selectedLoadoutId);
    const playerColor = resolvePlayerColor(localRecord, loadout.theme);
    const ability = loadout.abilities.find((entry) => entry.slot === slot);
    if (!ability || now < this.localTimers[slot]) {
      return false;
    }

    const originPose = { ...this.localPose };
    const dashDirection =
      [`tempest:Q`, `ember:Q`].includes(`${loadout.id}:${slot}`) ? this.getDashDirection(originPose) : null;
    const targetPoint = this.resolveAbilityTarget(originPose, loadout, slot, options);
    const needsEffectId = Boolean(targetPoint || `${loadout.id}:${slot}` === "volt:Q");
    const effectId =
      typeof options.effectId === "string" && options.effectId
        ? options.effectId
        : needsEffectId && this.snapshot.localPlayerId
          ? `effect_${this.snapshot.localPlayerId}_${slot}_${this.actionSeq + 1}_${Math.round(now)}`
          : null;
    const effectSpec = this.buildAbilityEffectSpec(loadout, slot, targetPoint, playerColor, effectId, now, false);
    this.localTimers[slot] = now + ability.cooldown;

    if (this.mobile.abilityTarget.active && this.mobile.abilityTarget.slot === slot) {
      this.clearMobileAbilityTargeting();
    }

    if (`${loadout.id}:${slot}` === "tempest:Q") {
      this.previewDash(190, playerColor, dashDirection);
      this.audio.play("dash");
    } else if (`${loadout.id}:${slot}` === "ember:Q") {
      const landing = this.previewDash(175, playerColor, dashDirection);
      this.spawnSlamImpactVisual(landing.x, landing.y, playerColor, 128);
      this.audio.play("impact");
    } else if (`${loadout.id}:${slot}` === "volt:Q") {
      const localTarget = this.findLocalArcOrbTarget(originPose);
      const launchX = originPose.x + Math.cos(originPose.aim) * 28;
      const launchY = originPose.y + Math.sin(originPose.aim) * 28;
      const fallbackTarget = this.pointAlongPose(originPose, 260);
      this.upsertArcOrbVisual({
        projectileId: effectId,
        ownerId: this.snapshot.localPlayerId,
        x: launchX,
        y: launchY,
        targetId: localTarget?.id || null,
        targetX: localTarget?.x || fallbackTarget.x,
        targetY: localTarget?.y || fallbackTarget.y,
        speed: ARC_ORB_SPEED,
        color: playerColor,
      });
      this.spawnBurst(launchX, launchY, playerColor, 6, 58, PLAYER_Y + 12);
      this.audio.play("beam");
    } else if (`${loadout.id}:${slot}` === "tempest:E") {
      this.audio.play("mine");
    } else if (`${loadout.id}:${slot}` === "tempest:R") {
      this.audio.play("overclock");
    } else if (`${loadout.id}:${slot}` === "ember:E") {
      this.localEffectPreviewUntil.barrier = now + 4500;
      this.spawnBurst(originPose.x, originPose.y, "#fff0da", 8, 86, 24);
      this.spawnTinyDots(originPose.x, originPose.y, playerColor, 6, 16, PLAYER_Y + 12);
      this.audio.play("shield");
    } else if (`${loadout.id}:${slot}` === "ember:R") {
      this.spawnDragonRoarVisual(originPose.x, originPose.y, originPose.aim, 260, playerColor);
      this.audio.play("impact");
    } else if (`${loadout.id}:${slot}` === "phantom:Q") {
      this.audio.play("cloak");
    } else if (`${loadout.id}:${slot}` === "phantom:E") {
      this.audio.play("recon");
    } else if (`${loadout.id}:${slot}` === "phantom:R") {
      this.audio.play("beam");
    } else if (`${loadout.id}:${slot}` === "volt:E") {
      if (targetPoint) {
        this.spawnVoltFieldDeployVisual(originPose.x, originPose.y, targetPoint.x, targetPoint.y, playerColor, "gravity");
      }
      this.audio.play("gravity");
    } else if (`${loadout.id}:${slot}` === "volt:R") {
      if (targetPoint) {
        this.spawnVoltFieldDeployVisual(originPose.x, originPose.y, targetPoint.x, targetPoint.y, playerColor, "storm");
      }
      this.audio.play("storm");
    }

    if (`${loadout.id}:${slot}` === "tempest:E" && effectSpec) {
      this.placeTempestMinePreview({
        ...effectSpec,
        ownerId: this.snapshot.localPlayerId,
        fromX: originPose.x,
        fromY: originPose.y,
      });
    } else if (effectSpec) {
      this.syncPersistentGroundEffect(effectSpec);
    }

    this.onAction?.({
      kind: "ability",
      slot,
      pose: originPose,
      ...(effectId
        ? {
            effectId,
          }
        : {}),
      ...(dashDirection
        ? {
            dashX: dashDirection.x,
            dashY: dashDirection.y,
          }
        : {}),
      ...(targetPoint
        ? {
            targetX: targetPoint.x,
            targetY: targetPoint.y,
          }
        : {}),
      seq: ++this.actionSeq,
      createdAt: now,
    });
    return true;
  }

  tryAbility(slot, now, localRecord) {
    this.castAbility(slot, now, localRecord);
  }

  previewDash(distance, color, direction = null) {
    const fromX = this.localPose.x;
    const fromY = this.localPose.y;
    const dashDirection =
      direction && Math.hypot(direction.x || 0, direction.y || 0) > 0.01
        ? normalize(direction.x, direction.y)
        : { x: Math.cos(this.localPose.aim), y: Math.sin(this.localPose.aim) };
    this.localPose.x = clamp(
      this.localPose.x + dashDirection.x * distance,
      PLAYER_RADIUS,
      WORLD_SIZE - PLAYER_RADIUS
    );
    this.localPose.y = clamp(
      this.localPose.y + dashDirection.y * distance,
      PLAYER_RADIUS,
      WORLD_SIZE - PLAYER_RADIUS
    );
    this.beams.push(this.createBeamVisual(fromX, fromY, this.localPose.x, this.localPose.y, color, 8, 0.14));
    this.spawnBurst(this.localPose.x, this.localPose.y, color, 12, 130, 16);
    this.pushPose(Date.now(), true);
    return {
      x: this.localPose.x,
      y: this.localPose.y,
    };
  }

  pushPose(now, force = false) {
    if (!force && now - this.lastPosePushAt < STATE_PUSH_INTERVAL) {
      return;
    }

    this.lastPosePushAt = now;
    this.onPose?.({
      x: this.localPose.x,
      y: this.localPose.y,
      aim: this.localPose.aim,
    });
  }

  getLocalCombatVisual(localRecord = this.getLocalRecord()) {
    if (!localRecord) {
      return null;
    }

    return {
      ...localRecord,
      x: this.localPose.x,
      y: this.localPose.y,
      aim: this.localPose.aim,
    };
  }

  updatePlayerVisuals(now, localCombatVisual = null) {
    const players = [...Array.from(this.remotePlayers.values()), localCombatVisual].filter(Boolean);

    const activeIds = new Set();
    players.forEach((player) => {
      activeIds.add(player.id);
      const loadout = getLoadout(player.loadoutId);
      const visual = this.ensurePlayerVisual(player.id, player);
      const playerColor = resolvePlayerColor(player, loadout.theme);
      const hitFlash = (this.hitFlashes.get(player.id) || 0) > now;
      const cloakedActive = (player.effects?.cloakUntil || 0) > now;
      const revealedActive = (player.effects?.revealedUntil || 0) > now;
      const slowedActive = (player.effects?.slowedUntil || 0) > now;
      const cloaked =
        player.id !== this.snapshot.localPlayerId &&
        cloakedActive &&
        !revealedActive;
      const opacity =
        player.alive === false
          ? 0.25
          : cloaked
            ? 0.16
            : player.id === this.snapshot.localPlayerId && cloakedActive
              ? 0.6
              : player.id === this.snapshot.localPlayerId
                ? 1
                : 0.92;

      visual.group.position.set(player.x - HALF_WORLD_SIZE, 0, player.y - HALF_WORLD_SIZE);
      visual.group.rotation.y = -player.aim;
      visual.bodyMaterial.color.set(hitFlash ? "#ff8f78" : playerColor);
      visual.bodyMaterial.opacity = opacity;
      visual.bodyMaterial.emissive.set(playerColor);
      visual.bodyMaterial.emissiveIntensity = player.id === this.snapshot.localPlayerId ? 0.78 : 0.44;
      visual.coreMaterial.color.set(playerColor).lerp(new THREE.Color("#ffffff"), 0.24);
      visual.coreMaterial.emissive.set(playerColor);
      visual.coreMaterial.opacity = opacity;
      visual.coreMaterial.emissiveIntensity = hitFlash ? 1.4 : player.id === this.snapshot.localPlayerId ? 1.2 : 0.85;
      visual.weapon.material.color.set(playerColor).lerp(new THREE.Color("#ffffff"), 0.14);
      visual.weapon.material.emissive.set(playerColor);
      visual.ring.material.color.set(playerColor);
      visual.ring.material.opacity = player.alive === false ? 0.15 : 0.46 + Math.sin(now * 0.008) * 0.06;
      visual.barrier.material.color.set(playerColor);
      visual.barrierColumn.material.color.set(playerColor);
      visual.barrierRing.material.color.set(playerColor);
      visual.overclock.material.color.set(playerColor);
      visual.cloakAura.material.color.set(playerColor);
      visual.slowedAura.material.color.set(playerColor);
      const barrierActive =
        player.alive !== false &&
        (
          (player.effects?.barrierUntil || 0) > now ||
          (player.id === this.snapshot.localPlayerId && this.localEffectPreviewUntil.barrier > now)
        );
      const barrierPulse = 0.92 + Math.sin(now * 0.014 + player.x * 0.01) * 0.12;
      visual.barrier.visible = barrierActive;
      visual.barrierColumn.visible = barrierActive;
      visual.barrierRing.visible = barrierActive;
      if (barrierActive) {
        const barrierOpacityBase = player.id === this.snapshot.localPlayerId ? 0.28 : 0.22;
        const barrierScale = 1.04 + barrierPulse * 0.05;
        visual.barrier.material.opacity = barrierOpacityBase + barrierPulse * 0.08;
        visual.barrier.scale.set(barrierScale, 1.02 + barrierPulse * 0.04, barrierScale);
        visual.barrierColumn.material.opacity = 0.14 + barrierPulse * 0.06;
        visual.barrierColumn.scale.set(
          1.02 + barrierPulse * 0.05,
          1.08 + barrierPulse * 0.04,
          1.02 + barrierPulse * 0.05
        );
        visual.barrierColumn.rotation.y += 0.035;
        visual.barrierRing.material.opacity = 0.62 + barrierPulse * 0.14;
        visual.barrierRing.scale.setScalar(1.03 + barrierPulse * 0.08);
        visual.barrierRing.rotation.z += 0.09;
      } else {
        visual.barrier.material.opacity = 0.24;
        visual.barrier.scale.setScalar(1);
        visual.barrierColumn.material.opacity = 0.14;
        visual.barrierColumn.scale.setScalar(1);
        visual.barrierRing.material.opacity = 0.78;
        visual.barrierRing.scale.setScalar(1);
      }
      visual.spawnShield.visible = (player.effects?.spawnShieldUntil || 0) > now;
      visual.overclock.visible = (player.effects?.overclockUntil || 0) > now;
      visual.cloakAura.visible = cloakedActive;
      visual.revealedAura.visible = revealedActive;
      visual.slowedAura.visible = slowedActive;
      visual.overclock.rotation.z += 0.06;
      visual.cloakAura.rotation.z -= 0.05;
      visual.revealedAura.rotation.z += 0.07;
      visual.slowedAura.rotation.z -= 0.08;
      visual.revealedAura.material.opacity = player.alive === false ? 0.2 : 0.76 + Math.sin(now * 0.01) * 0.08;
      visual.slowedAura.material.opacity = player.alive === false ? 0.16 : 0.54 + Math.sin(now * 0.012 + player.y * 0.01) * 0.1;
      visual.healthGroup.quaternion.copy(this.camera3D.quaternion);
      this.updateNameplateSprite(visual.nameplate, player.name, player.id === this.snapshot.localPlayerId);
      visual.nameplate.sprite.material.opacity = player.alive === false ? 0.42 : cloaked ? 0.34 : 1;
      visual.nameplate.sprite.position.y = PLAYER_Y + 52 + Math.sin(now * 0.004 + player.x * 0.01) * 1.4;

      if (slowedActive && player.alive !== false) {
        const trailKey = `slow:${player.id}`;
        const nextTrailAt = this.statusTrailAt.get(trailKey) || 0;
        if (now >= nextTrailAt) {
          this.statusTrailAt.set(trailKey, now + 130);
          const offset = Math.sin(now * 0.01 + player.x * 0.02) * 6;
          this.spawnBurst(
            player.x - Math.cos(player.aim) * 10,
            player.y - Math.sin(player.aim) * 10 + offset,
            playerColor,
            2,
            28,
            10
          );
        }
      } else {
        this.statusTrailAt.delete(`slow:${player.id}`);
      }

      const healthScale = clamp(player.health / Math.max(player.maxHealth || loadout.maxHealth, 1), 0, 1);
      visual.healthFill.scale.x = Math.max(0.001, healthScale);
      visual.healthFill.position.x = -16 + 16 * healthScale;
      visual.healthFill.material.color.set(player.alive === false ? "#8091a0" : "#ff786d");
    });

    this.removeMissingPlayerVisuals(activeIds);
  }

  updateStormVisual(now) {
    if (!this.snapshot.meta?.startedAt || !this.snapshot.meta?.seed || this.snapshot.meta?.state === "idle") {
      this.stormVisual.group.visible = false;
      return;
    }

    const storm = getStormState(this.snapshot.meta.startedAt, this.snapshot.meta.seed, now);
    this.stormVisual.group.visible = true;
    this.stormVisual.group.position.set(storm.center.x - HALF_WORLD_SIZE, 0, storm.center.y - HALF_WORLD_SIZE);
    this.stormVisual.wall.scale.set(storm.radius, 1, storm.radius);
    this.stormVisual.edge.scale.set(storm.radius, storm.radius, storm.radius);
    this.stormVisual.halo.scale.set(storm.radius, storm.radius, storm.radius);
    this.stormVisual.edge.rotation.z += 0.002;
    this.stormVisual.halo.material.opacity = 0.14 + Math.sin(now * 0.006) * 0.04;
  }

  updateWorldDecor(now) {
    this.decorVisuals.forEach((child) => {
      const { ring, wobble, baseY } = child.userData || {};
      if (ring) {
        ring.rotation.z += 0.004 * wobble;
        ring.position.y = baseY + Math.sin(now * 0.0015 * wobble) * 2;
      }
    });
  }

  updateCamera() {
    const focus = this.tempVectors.focus.set(this.camera.x - HALF_WORLD_SIZE, CAMERA_LOOK_HEIGHT, this.camera.y - HALF_WORLD_SIZE);
    const desiredPosition = this.tempVectors.desiredCamera.set(focus.x, focus.y + CAMERA_HEIGHT, focus.z + CAMERA_DISTANCE);
    this.camera3D.position.lerp(desiredPosition, 0.12);
    this.camera3D.lookAt(focus);
  }

  refreshHud(now) {
    if (now - this.lastHudRefresh < 45) {
      return;
    }

    this.lastHudRefresh = now;
    if (this.snapshot.meta?.state !== "running" && this.snapshot.meta?.state !== "ended") {
      this.showMatchDetails = false;
    }
    const localRecord = this.getLocalRecord();
    const loadout = getLoadout(localRecord?.loadoutId || this.selectedLoadoutId);
    const players = Object.values(this.snapshot.players || {});
    const maxHealth = localRecord?.maxHealth ?? loadout.maxHealth;
    const maxShield = localRecord?.maxShield ?? loadout.maxShield;
    const alive = players.filter((player) => player.alive !== false).length;
    const healthValue = localRecord ? localRecord.health : maxHealth;
    const shieldValue = localRecord ? localRecord.shield : maxShield;
    const storm =
      this.snapshot.meta?.startedAt && this.snapshot.meta?.seed
        ? getStormState(this.snapshot.meta.startedAt, this.snapshot.meta.seed, now)
        : null;
    const shouldBuildScoreboard = Boolean(this.ui.scoreboard && !this.mobile.enabled && this.snapshot.meta?.state === "running");
    const leaderboard = shouldBuildScoreboard ? [...players].sort(scoreSort) : [];

    this.ui.healthBar.style.width = `${clamp((healthValue / maxHealth) * 100, 0, 100)}%`;
    this.ui.shieldBar.style.width = `${clamp((shieldValue / (maxShield + 36)) * 100, 0, 100)}%`;
    this.ui.healthLabel.textContent = `${Math.ceil(healthValue)} / ${maxHealth}`;
    this.ui.shieldLabel.textContent = `${Math.ceil(shieldValue)} / ${maxShield}`;
    this.ui.killsReadout.textContent = String(localRecord?.kills || 0);
    this.ui.statsReadout.textContent = `K/D/R ${(localRecord?.kills || 0)} / ${(localRecord?.deaths || 0)} / ${(localRecord?.respawns || 0)}`;
    this.ui.aliveReadout.textContent = String(alive);
    this.ui.roomCodeReadout.textContent = `Sala: ${this.snapshot.roomId || "----"}`;
    this.ui.loadoutReadout.textContent = `Classe: ${loadout.name}`;
    this.ui.syncReadout.textContent =
      this.snapshot.networkMode === "playroom" ? "Realtime Playroom" : "Playroom nao configurado";
    this.ui.matchStateLabel.textContent =
      this.snapshot.meta?.state === "running"
        ? "Em Partida"
        : this.snapshot.meta?.state === "ended"
          ? "Partida Encerrada"
          : "Lobby";

    if (storm && this.snapshot.meta?.state === "running") {
      this.ui.stormReadout.textContent = `Fase ${storm.phaseIndex + 1} // raio ${Math.round(storm.radius)}`;
      this.ui.stormTimer.textContent = formatClock(storm.remainingMs);
    } else {
      this.ui.stormReadout.textContent = "Aguardando partida";
      this.ui.stormTimer.textContent = "00:00";
    }

    const winnerName = this.snapshot.meta?.winnerId
      ? this.snapshot.players?.[this.snapshot.meta.winnerId]?.name || "Player"
      : "Sem vencedor";
    this.ui.winnerReadout.textContent =
      this.snapshot.meta?.winnerId ? `Vencedor: ${winnerName}` : "Sem vencedor";
    const killFeedHtml = this.killFeed.map((entry) => `<p>${escapeHtml(entry.text)}</p>`).join("");
    if (this.hudCache.killFeedHtml !== killFeedHtml) {
      this.ui.killFeed.innerHTML = killFeedHtml;
      this.hudCache.killFeedHtml = killFeedHtml;
    }

    if (this.ui.scoreboard) {
      const scoreboardHtml = leaderboard.length
        ? leaderboard
            .map((player, index) => {
              const localClass = player.id === this.snapshot.localPlayerId ? " is-local" : "";
              return `
                <article class="score-row${localClass}">
                  <strong>${index + 1}. ${escapeHtml(player.name)}</strong>
                  <span>${player.kills || 0} abates</span>
                  <small>${player.deaths || 0} mortes // ${player.respawns || 0} respawns</small>
                </article>
              `;
            })
            .join("")
        : `<article class="score-row"><strong>Nenhum jogador</strong><span>Placares aparecem durante a sala.</span></article>`;
      if (this.hudCache.scoreboardHtml !== scoreboardHtml) {
        this.ui.scoreboard.innerHTML = scoreboardHtml;
        this.hudCache.scoreboardHtml = scoreboardHtml;
      }
    }

    this.refreshMatchDetailsVisibility();
    this.refreshAbilityBar(now);
    this.refreshRespawnOverlay(localRecord, now);
  }

  refreshMatchDetailsVisibility() {
    const hudVisible = !this.mobile.enabled && this.snapshot.meta?.state === "running";
    const detailsVisible = hudVisible && this.showMatchDetails;

    if (this.ui.hudDetails) {
      this.ui.hudDetails.hidden = !hudVisible;
    }

    if (this.ui.statusGrid) {
      this.ui.statusGrid.hidden = !detailsVisible;
    }
  }

  refreshRespawnOverlay(localRecord, now) {
    if (!this.ui.respawnOverlay || !this.ui.respawnTimer || !this.ui.respawnLabel) {
      return;
    }

    if (this.snapshot.meta?.state === "running" && localRecord?.alive === false) {
      const remaining = Math.max(0, (localRecord.respawnAt || now) - now);
      this.ui.respawnOverlay.hidden = false;
      this.ui.respawnLabel.textContent = "Eliminado. Preparando reentrada...";
      this.ui.respawnTimer.textContent = formatClock(remaining);
      return;
    }

    this.ui.respawnOverlay.hidden = true;
  }

  refreshAbilityBar(now = Date.now()) {
    if (!this.ui.abilityBar) {
      return;
    }

    const localRecord = this.getLocalRecord();
    const loadout = getLoadout(localRecord?.loadoutId || this.selectedLoadoutId);
    const abilityColor = resolvePlayerColor(localRecord, loadout.theme);
    const desktopKey = `${loadout.id}:${abilityColor}`;
    if (this.abilityUiState.desktopKey !== desktopKey) {
      this.ui.abilityBar.innerHTML = loadout.abilities
        .map((ability) => {
          const iconSvg = renderAbilityIconSvg(ability);
          const hasIcon = Boolean(iconSvg);
          return `
            <button
              type="button"
              class="ability-slot ${hasIcon ? "has-icon" : ""}"
              data-ability-slot="${ability.slot}"
              data-ability-name="${escapeHtml(ability.name)}"
              data-ability-detail="${escapeHtml(ability.summary)}"
              data-ability-damage="${escapeHtml(ability.damageLabel || "")}"
              tabindex="-1"
            >
              ${hasIcon ? `<span class="ability-slot__icon" style="color: ${escapeHtml(abilityColor)}">${iconSvg}</span>` : ""}
              <span class="ability-slot__key">${ability.slot}</span>
              <span class="ability-slot__cooldown"></span>
            </button>
          `;
        })
        .join("");
      this.abilityUiState.desktopKey = desktopKey;
      this.abilityUiState.desktopButtons = new Map(
        Array.from(this.ui.abilityBar.querySelectorAll("[data-ability-slot]")).map((button) => [
          button.dataset.abilitySlot,
          {
            button,
            cooldown: button.querySelector(".ability-slot__cooldown"),
          },
        ])
      );
    }

    loadout.abilities.forEach((ability) => {
      const readyIn = Math.max(0, (this.localTimers[ability.slot] || 0) - now);
      const cooldownValue = readyIn > 0 ? String(Math.ceil(readyIn / 1000)) : "";
      const refs = this.abilityUiState.desktopButtons.get(ability.slot);
      if (refs?.cooldown && refs.cooldown.textContent !== cooldownValue) {
        refs.cooldown.textContent = cooldownValue;
      }
      if (refs?.button) {
        refs.button.classList.toggle("is-cooling", readyIn > 0);
      }
    });

    const mobileKey = `${loadout.id}:${abilityColor}`;
    const mobileButtons = this.ui.mobileAbilityButtons || {};
    if (this.abilityUiState.mobileKey !== mobileKey) {
      Object.entries(mobileButtons).forEach(([slot, button]) => {
        const ability = loadout.abilities.find((entry) => entry.slot === slot);
        if (!button || !ability) {
          return;
        }
        const label = button.querySelector("[data-mobile-label]");
        const iconSvg = renderAbilityIconSvg(ability);
        button.dataset.abilitySlot = ability.slot;
        button.dataset.abilityName = ability.name;
        button.dataset.abilityDetail = ability.summary;
        button.dataset.abilityDamage = ability.damageLabel || "";
        if (label) {
          label.innerHTML = iconSvg
            ? `<span class="mobile-action__face"><span class="mobile-action__icon" style="color: ${escapeHtml(
                abilityColor
              )}">${iconSvg}</span><em>${ability.slot}</em></span>`
            : ability.slot;
        }
      });
      this.abilityUiState.mobileKey = mobileKey;
    }

    Object.entries(mobileButtons).forEach(([slot, button]) => {
      const ability = loadout.abilities.find((entry) => entry.slot === slot);
      if (!button || !ability) {
        return;
      }
      const readyIn = Math.max(0, (this.localTimers[slot] || 0) - now);
      const meta = button.querySelector("[data-mobile-meta]");
      const cooldownValue = readyIn > 0 ? String(Math.ceil(readyIn / 1000)) : "";
      if (meta && meta.textContent !== cooldownValue) {
        meta.textContent = cooldownValue;
      }
      button.classList.toggle("is-cooling", readyIn > 0);
    });
  }

  render() {
    this.renderer.render(this.scene, this.camera3D);
  }

  screenToWorld(screenX, screenY) {
    const width = Math.max(1, this.canvas.clientWidth || this.canvas.width || 1);
    const height = Math.max(1, this.canvas.clientHeight || this.canvas.height || 1);
    this.pointerNdc.set((screenX / width) * 2 - 1, -((screenY / height) * 2 - 1));
    this.raycaster.setFromCamera(this.pointerNdc, this.camera3D);
    const target = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(GROUND_PLANE, target);

    if (!hit) {
      return {
        x: this.localPose.x,
        y: this.localPose.y,
      };
    }

    return {
      x: clamp(target.x + WORLD_SIZE / 2, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
      y: clamp(target.z + WORLD_SIZE / 2, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
    };
  }

  toScenePoint(x, y, height = 0) {
    return new THREE.Vector3(x - HALF_WORLD_SIZE, height, y - HALF_WORLD_SIZE);
  }

  spawnBurst(x, y, color, count, speed, height = 18) {
    const total = this.scaleFxCount(count);
    const baseX = x - HALF_WORLD_SIZE;
    const baseZ = y - HALF_WORLD_SIZE;
    for (let index = 0; index < total; index += 1) {
      const angle = (index / Math.max(total, 1)) * TAU + Math.random() * 0.36;
      const velocity = speed * (0.38 + Math.random() * 0.66);
      const particleHeight = height + Math.random() * 12;
      const size = 1.8 + Math.random() * 1.8;
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(this.sharedGeometries.burstParticle, material);
      mesh.scale.setScalar(size);
      mesh.position.set(baseX, particleHeight, baseZ);
      this.fxRoot.add(mesh);

      this.particles.push({
        mesh,
        material,
        x: baseX,
        y: particleHeight,
        z: baseZ,
        life: 0.3 + Math.random() * 0.22,
        maxLife: 0.42,
        vx: Math.cos(angle) * velocity,
        vy: 28 + Math.random() * 58,
        vz: Math.sin(angle) * velocity,
        gravity: 120 + Math.random() * 90,
      });
    }
  }

  spawnTinyDots(x, y, color, count = 2, speed = 16, height = PLAYER_Y + 8) {
    const total = this.scaleFxCount(count);
    const baseX = x - HALF_WORLD_SIZE;
    const baseZ = y - HALF_WORLD_SIZE;
    for (let index = 0; index < total; index += 1) {
      const angle = Math.random() * TAU;
      const velocity = speed * (0.42 + Math.random() * 0.4);
      const particleHeight = height + Math.random() * 4;
      const size = 0.55 + Math.random() * 0.35;
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92,
      });
      const mesh = new THREE.Mesh(this.sharedGeometries.tinyParticle, material);
      mesh.scale.setScalar(size);
      mesh.position.set(baseX, particleHeight, baseZ);
      this.fxRoot.add(mesh);

      this.particles.push({
        mesh,
        material,
        x: baseX,
        y: particleHeight,
        z: baseZ,
        life: 0.18 + Math.random() * 0.1,
        maxLife: 0.24,
        vx: Math.cos(angle) * velocity,
        vy: 10 + Math.random() * 18,
        vz: Math.sin(angle) * velocity,
        gravity: 52 + Math.random() * 28,
      });
    }
  }

  spawnConeBurst(x, y, angle, range, color) {
    const segments = 12;
    for (let index = 0; index < segments; index += 1) {
      const t = segments === 1 ? 0.5 : index / (segments - 1);
      const localAngle = angle - 0.72 + t * 1.44;
      const distance = range * (0.45 + Math.random() * 0.5);
      this.spawnBurst(
        x + Math.cos(localAngle) * distance * 0.45,
        y + Math.sin(localAngle) * distance * 0.45,
        color,
        2,
        80,
        16
      );
    }
  }

  loop(timestamp) {
    const deltaMs = this.lastFrame ? timestamp - this.lastFrame : 16;
    this.lastFrame = timestamp;
    this.update(deltaMs, Date.now());
    this.render();
    window.requestAnimationFrame(this.loop);
  }
}
