/**
 * Stride Workout Tracker — 3D Cyberpunk Runner
 * Built with Three.js and Anime.js for fluid kinematics, particle speed fields, and cinematic cameras.
 */

import * as THREE from "../vendor/three.module.js";

export class Runner3D {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    /** @type {HTMLElement|null} */
    this.container = container;
    /** @type {THREE.Scene|null} */
    this.scene = null;
    /** @type {THREE.PerspectiveCamera|null} */
    this.camera = null;
    /** @type {THREE.WebGLRenderer|null} */
    this.renderer = null;
    /** @type {number} */
    this.particleCount = 0;
    this.isRunning = false;
    this.isIntersecting = true;
    this.animationFrameId = null;
    this.clock = new THREE.Clock();

    // Biomechanical speed & cadence parameters
    this.cadence = 165; // Steps per minute (or RPM for cycling)
    this.speed = 11.2; // km/h
    this.timeScale = 1.0;
    this.cameraMode = "follow"; // Default: companion chase view from his back
    this.isMoving = true;
    this.motionWeight = 1.0; // 0.0 = full idle standing pose, 1.0 = full locomotion stride
    this.stridePhase = 0; // Continuously accumulated phase angle
    this.sport = "run"; // "run" or "ride"
    this.isRide = false;
    this.animFrameCount = 0;
    this.lastWidth = 0;
    this.lastHeight = 0;
    // Respect prefers-reduced-motion: skip the CPU-heavy wave field and slow
    // the whole loop instead of rendering full-rate continuous motion.
    this.reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderStride = this.reducedMotion ? 5 : 1;

