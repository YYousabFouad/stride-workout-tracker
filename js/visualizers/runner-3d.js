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
    this.container = container;
    this.isRunning = false;
    this.animationFrameId = null;
    this.clock = new THREE.Clock();

    // Biomechanical speed & cadence parameters
    this.cadence = 165; // Steps per minute
    this.speed = 11.2; // km/h
    this.timeScale = 1.0;
    this.cameraMode = "follow"; // Default: companion chase view from his back

    this.init();
  }

  init() {
    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 320;
    this.isMobile = width < 600 || (window.innerWidth && window.innerWidth < 600);

    // 1. Scene & Atmospheric Fog
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x060d0c, 0.035);

    // 2. Camera with responsive mobile framing (wider FOV on phones to fit runner)
    const initialFov = this.isMobile ? 54 : 46;
    this.camera = new THREE.PerspectiveCamera(
      initialFov,
      width / height,
      0.1,
      100
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
    this.renderer.setSize(width, height);
    // High DPR and realtime shadows can overwhelm mobile GPUs and stall the
    // main thread, which also makes the overlaid controls appear unresponsive.
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.25 : 2)
    );
    this.renderer.shadowMap.enabled = !this.isMobile;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Clean any existing canvas
    this.container.querySelectorAll("canvas").forEach((c) => c.remove());
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-hidden", "true");

    // Browsers may discard a WebGL context when a phone is backgrounded or
    // under memory pressure. Restart the loop when the context is restored.
    this.onContextLost = (event) => {
      event.preventDefault();
      this.pause();
    };
    this.onContextRestored = () => {
      this.resize();
      if (!this.manuallyPaused) this.start();
    };
    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.addEventListener("webglcontextrestored", this.onContextRestored);

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
    // Ambient fill
    const ambientLight = new THREE.AmbientLight(0x0a1a18, 1.2);
    this.scene.add(ambientLight);

    // Directional rim/key light
    const dirLight = new THREE.DirectionalLight(0xd0fffa, 1.8);
    dirLight.position.set(5, 12, 7);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    this.scene.add(dirLight);

    // Stride Brand Neon Underglow Light
    this.neonPointLight = new THREE.PointLight(0x00f0b5, 3.0, 15);
    this.neonPointLight.position.set(0, 1.2, 0);
    this.scene.add(this.neonPointLight);

    // Cyan Backlight
    const cyanBackLight = new THREE.PointLight(0x00d9f5, 2.0, 20);
    cyanBackLight.position.set(0, 3, -6);
    this.scene.add(cyanBackLight);
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

    this.scene.add(this.runwayGroup);
  }

  setupVantaWaveField() {
    // Dynamic Vanta WAVES-inspired mesh terrain surrounding the track
    const width = 42;
    const depth = 70;
    // Mobile adaptive grid density (24x24 on phones for 60 FPS, 42x42 on desktop)
    const segmentsX = this.isMobile ? 24 : 42;
    const segmentsY = this.isMobile ? 24 : 42;

    const waveGeo = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsY);
    waveGeo.rotateX(-Math.PI / 2);

    // Save initial coordinates for smooth undulating fluid wave displacement
    this.waveOrigPositions = new Float32Array(waveGeo.attributes.position.array);

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
    this.scene.add(this.vantaWaveMesh);
  }

  setupSpeedParticles() {
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
    this.particleVelocities = velocities;

    const particleMat = new THREE.PointsMaterial({
      color: 0x00f0b5,
      size: 0.08,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, particleMat);
    this.scene.add(this.particles);
  }

  setupRunnerModel() {
    // Root anchor for entire humanoid
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
      this.armorMat
    );
    neck.position.y = 0.65;
    this.torso.add(neck);

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
    this.leftArm = this.createArm(-1); // Left
    this.leftArm.position.set(-0.35, 0.54, 0);
    this.torso.add(this.leftArm);

    this.rightArm = this.createArm(1); // Right
    this.rightArm.position.set(0.35, 0.54, 0);
    this.torso.add(this.rightArm);

    this.runnerRoot.add(this.torso);

    // ==========================================
    // Legs (Hips -> Knees -> Shins -> Feet)
    // ==========================================
    this.leftLeg = this.createLeg(-1);
    this.leftLeg.position.set(-0.2, -0.05, 0);
    this.runnerRoot.add(this.leftLeg);

    this.rightLeg = this.createLeg(1);
    this.rightLeg.position.set(0.2, -0.05, 0);
    this.runnerRoot.add(this.rightLeg);

    this.scene.add(this.runnerRoot);
  }

  createArm(side) {
    const shoulderGroup = new THREE.Group();

    // Shoulder joint ball
    const shoulderBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 12),
      this.jointMat
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
      this.jointMat
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

    return shoulderGroup;
  }

  createLeg(side) {
    const hipGroup = new THREE.Group();

    // Hip joint
    const hipBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 12),
      this.jointMat
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
      this.jointMat
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

    return hipGroup;
  }

  resize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width > 0 && height > 0) {
      this.isMobile = width < 600 || (window.innerWidth && window.innerWidth < 600);
      this.camera.aspect = width / height;
      // Dynamically adjust FOV on mobile so runner stays comfortably framed
      this.camera.fov = this.isMobile ? 54 : 46;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.25 : 2)
      );
      this.renderer.shadowMap.enabled = !this.isMobile;
    }
  }

  setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.container);
  }

  setupVisibilityObserver() {
    if (!("IntersectionObserver" in window)) return;
    this.visibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
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
      { threshold: 0.1 }
    );
    this.visibilityObserver.observe(this.container);
  }

  setupPageVisibility() {
    this.onPageVisibilityChange = () => {
      if (document.hidden) {
        if (this.isRunning) this.pause();
      } else if (!this.manuallyPaused) {
        this.start();
      }
    };
    document.addEventListener("visibilitychange", this.onPageVisibilityChange);
  }

  applyCameraPreset(mode, animated = true) {
    this.cameraMode = mode;
    let target = { x: 3.8, y: 1.8, z: 4.8 };
    let lookTarget = { x: 0, y: 1.25, z: 0 };

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
      if (this.activeCameraAnim && typeof this.activeCameraAnim.pause === "function") {
        this.activeCameraAnim.pause();
      }
      this.activeCameraAnim = window.anime({
        targets: this.camera.position,
        x: target.x,
        y: target.y,
        z: target.z,
        duration: 800,
        easing: "easeOutCubic",
        update: () => {
          if (this.camera) {
            this.camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
          }
        },
      });
    } else {
      this.camera.position.set(target.x, target.y, target.z);
      this.camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
    }
  }

  setCadence(spm) {
    this.cadence = Math.max(120, Math.min(210, spm));
  }

  setSpeed(kmh) {
    this.speed = Math.max(4, Math.min(25, kmh));
  }

  updateAnimation(delta) {
    const strideFreq = (this.cadence / 60) * Math.PI; // rad/s
    const elapsed = this.clock.getElapsedTime();
    const cycle = elapsed * strideFreq * this.timeScale;

    // 1. Pelvis Vertical Bounce & Aerodynamic Running Posture
    // Natural stride has two vertical bounces per full cycle (one bounce per foot plant)
    const bounce = (1 - Math.cos(cycle * 2)) * 0.055;
    this.runnerRoot.position.y = 1.20 + bounce;

    // Pelvic torque & sway in counter-motion to stride
    this.runnerRoot.rotation.y = Math.sin(cycle) * 0.08;
    this.runnerRoot.rotation.z = Math.sin(cycle) * 0.035;

    // Torso counter-twist & forward athletic lean (+X tilts upper body forward towards +Z)
    this.torso.rotation.y = -Math.sin(cycle) * 0.09;
    this.torso.rotation.x = 0.20 + Math.sin(cycle * 2) * 0.02;

    // Head stabilized looking forward along horizon
    this.head.rotation.x = -0.12 - Math.sin(cycle * 2) * 0.015;

    // 2. Leg Kinematics (True Anatomical Human Stride Cycle)
    const runLeg = (legGroup, phase) => {
      // Stride phase in [0, 2*PI)
      const phi = (cycle + phase) % (Math.PI * 2);

      // Hip pitch: drives foot from front (+Z, negative X rot) to back (-Z, positive X rot) during stance
      const hipRot = -Math.cos(phi) * 0.65;
      legGroup.rotation.x = hipRot;

      // Knee flexion:
      // Stance (0 -> PI): foot on ground carrying body weight, slight spring shock-absorption
      // Swing (PI -> 2*PI): foot drives back and up, knee flexes high towards glutes (-Z),
      // then rapidly unfolds as thigh swings forward to plant
      let kneeRot = 0.12;
      if (phi >= Math.PI) {
        const swingProgress = (phi - Math.PI) / Math.PI; // 0 -> 1
        kneeRot = 0.12 + Math.sin(swingProgress * Math.PI) * 1.42;
      } else {
        kneeRot = 0.12 + Math.sin(phi) * 0.22;
      }
      legGroup.knee.rotation.x = kneeRot;
    };

    runLeg(this.leftLeg, 0);
    runLeg(this.rightLeg, Math.PI); // 180 degrees offset

    // 3. Arm Kinematics (Natural Counter-Oscillation to Legs)
    const runArm = (armGroup, phase) => {
      const phi = (cycle + phase) % (Math.PI * 2);

      // Arm swings in opposition to hip: when leg reaches forward, arm drives back
      const armHipOpposition = Math.cos(phi) * 0.58;
      armGroup.rotation.x = armHipOpposition;

      // Athletic elbow bend with dynamic flexion
      armGroup.elbow.rotation.x = -1.35 + Math.sin(phi) * 0.2;
    };

    runArm(this.leftArm, 0);
    runArm(this.rightArm, Math.PI);

    // 4. Infinite Runway Scrolling (Ground moving backwards under runner's feet towards -Z)
    const scrollSpeed = (this.speed / 3.6) * delta * 2.2;
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
      const pos = this.particles.geometry.attributes.position.array;
      const particleSpeed = (this.speed / 3.6) * delta * 4.5;

      for (let i = 0; i < this.particleCount; i++) {
        pos[i * 3 + 2] -= this.particleVelocities[i] * particleSpeed * 0.1;
        if (pos[i * 3 + 2] < -35) {
          pos[i * 3 + 2] = 20;
          pos[i * 3 + 0] = (Math.random() - 0.5) * 14;
          pos[i * 3 + 1] = Math.random() * 6 + 0.1;
        }
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    // 6. Neon Underglow Pulse
    if (this.neonPointLight) {
      this.neonPointLight.intensity = 2.6 + Math.sin(cycle * 2) * 0.8;
    }

    // 7. Dynamic Camera Follow (Running companion perspective - elevated high angle)
    if (this.cameraMode === "follow") {
      this.camera.position.x = Math.sin(cycle) * 0.08;
      this.camera.position.y = 3.1 + bounce * 0.35;
      this.camera.position.z = -4.8;
    }

    // 8. Vanta Wave Field Dynamic Undulation
    if (this.vantaWaveMesh && this.waveOrigPositions) {
      const pos = this.vantaWaveMesh.geometry.attributes.position.array;
      const orig = this.waveOrigPositions;
      const t = elapsed * 1.6 * (this.speed / 10);

      const count = pos.length / 3;
      for (let i = 0; i < count; i++) {
        const x = orig[i * 3 + 0];
        const z = orig[i * 3 + 2];

        // Attenuate wave displacement in center so runway remains flush and clean
        const distFromCenter = Math.abs(x);
        const waveWeight = Math.min(
          1.0,
          Math.max(0.12, (distFromCenter - 2.6) / 5.5)
        );

        // Multi-frequency compound trigonometric waves flowing towards -Z
        const wave1 = Math.sin(x * 0.35 + t * 1.5);
        const wave2 = Math.cos(z * 0.22 + t * 2.0);
        const wave3 = Math.sin((x + z) * 0.26 + t * 0.85);

        pos[i * 3 + 1] =
          orig[i * 3 + 1] +
          (wave1 * 0.42 + wave2 * 0.38 + wave3 * 0.28) * waveWeight;
      }
      this.vantaWaveMesh.geometry.attributes.position.needsUpdate = true;
    }
  }

  render() {
    if (!this.isRunning) return;

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
      } catch {}
    }
    if (this.activeCameraAnim && typeof this.activeCameraAnim.pause === "function") {
      this.activeCameraAnim.pause();
      this.activeCameraAnim = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
    }
    if (this.onPageVisibilityChange) {
      document.removeEventListener("visibilitychange", this.onPageVisibilityChange);
    }
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj.geometry) {
          obj.geometry.dispose();
        }
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
      this.renderer.domElement.removeEventListener("webglcontextrestored", this.onContextRestored);
      this.renderer.domElement.remove();
      this.renderer.dispose();
    }
  }
}
