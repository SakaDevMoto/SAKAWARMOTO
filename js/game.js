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
} from "./data.js";

const TAU = Math.PI * 2;
const MOBILE_QUERY = "(pointer: coarse)";
const PLAYER_Y = 18;
const CAMERA_HEIGHT = 620;
const CAMERA_DISTANCE = 500;
const CAMERA_LOOK_HEIGHT = 24;
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

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
    default:
      return "";
  }
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
    this.projectiles = [];
    this.groundEffects = [];
    this.beams = [];
    this.particles = [];
    this.killFeed = [];
    this.hitFlashes = new Map();
    this.damageNumbers = [];
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
      move: { pointerId: null, x: 0, y: 0 },
      aim: { pointerId: null, x: 0, y: 0, active: false },
      fire: false,
    };

    this.camera = {
      x: WORLD_SIZE / 2,
      y: WORLD_SIZE / 2,
    };

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

    this.camera3D = new THREE.PerspectiveCamera(52, 16 / 9, 1, 5200);
    this.worldRoot = new THREE.Group();
    this.fxRoot = new THREE.Group();
    this.scene.add(this.worldRoot);
    this.scene.add(this.fxRoot);

    this.buildScene();
    this.syncRendererSize();
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
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -1600;
    sun.shadow.camera.right = 1600;
    sun.shadow.camera.top = 1600;
    sun.shadow.camera.bottom = -1600;
    this.scene.add(sun);

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
    if (!this.ui.movePad || !this.ui.aimPad) {
      return;
    }

    const bindStick = (pad, stick, state, isAim = false) => {
      const updateStick = (event) => {
        if (state.pointerId !== event.pointerId) {
          return;
        }

        const bounds = pad.getBoundingClientRect();
        const centerX = bounds.left + bounds.width * 0.5;
        const centerY = bounds.top + bounds.height * 0.5;
        const dx = event.clientX - centerX;
        const dy = event.clientY - centerY;
        const radius = Math.max(20, Math.min(bounds.width, bounds.height) * 0.34);
        const distance = Math.min(radius, Math.hypot(dx, dy) || 0);
        const angle = Math.atan2(dy, dx);
        const offsetX = Math.cos(angle) * distance;
        const offsetY = Math.sin(angle) * distance;

        state.x = clamp(offsetX / radius, -1, 1);
        state.y = clamp(offsetY / radius, -1, 1);
        if (isAim) {
          state.active = Math.hypot(state.x, state.y) > 0.18;
        }

        if (stick) {
          stick.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
        }
      };

      pad.addEventListener("pointerdown", async (event) => {
        if (!this.mobile.enabled || state.pointerId !== null) {
          return;
        }

        event.preventDefault();
        state.pointerId = event.pointerId;
        pad.setPointerCapture?.(event.pointerId);
        await this.audio.boot();
        updateStick(event);
      });

      pad.addEventListener("pointermove", (event) => {
        updateStick(event);
      });

      const releaseStick = (event) => {
        if (state.pointerId !== event.pointerId) {
          return;
        }
        this.resetJoystick(state, stick, isAim);
      };

      pad.addEventListener("pointerup", releaseStick);
      pad.addEventListener("pointercancel", releaseStick);
      pad.addEventListener("lostpointercapture", releaseStick);
    };

    bindStick(this.ui.movePad, this.ui.moveStick, this.mobile.move);
    bindStick(this.ui.aimPad, this.ui.aimStick, this.mobile.aim, true);

    if (this.ui.mobileFireButton) {
      let firePointerId = null;
      const activateFire = async (event) => {
        if (!this.mobile.enabled) {
          return;
        }
        event.preventDefault();
        firePointerId = event.pointerId;
        this.ui.mobileFireButton.setPointerCapture?.(event.pointerId);
        this.mobile.fire = true;
        this.ui.mobileFireButton.classList.add("is-active");
        await this.audio.boot();
      };
      const releaseFire = (event) => {
        if (event && firePointerId !== null && event.pointerId !== firePointerId) {
          return;
        }
        firePointerId = null;
        this.mobile.fire = false;
        this.ui.mobileFireButton.classList.remove("is-active");
      };

      this.ui.mobileFireButton.addEventListener("pointerdown", activateFire);
      this.ui.mobileFireButton.addEventListener("pointerup", releaseFire);
      this.ui.mobileFireButton.addEventListener("pointercancel", releaseFire);
      this.ui.mobileFireButton.addEventListener("pointerleave", releaseFire);
      this.ui.mobileFireButton.addEventListener("lostpointercapture", releaseFire);
    }

    Object.entries(this.ui.mobileAbilityButtons || {}).forEach(([slot, button]) => {
      const code = `Key${slot}`;
      let activePointerId = null;
      let holdTimer = null;
      let showingTooltip = false;

      button.addEventListener("pointerdown", async (event) => {
        if (!this.mobile.enabled) {
          return;
        }
        event.preventDefault();
        activePointerId = event.pointerId;
        showingTooltip = false;
        button.setPointerCapture?.(event.pointerId);
        button.classList.add("is-active");
        await this.audio.boot();
        holdTimer = window.setTimeout(() => {
          showingTooltip = true;
          this.showAbilityTooltip(button);
        }, 420);
      });

      const clear = (event, triggerAbility = false) => {
        if (event && activePointerId !== null && event.pointerId !== activePointerId) {
          return;
        }
        if (holdTimer) {
          window.clearTimeout(holdTimer);
          holdTimer = null;
        }
        if (triggerAbility && !showingTooltip) {
          this.justPressed.add(code);
        }
        showingTooltip = false;
        activePointerId = null;
        button.classList.remove("is-active");
        this.hideAbilityTooltip();
      };

      button.addEventListener("pointerup", (event) => clear(event, true));
      button.addEventListener("pointercancel", clear);
      button.addEventListener("pointerleave", clear);
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
    if (!abilityName && !abilityDetail) {
      this.hideAbilityTooltip();
      return;
    }

    this.ui.abilityTooltip.innerHTML = `
      <strong>${escapeHtml(abilityName)}</strong>
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

  resetJoystick(state, stick, isAim = false) {
    state.pointerId = null;
    state.x = 0;
    state.y = 0;
    if (isAim) {
      state.active = false;
    }
    if (stick) {
      stick.style.transform = "translate(-50%, -50%)";
    }
  }

  clearControlState() {
    this.mouse.down = false;
    this.mouse.inside = false;
    this.mobile.fire = false;
    this.resetJoystick(this.mobile.move, this.ui.moveStick);
    this.resetJoystick(this.mobile.aim, this.ui.aimStick, true);
    this.keys.clear();
    this.justPressed.clear();
  }

  syncRendererSize() {
    const width = Math.max(1, Math.floor(this.canvas.clientWidth || this.canvas.width || 1280));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight || this.canvas.height || 720));
    const maxPixelRatio = this.mobile.enabled ? 1.35 : 1.9;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
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

  setMenuOpen(open) {
    this.menuOpen = Boolean(open);
    this.clearControlState();
    this.showMatchDetails = false;
    this.hideAbilityTooltip();
  }

  setSnapshot(snapshot) {
    this.snapshot = snapshot;
    const localRecord = this.getLocalRecord();

    if (localRecord) {
      this.selectedLoadoutId = localRecord.loadoutId || this.selectedLoadoutId;
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
    this.refreshHud(Date.now());
  }

  handleMatchStart() {
    this.clearTransientVisuals();
    this.killFeed = [];
    this.processedEvents.clear();
    this.processedQueue = [];
    this.hitFlashes.clear();
    this.showMatchDetails = false;
    this.hideAbilityTooltip();
    this.localTimers = {
      primaryReadyAt: 0,
      Q: 0,
      E: 0,
      R: 0,
    };
    this.audio.play("start");
  }

  clearTransientVisuals() {
    this.projectiles.forEach((projectile) => {
      this.fxRoot.remove(projectile.mesh);
      disposeObject(projectile.mesh);
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
      disposeObject(particle.mesh);
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
        this.projectiles.push(this.createProjectileVisual(event));
        break;
      case "hitscan":
        this.beams.push(this.createBeamVisual(event.x, event.y, event.toX, event.toY, event.color, event.width || 4, 0.14));
        break;
      case "shotgun":
        (event.traces || []).forEach((trace) => {
          this.beams.push(this.createBeamVisual(event.x, event.y, trace.x, trace.y, event.color, 2.8, 0.1));
        });
        break;
      case "mine":
        if (Number.isFinite(event.fromX) && Number.isFinite(event.fromY)) {
          this.beams.push(this.createBeamVisual(event.fromX, event.fromY, event.x, event.y, event.color, 3.2, 0.12));
        }
        this.spawnBurst(event.x, event.y, event.color, 10, 86, 14);
        this.groundEffects.push(this.createGroundEffectVisual(event));
        break;
      case "gravity":
      case "storm":
      case "recon":
        this.groundEffects.push(this.createGroundEffectVisual(event));
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
        this.groundEffects.push(
          this.createGroundEffectVisual({
            type: "shockwave",
            x: event.toX || event.x,
            y: event.toY || event.y,
            radius: event.radius || 120,
            color: event.color,
            expiresAt: Date.now() + 420,
          })
        );
        this.spawnBurst(event.toX || event.x, event.toY || event.y, event.color, 16, 150, 18);
        break;
      case "cone":
        this.groundEffects.push(
          this.createGroundEffectVisual({
            type: "cone-burst",
            x: event.x,
            y: event.y,
            angle: event.angle,
            range: event.range || 240,
            radius: event.range || 240,
            color: event.color,
            expiresAt: Date.now() + 360,
          })
        );
        this.spawnConeBurst(event.x, event.y, event.angle || 0, event.range || 240, event.color);
        break;
      case "arc-dash":
        this.beams.push(this.createBeamVisual(event.fromX, event.fromY, event.toX, event.toY, event.color, 11, 0.18));
        (event.chains || []).forEach((chain) => {
          this.beams.push(this.createBeamVisual(event.toX, event.toY, chain.x, chain.y, event.color, 4.2, 0.14));
        });
        this.spawnBurst(event.toX, event.toY, event.color, 10, 110, 18);
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
        this.spawnBurst(event.x, event.y, event.color, 16, 120, 26);
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
        this.spawnBurst(event.x, event.y, event.color, 10, 82, 18);
        break;
      case "damage": {
        this.hitFlashes.set(event.targetId, Date.now() + 220);
        const target = this.snapshot.players?.[event.targetId];
        if (target) {
          this.spawnBurst(target.x, target.y, "#ff8f78", 7, 75, 18);
        }
        this.spawnDamageNumber(event.targetId, event.amount);
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
    const radius = Math.max(3, event.radius || 4);
    const material = new THREE.MeshStandardMaterial({
      color: event.color || "#ffffff",
      emissive: event.color || "#ffffff",
      emissiveIntensity: 1.25,
      roughness: 0.2,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 14), material);
    mesh.castShadow = true;
    mesh.position.copy(this.toScenePoint(event.x, event.y, 18));
    this.fxRoot.add(mesh);

    return {
      ...event,
      age: 0,
      mesh,
    };
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
        const triggerRing = new THREE.Mesh(
          new THREE.RingGeometry(0.76, 0.82, 56),
          new THREE.MeshBasicMaterial({
            color: "#fff1a8",
            transparent: true,
            opacity: 0.14,
            side: THREE.DoubleSide,
          })
        );
        triggerRing.rotation.x = -Math.PI / 2;
        triggerRing.position.y = 3;
        triggerRing.scale.set(triggerRadius, triggerRadius, triggerRadius);
        group.add(triggerRing);
        group.userData.triggerRing = triggerRing;

        const mineBase = new THREE.Mesh(
          new THREE.CylinderGeometry(12, 15, 8, 12),
          new THREE.MeshStandardMaterial({
            color: "#142532",
            emissive: color,
            emissiveIntensity: 0.24,
            roughness: 0.36,
            metalness: 0.52,
          })
        );
        mineBase.position.y = 7;
        group.add(mineBase);
        group.userData.mineBase = mineBase;

        const mineCap = new THREE.Mesh(
          new THREE.SphereGeometry(5.8, 16, 12),
          new THREE.MeshStandardMaterial({
            color: "#dffcff",
            emissive: color,
            emissiveIntensity: 0.6,
            roughness: 0.18,
            metalness: 0.26,
          })
        );
        mineCap.position.y = 13;
        group.add(mineCap);
        group.userData.mineCap = mineCap;
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
    sprite.scale.set(78, 20, 1);

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

    context.font = '700 42px "Oxanium", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = isLocal ? "#061018" : "#f3fbff";
    context.fillText(safeName, width / 2, height / 2 - 4);

    texture.needsUpdate = true;
    const widthScale = Math.max(62, Math.min(118, 44 + safeName.length * 4.2));
    sprite.scale.set(widthScale, 18, 1);
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
    const scaleX = Math.max(24, Math.min(40, 18 + String(text).length * 5));
    const scaleY = 18;

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
    context.font = '800 76px "Oxanium", sans-serif';
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

  spawnDamageNumber(playerId, amount) {
    const damage = Math.max(0, Math.round(amount || 0));
    if (!damage) {
      return;
    }

    const target = this.getDisplayedPlayerPosition(playerId);
    if (!target) {
      return;
    }

    const label = this.createFloatingTextSprite(
      String(damage),
      playerId === this.snapshot.localPlayerId ? "#ffd3d3" : "#ffe08f"
    );
    const position = this.toScenePoint(target.x, target.y, PLAYER_Y + 78 + Math.random() * 8);
    position.x += (Math.random() - 0.5) * 18;
    position.z += (Math.random() - 0.5) * 14;
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
    const theme = new THREE.Color(loadout.theme);
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
      color: "#f3fbff",
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
        color: "#e8f7ff",
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
        color: "#8ffff6",
        transparent: true,
        opacity: 0.18,
      })
    );
    barrier.position.y = PLAYER_Y + 4;
    barrier.visible = false;
    group.add(barrier);

    const overclock = new THREE.Mesh(
      new THREE.TorusGeometry(15, 1.8, 10, 28),
      new THREE.MeshBasicMaterial({
        color: loadout.theme,
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
        color: "#8ec7ff",
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
        color: "#ffb37d",
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

    this.remotePlayers.forEach((player) => {
      player.x += (player.targetX - player.x) * 0.22;
      player.y += (player.targetY - player.y) * 0.22;
    });

    this.updateVisuals(delta, now);
    this.updateProjectiles(delta);
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
    this.updatePlayerVisuals(now);
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
      disposeObject(particle.mesh);
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

  updateProjectiles(delta) {
    this.projectiles = this.projectiles.filter((projectile) => {
      projectile.age += delta;
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.mesh.position.copy(this.toScenePoint(projectile.x, projectile.y, 18));

      const players = [
        ...Array.from(this.remotePlayers.values()),
        this.getLocalCombatVisual(),
      ].filter(Boolean);

      const victim = players.find(
        (player) =>
          player.id !== projectile.ownerId &&
          player.alive !== false &&
          Math.hypot(player.x - projectile.x, player.y - projectile.y) <=
            PLAYER_RADIUS + (projectile.radius || 4)
      );

      const expired =
        projectile.age >= projectile.lifetime ||
        projectile.x < 0 ||
        projectile.y < 0 ||
        projectile.x > WORLD_SIZE ||
        projectile.y > WORLD_SIZE;

      if (victim || expired) {
        this.spawnBurst(projectile.x, projectile.y, projectile.color, 9, 85, 18);
        this.fxRoot.remove(projectile.mesh);
        disposeObject(projectile.mesh);
        return false;
      }

      return true;
    });
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
      const triggerRing = effect.group.userData.triggerRing;
      const mineBase = effect.group.userData.mineBase;
      const mineCap = effect.group.userData.mineCap;
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
          edge.material.opacity = 0.92;
        }
      }

      if (ring) {
        const ringScale = energyBoost ? effect.radius * (pulse * 1.18) : effect.radius * pulse;
        ring.scale.set(ringScale, ringScale, ringScale);
        if (effect.type === "mine") {
          ring.material.opacity = now >= (effect.armedAt || Infinity) ? 0.34 : 0.16;
        }
      }

      if (core) {
        core.rotation.y += energyBoost ? 0.05 : 0.02;
        core.position.y = (effect.type === "storm" || effect.type === "storm-pulse" ? 28 : 12) + Math.sin(now * 0.008) * (energyBoost ? 6 : 3);
      }

      if (triggerRing) {
        const armed = now >= (effect.armedAt || 0);
        const pulseScale = effect.triggerRadius * (armed ? pulse * 1.02 : 0.96);
        triggerRing.scale.set(pulseScale, pulseScale, pulseScale);
        triggerRing.material.opacity = armed ? 0.28 + Math.sin(now * 0.012) * 0.06 : 0.12;
        triggerRing.rotation.z += armed ? 0.018 : 0.008;
      }

      if (mineBase) {
        mineBase.rotation.y += 0.03;
      }

      if (mineCap) {
        const armed = now >= (effect.armedAt || 0);
        mineCap.position.y = 13 + Math.sin(now * 0.014) * (armed ? 0.9 : 0.35);
        mineCap.material.emissiveIntensity = armed ? 0.82 : 0.4;
      }

      return true;
    });
  }

  updateMovement(delta, now, localRecord) {
    const keyboardX = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const keyboardY = (this.keys.has("KeyS") ? 1 : 0) - (this.keys.has("KeyW") ? 1 : 0);
    const dirX = clamp(keyboardX + this.mobile.move.x, -1, 1);
    const dirY = clamp(keyboardY + this.mobile.move.y, -1, 1);
    const direction = normalize(dirX, dirY);
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

    if (this.mobile.aim.active) {
      this.localPose.aim = Math.atan2(this.mobile.aim.y, this.mobile.aim.x);
    } else if (this.mouse.inside) {
      const worldMouse = this.screenToWorld(this.mouse.x, this.mouse.y);
      this.localPose.aim = Math.atan2(worldMouse.y - this.localPose.y, worldMouse.x - this.localPose.x);
    }

    this.localPose.x = clamp(this.localPose.x + direction.x * speed * delta, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS);
    this.localPose.y = clamp(this.localPose.y + direction.y * speed * delta, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS);

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

  resolveTempestMineTarget(originPose) {
    if (this.mobile.aim.active) {
      return {
        x: clamp(originPose.x + Math.cos(originPose.aim) * 210, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
        y: clamp(originPose.y + Math.sin(originPose.aim) * 210, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
      };
    }

    if (this.mouse.inside) {
      return this.screenToWorld(this.mouse.x, this.mouse.y);
    }

    return {
      x: clamp(originPose.x + Math.cos(originPose.aim) * 210, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
      y: clamp(originPose.y + Math.sin(originPose.aim) * 210, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS),
    };
  }

  tryPrimary(now, localRecord) {
    const loadout = getLoadout(localRecord.loadoutId || this.selectedLoadoutId);
    const primary = loadout.primary;
    const rateMs = Math.round((localRecord.effects?.overclockUntil || 0) > now ? primary.rate * 760 : primary.rate * 1000);

    if (now < this.localTimers.primaryReadyAt) {
      return;
    }

    this.localTimers.primaryReadyAt = now + rateMs;
    this.audio.play(primary.sfx);
    this.onAction?.({
      kind: "primary",
      pose: { ...this.localPose },
      seq: ++this.actionSeq,
      createdAt: now,
    });

    if (loadout.id === "phantom") {
      const end = {
        x: this.localPose.x + Math.cos(this.localPose.aim) * primary.range,
        y: this.localPose.y + Math.sin(this.localPose.aim) * primary.range,
      };
      this.beams.push(this.createBeamVisual(this.localPose.x, this.localPose.y, end.x, end.y, primary.color, 4, 0.08));
    }
  }

  tryAbility(slot, now, localRecord) {
    const loadout = getLoadout(localRecord.loadoutId || this.selectedLoadoutId);
    const ability = loadout.abilities.find((entry) => entry.slot === slot);
    if (!ability || now < this.localTimers[slot]) {
      return;
    }

    const originPose = { ...this.localPose };
    this.localTimers[slot] = now + ability.cooldown;

    if (`${loadout.id}:${slot}` === "tempest:Q") {
      this.previewDash(190, loadout.theme);
      this.audio.play("dash");
    } else if (`${loadout.id}:${slot}` === "ember:Q") {
      this.previewDash(175, loadout.theme);
      this.audio.play("impact");
    } else if (`${loadout.id}:${slot}` === "volt:Q") {
      this.previewDash(160, loadout.theme);
      this.audio.play("dash");
    } else if (`${loadout.id}:${slot}` === "tempest:E") {
      this.audio.play("mine");
    } else if (`${loadout.id}:${slot}` === "tempest:R") {
      this.audio.play("overclock");
    } else if (`${loadout.id}:${slot}` === "ember:E") {
      this.audio.play("shield");
    } else if (`${loadout.id}:${slot}` === "ember:R") {
      this.audio.play("impact");
    } else if (`${loadout.id}:${slot}` === "phantom:Q") {
      this.audio.play("cloak");
    } else if (`${loadout.id}:${slot}` === "phantom:E") {
      this.audio.play("recon");
    } else if (`${loadout.id}:${slot}` === "phantom:R") {
      this.audio.play("beam");
    } else if (`${loadout.id}:${slot}` === "volt:E") {
      this.audio.play("gravity");
    } else if (`${loadout.id}:${slot}` === "volt:R") {
      this.audio.play("storm");
    }

    this.onAction?.({
      kind: "ability",
      slot,
      pose: originPose,
      ...(loadout.id === "tempest" && slot === "E"
        ? (() => {
            const target = this.resolveTempestMineTarget(originPose);
            return {
              targetX: target.x,
              targetY: target.y,
            };
          })()
        : {}),
      seq: ++this.actionSeq,
      createdAt: now,
    });
  }

  previewDash(distance, color) {
    const fromX = this.localPose.x;
    const fromY = this.localPose.y;
    this.localPose.x = clamp(this.localPose.x + Math.cos(this.localPose.aim) * distance, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS);
    this.localPose.y = clamp(this.localPose.y + Math.sin(this.localPose.aim) * distance, PLAYER_RADIUS, WORLD_SIZE - PLAYER_RADIUS);
    this.beams.push(this.createBeamVisual(fromX, fromY, this.localPose.x, this.localPose.y, color, 8, 0.14));
    this.spawnBurst(this.localPose.x, this.localPose.y, color, 12, 130, 16);
    this.pushPose(Date.now(), true);
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

  getLocalCombatVisual() {
    const localRecord = this.getLocalRecord();
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

  updatePlayerVisuals(now) {
    const players = [
      ...Array.from(this.remotePlayers.values()),
      this.getLocalCombatVisual(),
    ].filter(Boolean);

    const activeIds = new Set();
    players.forEach((player) => {
      activeIds.add(player.id);
      const loadout = getLoadout(player.loadoutId);
      const visual = this.ensurePlayerVisual(player.id, player);
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

      visual.group.position.copy(this.toScenePoint(player.x, player.y, 0));
      visual.group.rotation.y = -player.aim;
      visual.bodyMaterial.color.set(hitFlash ? "#ff8f78" : player.id === this.snapshot.localPlayerId ? "#ffffff" : loadout.theme);
      visual.bodyMaterial.opacity = opacity;
      visual.bodyMaterial.emissive.set(loadout.theme);
      visual.bodyMaterial.emissiveIntensity = player.id === this.snapshot.localPlayerId ? 0.7 : 0.38;
      visual.coreMaterial.opacity = opacity;
      visual.coreMaterial.emissiveIntensity = hitFlash ? 1.4 : player.id === this.snapshot.localPlayerId ? 1.2 : 0.85;
      visual.ring.material.opacity = player.alive === false ? 0.15 : 0.46 + Math.sin(now * 0.008) * 0.06;
      visual.barrier.visible = (player.effects?.barrierUntil || 0) > now;
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
          this.spawnBurst(player.x - Math.cos(player.aim) * 10, player.y - Math.sin(player.aim) * 10 + offset, "#ffb37d", 2, 28, 10);
        }
      } else {
        this.statusTrailAt.delete(`slow:${player.id}`);
      }

      const healthScale = clamp(player.health / loadout.maxHealth, 0, 1);
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
    const center = this.toScenePoint(storm.center.x, storm.center.y, 0);
    this.stormVisual.group.visible = true;
    this.stormVisual.group.position.set(center.x, 0, center.z);
    this.stormVisual.wall.scale.set(storm.radius, 1, storm.radius);
    this.stormVisual.edge.scale.set(storm.radius, storm.radius, storm.radius);
    this.stormVisual.halo.scale.set(storm.radius, storm.radius, storm.radius);
    this.stormVisual.edge.rotation.z += 0.002;
    this.stormVisual.halo.material.opacity = 0.14 + Math.sin(now * 0.006) * 0.04;
  }

  updateWorldDecor(now) {
    this.worldRoot.children.forEach((child) => {
      const { ring, wobble, baseY } = child.userData || {};
      if (ring) {
        ring.rotation.z += 0.004 * wobble;
        ring.position.y = baseY + Math.sin(now * 0.0015 * wobble) * 2;
      }
    });
  }

  updateCamera() {
    const focus = this.toScenePoint(this.camera.x, this.camera.y, CAMERA_LOOK_HEIGHT);
    const desiredPosition = focus.clone().add(new THREE.Vector3(0, CAMERA_HEIGHT, CAMERA_DISTANCE));
    this.camera3D.position.lerp(desiredPosition, 0.12);
    this.camera3D.lookAt(focus.x, focus.y, focus.z);
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
    const alive = Object.values(this.snapshot.players || {}).filter((player) => player.alive !== false).length;
    const healthValue = localRecord ? localRecord.health : loadout.maxHealth;
    const shieldValue = localRecord ? localRecord.shield : loadout.maxShield;
    const storm =
      this.snapshot.meta?.startedAt && this.snapshot.meta?.seed
        ? getStormState(this.snapshot.meta.startedAt, this.snapshot.meta.seed, now)
        : null;
    const leaderboard = Object.values(this.snapshot.players || {}).sort(scoreSort);

    this.ui.healthBar.style.width = `${clamp((healthValue / loadout.maxHealth) * 100, 0, 100)}%`;
    this.ui.shieldBar.style.width = `${clamp((shieldValue / (loadout.maxShield + 36)) * 100, 0, 100)}%`;
    this.ui.healthLabel.textContent = `${Math.ceil(healthValue)} / ${loadout.maxHealth}`;
    this.ui.shieldLabel.textContent = `${Math.ceil(shieldValue)} / ${loadout.maxShield}`;
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
    this.ui.killFeed.innerHTML = this.killFeed.map((entry) => `<p>${escapeHtml(entry.text)}</p>`).join("");

    if (this.ui.scoreboard) {
      this.ui.scoreboard.innerHTML = leaderboard.length
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
    const localRecord = this.getLocalRecord();
    const loadout = getLoadout(localRecord?.loadoutId || this.selectedLoadoutId);

    this.ui.abilityBar.innerHTML = loadout.abilities
      .map((ability) => {
        const readyIn = Math.max(0, (this.localTimers[ability.slot] || 0) - now);
        const cooldownValue = readyIn > 0 ? String(Math.ceil(readyIn / 1000)) : "";
        const iconSvg = renderAbilityIconSvg(ability);
        const hasIcon = Boolean(iconSvg);
        return `
          <button
            type="button"
            class="ability-slot ${readyIn > 0 ? "is-cooling" : ""} ${hasIcon ? "has-icon" : ""}"
            data-ability-slot="${ability.slot}"
            data-ability-name="${escapeHtml(ability.name)}"
            data-ability-detail="${escapeHtml(ability.summary)}"
            tabindex="-1"
          >
            ${hasIcon ? `<span class="ability-slot__icon" style="color: ${escapeHtml(loadout.theme)}">${iconSvg}</span>` : ""}
            <span class="ability-slot__key">${ability.slot}</span>
            <span class="ability-slot__cooldown">${cooldownValue}</span>
          </button>
        `;
      })
      .join("");

    Object.entries(this.ui.mobileAbilityButtons || {}).forEach(([slot, button]) => {
      const ability = loadout.abilities.find((entry) => entry.slot === slot);
      if (!ability) {
        return;
      }
      const readyIn = Math.max(0, (this.localTimers[slot] || 0) - now);
      const label = button.querySelector("[data-mobile-label]");
      const meta = button.querySelector("[data-mobile-meta]");
      const iconSvg = renderAbilityIconSvg(ability);
      button.dataset.abilitySlot = ability.slot;
      button.dataset.abilityName = ability.name;
      button.dataset.abilityDetail = ability.summary;
      if (label) {
        label.innerHTML = iconSvg
          ? `<span class="mobile-action__face"><span class="mobile-action__icon" style="color: ${escapeHtml(
              loadout.theme
            )}">${iconSvg}</span><em>${ability.slot}</em></span>`
          : ability.slot;
      }
      if (meta) {
        meta.textContent = readyIn > 0 ? String(Math.ceil(readyIn / 1000)) : "";
      }
      button.classList.toggle("is-cooling", readyIn > 0);
    });
  }

  render() {
    this.syncRendererSize();
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
    return new THREE.Vector3(x - WORLD_SIZE * 0.5, height, y - WORLD_SIZE * 0.5);
  }

  spawnBurst(x, y, color, count, speed, height = 18) {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * TAU + Math.random() * 0.36;
      const velocity = speed * (0.38 + Math.random() * 0.66);
      const position = this.toScenePoint(x, y, height + Math.random() * 12);
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.8 + Math.random() * 1.8, 8, 8), material);
      mesh.position.copy(position);
      this.fxRoot.add(mesh);

      this.particles.push({
        mesh,
        material,
        x: position.x,
        y: position.y,
        z: position.z,
        life: 0.3 + Math.random() * 0.22,
        maxLife: 0.42,
        vx: Math.cos(angle) * velocity,
        vy: 28 + Math.random() * 58,
        vz: Math.sin(angle) * velocity,
        gravity: 120 + Math.random() * 90,
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