    this.init();
  }

  init() {
    const container = this.container;
    if (!container) return;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 320;
    this.isMobile =
      width < 600 || (window.innerWidth && window.innerWidth < 600);

    // 1. Scene & Atmospheric Fog
    this.scene = new THREE.Scene();
    const scene = this.scene;
    if (!scene) return;
    scene.fog = new THREE.FogExp2(0x060d0c, 0.035);

    // 2. Camera with responsive mobile framing (wider FOV on phones to fit runner)
    const initialFov = this.isMobile ? 54 : 46;
    this.camera = new THREE.PerspectiveCamera(
      initialFov,
      width / height,
      0.1,
      100,
    );
    this.applyCameraPreset("follow", false);

    // 3. WebGL Renderer (with fallback if high-performance context fails on mobile)
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: !this.isMobile,
        alpha: true,
        powerPreference: this.isMobile ? "default" : "high-performance",
      });
    } catch {
      this.renderer = new THREE.WebGLRenderer({ alpha: true });
    }
    const renderer = this.renderer;
    if (!renderer) return;
    renderer.setSize(width, height);
    // High DPR and realtime shadows can overwhelm mobile GPUs and stall the
    // main thread, which also makes the overlaid controls appear unresponsive.
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.25 : 2),
    );
    renderer.shadowMap.enabled = !this.isMobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Clean any existing canvas
    container.querySelectorAll("canvas").forEach((c) => c.remove());
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");

    // Browsers may discard a WebGL context when a phone is backgrounded or
    // under memory pressure. Restart the loop when the context is restored.
    /** @param {Event} event */
    this.onContextLost = (event) => {
      event.preventDefault();
      this.pause();
    };
    this.onContextRestored = () => {
      this.resize();
      if (!this.manuallyPaused) this.start();
    };
    renderer.domElement.addEventListener(
      "webglcontextlost",
      this.onContextLost,
    );
    renderer.domElement.addEventListener(
      "webglcontextrestored",
      this.onContextRestored,
    );

    // 4. Lighting System
    this.setupLighting();

    // 5. Materials
    this.setupMaterials();

    // 6. Ground Runway & Infinite Grid
    this.setupRunway();

    // 7. Vanta-inspired Dynamic Wave Flow Mesh
    this.setupVantaWaveField();

    // 8. Particle Speed Warp Field
    this.setupSpeedParticles();

    // 9. Cyberpunk Humanoid Runner Rig
    this.setupRunnerModel();

    // 9. Resize Observer
    this.setupResizeObserver();

    // 10. Battery & Thermal Optimization (Pause when off-screen on mobile)
    this.setupVisibilityObserver();
    this.setupPageVisibility();

    // Auto-start rendering loop
    this.start();
  }

  setupLighting() {
    const scene = this.scene;
    if (!scene) return;

    // Ambient fill
    const ambientLight = new THREE.AmbientLight(0x0a1a18, 1.2);
    scene.add(ambientLight);

    // Directional rim/key light
    const dirLight = new THREE.DirectionalLight(0xd0fffa, 1.8);
    dirLight.position.set(5, 12, 7);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Stride Brand Neon Underglow Light
    this.neonPointLight = new THREE.PointLight(0x00f0b5, 3.0, 15);
    this.neonPointLight.position.set(0, 1.2, 0);
    scene.add(this.neonPointLight);

    // Cyan Backlight
    const cyanBackLight = new THREE.PointLight(0x00d9f5, 2.0, 20);
    cyanBackLight.position.set(0, 3, -6);
    scene.add(cyanBackLight);
  }

  setupMaterials() {
    // Cyber Armor Material (Sleek dark obsidian)
    this.armorMat = new THREE.MeshStandardMaterial({
      color: 0x0a1514,
      roughness: 0.25,
      metalness: 0.85,
    });

    // Brand Neon Primary Glow (Teal/Emerald)
    this.neonMat = new THREE.MeshBasicMaterial({
      color: 0x00f0b5,
    });

    // Emissive Glowing Joints
    this.jointMat = new THREE.MeshStandardMaterial({
      color: 0x00f0b5,
      emissive: 0x00f0b5,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.5,
    });

    // Accent Visor Glow
    this.visorMat = new THREE.MeshBasicMaterial({
      color: 0x00f0b5,
    });

    // Accent Secondary Glow (Cyan)
    this.cyanGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00d9f5,
    });
  }

  setupRunway() {
    const scene = this.scene;
    if (!scene) return;

    this.runwayGroup = new THREE.Group();

    // Base runway floor
    const floorGeo = new THREE.PlaneGeometry(12, 80);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x040807,
      roughness: 0.6,
      metalness: 0.8,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    this.runwayGroup.add(floor);

    // Lateral Glowing Edge Rails
    const railGeo = new THREE.BoxGeometry(0.08, 0.08, 80);
    const leftRail = new THREE.Mesh(railGeo, this.neonMat);
    leftRail.position.set(-2.8, 0.04, 0);
    const rightRail = new THREE.Mesh(railGeo, this.neonMat);
    rightRail.position.set(2.8, 0.04, 0);
    this.runwayGroup.add(leftRail);
    this.runwayGroup.add(rightRail);

    // Dynamic Moving Cross-Grid Bars
    /** @type {THREE.Mesh[]} */
    this.gridBars = [];
    const barGeo = new THREE.BoxGeometry(5.4, 0.02, 0.08);
    const barMat = new THREE.MeshBasicMaterial({
      color: 0x0b2e28,
      transparent: true,
      opacity: 0.8,
    });

    const barCount = 36;
    const spacing = 2.2;
    for (let i = 0; i < barCount; i++) {
      const bar = new THREE.Mesh(barGeo, i % 4 === 0 ? this.neonMat : barMat);
      bar.position.set(0, 0.01, (i - barCount / 2) * spacing);
      this.runwayGroup.add(bar);
      this.gridBars.push(bar);
    }

    scene.add(this.runwayGroup);
  }

  setupVantaWaveField() {
    const scene = this.scene;
    if (!scene) return;

    // Dynamic Vanta WAVES-inspired mesh terrain surrounding the track
    const width = 42;
    const depth = 70;
    // Mobile adaptive grid density (24x24 on phones for 60 FPS, 42x42 on desktop)
    const segmentsX = this.isMobile ? 24 : 42;
    const segmentsY = this.isMobile ? 24 : 42;

    const waveGeo = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsY);
    waveGeo.rotateX(-Math.PI / 2);

    // Save initial coordinates for smooth undulating fluid wave displacement
    this.waveOrigPositions = new Float32Array(
      waveGeo.attributes.position.array,
    );

    // Dual aesthetic: dark midnight teal wireframe with glowing cyber-emissive reflections
    const waveMat = new THREE.MeshStandardMaterial({
      color: 0x021714,
      emissive: 0x004537,
      roughness: 0.35,
      metalness: 0.9,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });

    this.vantaWaveMesh = new THREE.Mesh(waveGeo, waveMat);
    this.vantaWaveMesh.position.set(0, -0.42, 0);
    scene.add(this.vantaWaveMesh);
  }

  setupSpeedParticles() {
    const scene = this.scene;
    if (!scene) return;

    // Mobile adaptive particle budget (140 on phones, 280 on desktop)
    this.particleCount = this.isMobile ? 140 : 280;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const velocities = new Float32Array(this.particleCount);

    for (let i = 0; i < this.particleCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = Math.random() * 6 + 0.1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
      velocities[i] = 12 + Math.random() * 16;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    /** @type {Float32Array} */
    this.particleVelocities = velocities;

    const particleMat = new THREE.PointsMaterial({
      color: 0x00f0b5,
      size: 0.08,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, particleMat);
    scene.add(this.particles);
  }

  setupRunnerModel() {
    const scene = this.scene;
    if (!scene) return;

    // Root anchor for entire humanoid
    /** @type {THREE.Group} */
    this.runnerRoot = new THREE.Group();
    this.runnerRoot.position.set(0, 1.25, 0);

    // ==========================================
    // Pelvis / Core Anchor
    // ==========================================
    const pelvisGeo = new THREE.CylinderGeometry(0.24, 0.18, 0.22, 12);
    this.pelvis = new THREE.Mesh(pelvisGeo, this.armorMat);
    this.pelvis.castShadow = true;
    this.runnerRoot.add(this.pelvis);

    // ==========================================
    // Torso / Spine / Chest
    // ==========================================
    /** @type {THREE.Group} */
    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.18, 0);

    // Lower spine
    const spineGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.3, 10);
    const spine = new THREE.Mesh(spineGeo, this.armorMat);
    spine.position.y = 0.15;
    this.torso.add(spine);

    // Upper Chest plate
    const chestGeo = new THREE.BoxGeometry(0.55, 0.38, 0.32);
    const chest = new THREE.Mesh(chestGeo, this.armorMat);
    chest.position.y = 0.42;
    chest.castShadow = true;
    this.torso.add(chest);

    // Glowing Chest Core Reactor (Stride Brand Emblem)
    const coreGeo = new THREE.SphereGeometry(0.09, 16, 16);
    const core = new THREE.Mesh(coreGeo, this.jointMat);
    core.position.set(0, 0.44, 0.17);
    this.torso.add(core);

    // ==========================================
    // Neck & Aerodynamic Helmet
    // ==========================================
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 0.12, 8),
      this.armorMat,
    );
    neck.position.y = 0.65;
    this.torso.add(neck);

    /** @type {THREE.Group} */
    this.head = new THREE.Group();
    this.head.position.set(0, 0.82, 0);

    // Sleek helmet shell
    const helmetGeo = new THREE.SphereGeometry(0.19, 16, 16);
    helmetGeo.scale(0.9, 1.15, 1.25);
    const helmet = new THREE.Mesh(helmetGeo, this.armorMat);
    this.head.add(helmet);

    // Curved neon visor slit
    const visorGeo = new THREE.BoxGeometry(0.26, 0.05, 0.12);
    const visor = new THREE.Mesh(visorGeo, this.visorMat);
    visor.position.set(0, 0.02, 0.18);
    this.head.add(visor);

    this.torso.add(this.head);

    // ==========================================
    // Arms (Shoulders -> Elbows -> Forearms)
    // ==========================================
    /** @type {THREE.Group & { elbow: THREE.Group }} */
    this.leftArm = this.createArm(-1); // Left
    this.leftArm.position.set(-0.35, 0.54, 0);
    this.torso.add(this.leftArm);

    /** @type {THREE.Group & { elbow: THREE.Group }} */
    this.rightArm = this.createArm(1); // Right
    this.rightArm.position.set(0.35, 0.54, 0);
    this.torso.add(this.rightArm);

    this.runnerRoot.add(this.torso);

    // ==========================================
    // Legs (Hips -> Knees -> Shins -> Feet)
    // ==========================================
    /** @type {THREE.Group & { knee: THREE.Group, foot: THREE.Mesh }} */
    this.leftLeg = this.createLeg();
    this.leftLeg.position.set(-0.2, -0.05, 0);
    this.runnerRoot.add(this.leftLeg);

    /** @type {THREE.Group & { knee: THREE.Group, foot: THREE.Mesh }} */
    this.rightLeg = this.createLeg();
    this.rightLeg.position.set(0.2, -0.05, 0);
    this.runnerRoot.add(this.rightLeg);

    scene.add(this.runnerRoot);
  }

  /** @param {-1|1} side @returns {THREE.Group & { elbow: THREE.Group}} */
  createArm(side) {
    /** @type {THREE.Group & { elbow?: THREE.Group }} */
    const shoulderGroup = new THREE.Group();

    // Shoulder joint ball
    const shoulderBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 12),
      this.jointMat,
    );
    shoulderGroup.add(shoulderBall);

    // Upper Arm
    const upperArmGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.36, 8);
    const upperArm = new THREE.Mesh(upperArmGeo, this.armorMat);
    upperArm.position.set(side * 0.04, -0.18, 0);
    shoulderGroup.add(upperArm);

    // Elbow Pivot
    const elbowGroup = new THREE.Group();
    elbowGroup.position.set(side * 0.04, -0.36, 0);

    const elbowBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 10),
      this.jointMat,
    );
    elbowGroup.add(elbowBall);

    // Forearm (bent in dynamic running posture)
    const forearmGeo = new THREE.CylinderGeometry(0.055, 0.045, 0.34, 8);
    const forearm = new THREE.Mesh(forearmGeo, this.armorMat);
    forearm.position.set(0, -0.17, 0);
    elbowGroup.add(forearm);

    // Hand Fist
    const handGeo = new THREE.BoxGeometry(0.07, 0.09, 0.07);
    const hand = new THREE.Mesh(handGeo, this.neonMat);
    hand.position.set(0, -0.34, 0);
    elbowGroup.add(hand);

    // Preset natural runner elbow flexion (~80 degrees forward)
    elbowGroup.rotation.x = -1.45;

    shoulderGroup.add(elbowGroup);
    shoulderGroup.elbow = elbowGroup;

    return /** @type {THREE.Group & { elbow: THREE.Group }} */ (shoulderGroup);
  }

  /** @returns {THREE.Group & { knee: THREE.Group, foot: THREE.Mesh }} */
  createLeg() {
    /** @type {THREE.Group & { knee?: THREE.Group, foot?: THREE.Mesh }} */
    const hipGroup = new THREE.Group();

    // Hip joint
    const hipBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 12),
      this.jointMat,
    );
    hipGroup.add(hipBall);

    // Thigh
    const thighGeo = new THREE.CylinderGeometry(0.095, 0.075, 0.52, 10);
    const thigh = new THREE.Mesh(thighGeo, this.armorMat);
    thigh.position.set(0, -0.26, 0);
    thigh.castShadow = true;
    hipGroup.add(thigh);

    // Knee Pivot
    const kneeGroup = new THREE.Group();
    kneeGroup.position.set(0, -0.52, 0);

    const kneeBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 12, 12),
      this.jointMat,
    );
    kneeGroup.add(kneeBall);

    // Shin
    const shinGeo = new THREE.CylinderGeometry(0.075, 0.055, 0.52, 10);
    const shin = new THREE.Mesh(shinGeo, this.armorMat);
    shin.position.set(0, -0.26, 0);
    shin.castShadow = true;
    kneeGroup.add(shin);

    // Foot / Running Shoe
    const footGeo = new THREE.BoxGeometry(0.1, 0.08, 0.28);
    const foot = new THREE.Mesh(footGeo, this.armorMat);
    foot.position.set(0, -0.52, 0.06);

    // Glowing shoe sole
    const soleGeo = new THREE.BoxGeometry(0.11, 0.02, 0.29);
    const sole = new THREE.Mesh(soleGeo, this.neonMat);
    sole.position.set(0, -0.57, 0.06);
    kneeGroup.add(foot);
    kneeGroup.add(sole);

    hipGroup.add(kneeGroup);
    hipGroup.knee = kneeGroup;
    hipGroup.foot = foot;

    return /** @type {THREE.Group & { knee: THREE.Group, foot: THREE.Mesh }} */ (
      hipGroup
    );
  }

  resize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width > 0 && height > 0) {
      if (this.lastWidth === width && this.lastHeight === height) return;
      this.lastWidth = width;
      this.lastHeight = height;
      this.isMobile =
        width < 600 || (window.innerWidth && window.innerWidth < 600);
      this.camera.aspect = width / height;
      // Dynamically adjust FOV on mobile so runner stays comfortably framed
      this.camera.fov = this.isMobile ? 54 : 46;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.25 : 2),
      );
      this.renderer.shadowMap.enabled = !this.isMobile;
    }
  }

  setupResizeObserver() {
    const container = this.container;
    if (!container) return;
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(container);
  }

  setupVisibilityObserver() {
    const container = this.container;
    if (!("IntersectionObserver" in window) || !container) return;
    this.visibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          this.isIntersecting = entry.isIntersecting;
          if (entry.isIntersecting) {
            if (!this.isRunning && !this.manuallyPaused) {
              this.start();
            }
          } else {
            if (this.isRunning) {
              this.pause();
            }
          }
        }
      },
      { threshold: 0.1 },
    );
    this.visibilityObserver.observe(container);
  }

  setupPageVisibility() {
    this.onPageVisibilityChange = () => {
      if (document.hidden) {
        if (this.isRunning) this.pause();
      } else if (!this.manuallyPaused && this.isIntersecting) {
        this.start();
      }
    };
    document.addEventListener("visibilitychange", this.onPageVisibilityChange);
  }

  /** @param {string} mode @param {boolean} [animated] */
  applyCameraPreset(mode, animated = true) {
    const camera = this.camera;
    if (!camera) return;
    this.cameraMode = mode;
    let target;
    let lookTarget;

    if (mode === "side") {
      target = { x: 5.2, y: 1.35, z: 0.1 };
      lookTarget = { x: 0, y: 1.25, z: 0 };
    } else if (mode === "perspective") {
      target = { x: 3.8, y: 1.8, z: 4.8 };
      lookTarget = { x: 0, y: 1.25, z: 0 };
    } else {
      // Follow / Chase Companion (Elevated view from behind the runner)
      target = { x: 0, y: 3.1, z: -4.8 };
      lookTarget = { x: 0, y: 1.15, z: 2.0 };
    }

    if (animated && window.anime) {
      if (
        this.activeCameraAnim &&
        typeof this.activeCameraAnim.pause === "function"
      ) {
        this.activeCameraAnim.pause();
      }
      this.activeCameraAnim = window.anime({
        targets: camera.position,
        x: target.x,
        y: target.y,
        z: target.z,
        duration: 800,
        easing: "easeOutCubic",
        update: () => {
          camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
        },
      });
    } else {
      camera.position.set(target.x, target.y, target.z);
      camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
    }
  }

  /** @param {string} sport */
  setSport(sport) {
    this.sport = sport === "ride" ? "ride" : "run";
    this.isRide = this.sport === "ride";
  }

  /** @param {number} spm */
  setCadence(spm) {
    const val = Number(spm);
    this.cadence = Math.max(0, Math.min(240, isNaN(val) ? 0 : Math.round(val)));
  }

  /** @param {number} kmh */
  setSpeed(kmh) {
    const val = Number(kmh);
    this.speed = Math.max(
      0,
      Math.min(75, isNaN(val) ? 0 : Number(val.toFixed(1))),
    );
    this.isMoving = this.speed >= 0.8;
  }

  /** @param {boolean} isMoving */
  setMoving(isMoving) {
    this.isMoving = Boolean(isMoving);
    if (!this.isMoving) {
      this.speed = 0;
      this.cadence = 0;
    }
  }

  /** @param {number} delta */
  updateAnimation(delta) {
    const { runnerRoot, torso, head, leftLeg, rightLeg, leftArm, rightArm } =
      this;
    if (
      !runnerRoot ||
      !torso ||
      !head ||
      !leftLeg ||
      !rightLeg ||
      !leftArm ||
      !rightArm
    ) {
      return;
    }
    // 0. Smooth blend between stopped idle (0.0) and active locomotion (1.0)
    const targetMotion = this.isMoving && this.speed >= 0.8 ? 1.0 : 0.0;
    const blendRate = targetMotion > this.motionWeight ? 4.5 : 3.0;
    this.motionWeight +=
      (targetMotion - this.motionWeight) * Math.min(1.0, delta * blendRate);

    // Dynamic stride / pedal frequency (rad/s)
    const effectiveCadence =
      this.cadence > 0 ? this.cadence : this.isRide ? 80 : 160;
    const strideFreq = (effectiveCadence / 60) * Math.PI; // rad/s
    this.stridePhase += strideFreq * delta * this.timeScale * this.motionWeight;
    const cycle = this.stridePhase;
    const elapsed = this.clock.getElapsedTime();
    const breath = Math.sin(elapsed * 1.8);

    // 1. Pelvis & Torso Posture
    const isRide = this.isRide;
    const runBounce = isRide
      ? (1 - Math.cos(cycle * 2)) * 0.015
      : (1 - Math.cos(cycle * 2)) * 0.055;
    const runPosY = isRide ? 1.15 + runBounce : 1.2 + runBounce;
    const idlePosY = 1.18 + breath * 0.008;
    runnerRoot.position.y = idlePosY + (runPosY - idlePosY) * this.motionWeight;

    const runRotY = isRide ? Math.sin(cycle) * 0.03 : Math.sin(cycle) * 0.08;
    const runRotZ = isRide ? Math.sin(cycle) * 0.02 : Math.sin(cycle) * 0.035;
    runnerRoot.rotation.y = runRotY * this.motionWeight;
    runnerRoot.rotation.z = runRotZ * this.motionWeight;

    const runTorsoX = isRide
      ? 0.36 + Math.sin(cycle * 2) * 0.015 // Aerodynamic cycling tuck
      : 0.2 + Math.sin(cycle * 2) * 0.02; // Forward athletic run lean
    const idleTorsoX = 0.04 + breath * 0.012;
    torso.rotation.x =
      idleTorsoX + (runTorsoX - idleTorsoX) * this.motionWeight;

    const runTorsoY = isRide
      ? -Math.sin(cycle) * 0.03
      : -Math.sin(cycle) * 0.09;
    torso.rotation.y = runTorsoY * this.motionWeight;

    const runHeadX = isRide
      ? -0.22 - Math.sin(cycle * 2) * 0.01 // Head lifted to look ahead over bike
      : -0.12 - Math.sin(cycle * 2) * 0.015;
    const idleHeadX = -0.02;
    head.rotation.x = idleHeadX + (runHeadX - idleHeadX) * this.motionWeight;

    // 2. Leg Kinematics (Running stride vs Cycling pedal revolution)
    /** @param {THREE.Group & { knee: THREE.Group }} legGroup @param {number} phase */
    const animateLeg = (legGroup, phase) => {
      const phi = (cycle + phase) % (Math.PI * 2);
      let runHipRot;
      let runKneeRot;

      if (isRide) {
        // Cycling circular pedal stroke kinematics:
        runHipRot = -Math.cos(phi) * 0.42;
        runKneeRot = 0.65 + Math.sin(phi) * 0.55;
      } else {
        // Running stride kinematics:
        runHipRot = -Math.cos(phi) * 0.65;
        if (phi >= Math.PI) {
          const swingProgress = (phi - Math.PI) / Math.PI;
          runKneeRot = 0.12 + Math.sin(swingProgress * Math.PI) * 1.42;
        } else {
          runKneeRot = 0.12 + Math.sin(phi) * 0.22;
        }
      }

      // Idle standing leg: straight vertical with slight natural knee cushion
      const idleHipRot = 0;
      const idleKneeRot = 0.05;

      legGroup.rotation.x =
        idleHipRot + (runHipRot - idleHipRot) * this.motionWeight;
      legGroup.knee.rotation.x =
        idleKneeRot + (runKneeRot - idleKneeRot) * this.motionWeight;
    };

    animateLeg(leftLeg, 0);
    animateLeg(rightLeg, Math.PI);

    // 3. Arm Kinematics (Counter-oscillation for running, handlebar reach for cycling)
    /** @param {THREE.Group & { elbow: THREE.Group }} armGroup @param {number} phase */
    const animateArm = (armGroup, phase) => {
      const phi = (cycle + phase) % (Math.PI * 2);
      let runArmX;
      let runElbowX;

      if (isRide) {
        // Cycling: arms reach forward gripping virtual handlebars with subtle cadence sway
        runArmX = -0.42 + Math.sin(phi) * 0.04;
        runElbowX = -1.1 + Math.cos(phi) * 0.05;
      } else {
        // Running: natural reciprocal arm swing in opposition to hip
        runArmX = Math.cos(phi) * 0.58;
        runElbowX = -1.35 + Math.sin(phi) * 0.2;
      }

      // Idle standing arm: relaxed at side with gentle breathing motion
      const idleArmX = 0.06 + breath * 0.02;
      const idleElbowX = -0.28;

      armGroup.rotation.x = idleArmX + (runArmX - idleArmX) * this.motionWeight;
      armGroup.elbow.rotation.x =
        idleElbowX + (runElbowX - idleElbowX) * this.motionWeight;
    };

    animateArm(leftArm, 0);
    animateArm(rightArm, Math.PI);

    // 4. Infinite Runway Scrolling (Ground moving backwards under athlete towards -Z)
    const scrollSpeed = (this.speed / 3.6) * delta * 2.2 * this.motionWeight;
    const barSpacing = 2.2;
    const barLimit = (this.gridBars.length / 2) * barSpacing;

    this.gridBars.forEach((bar) => {
      bar.position.z -= scrollSpeed;
      if (bar.position.z < -barLimit) {
        bar.position.z += barLimit * 2;
      }
    });

    // 5. Particle Speed Warp Field (Particles rushing past towards -Z)
    if (this.particles) {
      const positions = this.particles.geometry.attributes.position;
      const activeParticleSpeed = (this.speed / 3.6) * delta * 4.5;
      const ambientParticleSpeed = delta * 0.35;
      const particleSpeed =
        ambientParticleSpeed +
        (activeParticleSpeed - ambientParticleSpeed) * this.motionWeight;

      for (let i = 0; i < this.particleCount; i++) {
        const nextZ =
          positions.getZ(i) -
          (this.particleVelocities[i] || 0) * particleSpeed * 0.1;
        if (nextZ < -35) {
          positions.setZ(i, 20);
          positions.setX(i, (Math.random() - 0.5) * 14);
          positions.setY(i, Math.random() * 6 + 0.1);
        } else {
          positions.setZ(i, nextZ);
        }
      }
      positions.needsUpdate = true;
    }

    // 6. Neon Underglow Pulse
    if (this.neonPointLight) {
      const runGlow = 2.6 + Math.sin(cycle * 2) * 0.8;
      const idleGlow = 2.0 + breath * 0.4;
      this.neonPointLight.intensity =
        idleGlow + (runGlow - idleGlow) * this.motionWeight;
    }

    // 7. Dynamic Camera Follow
    if (this.cameraMode === "follow" && this.camera) {
      const runCamX = Math.sin(cycle) * 0.08;
      const runCamY = 3.1 + runBounce * 0.35;
      this.camera.position.x = runCamX * this.motionWeight;
      this.camera.position.y = 3.1 + (runCamY - 3.1) * this.motionWeight;
      this.camera.position.z = -4.8;
    }

    // 8. Vanta Wave Field Dynamic Undulation
    if (this.vantaWaveMesh && this.waveOrigPositions) {
      // Throttle wave vertex recalculations on mobile or during idle to save CPU/GPU bandwidth
      const shouldUpdateWave =
        !this.reducedMotion &&
        (!this.isMobile || this.animFrameCount % 2 === 0);
      if (shouldUpdateWave) {
        const positions = this.vantaWaveMesh.geometry.attributes.position;
        const orig = this.waveOrigPositions;
        const waveT = elapsed * 0.3 + this.stridePhase * 0.4;

        const count = positions.count;
        for (let i = 0; i < count; i++) {
          const x = orig[i * 3 + 0];
          const z = orig[i * 3 + 2];

          // Attenuate wave displacement in center so runway remains flush and clean
          const distFromCenter = Math.abs(x);
          const waveWeight = Math.min(
            1.0,
            Math.max(0.12, (distFromCenter - 2.6) / 5.5),
          );

          // Multi-frequency compound trigonometric waves flowing towards -Z
          const wave1 = Math.sin(x * 0.35 + waveT * 1.5);
          const wave2 = Math.cos(z * 0.22 + waveT * 2.0);
          const wave3 = Math.sin((x + z) * 0.26 + waveT * 0.85);

          positions.setY(
            i,
            orig[i * 3 + 1] +
              (wave1 * 0.42 + wave2 * 0.38 + wave3 * 0.28) * waveWeight,
          );
        }
        positions.needsUpdate = true;
      }
    }
  }

  render() {
    if (!this.isRunning) return;
    if (!this.camera || !this.renderer || !this.scene) return;

    this.animFrameCount = (this.animFrameCount + 1) | 0;
    // Reduced motion: keep the canvas live but update only every few frames
    // so the scene does not continuously sprint at display refresh rate.
    if (this.animFrameCount % this.renderStride !== 0) {
      this.animationFrameId = requestAnimationFrame(() => this.render());
      return;
    }
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.updateAnimation(delta);

    if (this.cameraMode === "follow") {
      this.camera.lookAt(0, 1.15, 2.0);
    } else {
      this.camera.lookAt(0, 1.25, 0);
    }

    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(() => this.render());
  }

  start(resetManual = false) {
    if (resetManual) {
      this.manuallyPaused = false;
    }
    this.resize();
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    this.render();
  }

  pause(isManual = false) {
    if (isManual) {
      this.manuallyPaused = true;
    }
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  destroy() {
    this.pause(true);
    if (this.clock) {
      try {
        this.clock.stop();
      } catch (err) {
        console.warn("Error stopping runner animation clock:", err);
      }
    }
    if (
      this.activeCameraAnim &&
      typeof this.activeCameraAnim.pause === "function"
    ) {
      this.activeCameraAnim.pause();
      this.activeCameraAnim = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
      this.visibilityObserver = null;
    }
    if (this.onPageVisibilityChange) {
      document.removeEventListener(
        "visibilitychange",
        this.onPageVisibilityChange,
      );
      this.onPageVisibilityChange = null;
    }
    if (this.scene) {
      const disposedMats = new Set();
      this.scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            if (m && !disposedMats.has(m)) {
              disposedMats.add(m);
              m.dispose();
            }
          });
        } else if (!disposedMats.has(obj.material)) {
          disposedMats.add(obj.material);
          obj.material.dispose();
        }
      });
      disposedMats.clear();
      this.scene = null;
    }
    if (this.renderer && this.renderer.domElement) {
      if (this.onContextLost) {
        this.renderer.domElement.removeEventListener(
          "webglcontextlost",
          this.onContextLost,
        );
      }
      if (this.onContextRestored) {
        this.renderer.domElement.removeEventListener(
          "webglcontextrestored",
          this.onContextRestored,
        );
      }
      this.renderer.domElement.remove();
      this.renderer.dispose();
      this.renderer = null;
    }
    this.camera = null;
    this.container = null;
  }
}
