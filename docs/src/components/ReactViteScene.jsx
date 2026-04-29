"use client; no-ssr";

import { useRef, useEffect } from "react";

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

// `"use client; no-ssr"` keeps three.js out of the SSR/edge bundle: the
// SSR build replaces this module with a null-stub (no imports) and the
// client build wraps the export in <ClientOnly>, so the heavy WebGL
// shaders and post-processing helpers only ever ship — and only ever
// execute — in the browser. Static imports here are deliberate; the
// directive handles the "don't bundle on the server" half.

function isDarkMode() {
  return document.documentElement.classList.contains("dark");
}

function hasWebGLSupport() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

export default function ReactViteScene() {
  const placeholderRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const placeholder = placeholderRef.current;
    const canvasContainer = canvasRef.current;
    if (!placeholder || !canvasContainer) return;
    if (!hasWebGLSupport()) return;

    let dark = isDarkMode();

    const width = window.innerWidth;
    const height = window.innerHeight;

    // --- Renderer (full viewport size) ---
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    canvasContainer.appendChild(renderer.domElement);

    // --- Scene & Camera ---
    // Camera is set up so the model fits within the placeholder area.
    // We calculate the vertical FOV needed so the model (~3 world units tall)
    // maps to the placeholder height ratio within the full viewport.
    const scene = new THREE.Scene();
    const placeholderRect = placeholder.getBoundingClientRect();
    const viewportFraction = placeholderRect.height / height;
    // Model spans ~3 units, camera at z=5, so half-height at camera = 1.5
    // We want 1.5 units to map to (viewportFraction / 2) of the screen
    const fov = 2 * Math.atan(1.5 / (5 * viewportFraction)) * (180 / Math.PI);
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 100);
    camera.position.set(0, 0.15, 5);
    camera.lookAt(0, 0, 0);

    // --- Post-processing (bloom) ---
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.5, // strength
      0.4, // radius
      0.4 // threshold
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    // --- Lights ---
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambient);

    // Key light — cool white from upper right
    const keyLight = new THREE.DirectionalLight(0xe0f0ff, 1.8);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);

    // Rim light — cyan from behind-left for edge separation
    const rimLight = new THREE.PointLight(0x61dafb, 3, 15);
    rimLight.position.set(-4, 2, -3);
    scene.add(rimLight);

    // Fill — warm amber from below for depth
    const fillLight = new THREE.PointLight(0xffc53d, 1.5, 12);
    fillLight.position.set(2, -3, 2);
    scene.add(fillLight);

    // Back light — soft cyan glow behind nucleus
    const backLight = new THREE.PointLight(0x61dafb, 2, 8);
    backLight.position.set(0, 0, -3);
    scene.add(backLight);

    // --- Materials (MeshPhysicalMaterial for depth) ---
    const nucleusMat = new THREE.MeshPhysicalMaterial({
      color: 0x61dafb,
      emissive: 0x61dafb,
      emissiveIntensity: 0.5,
      roughness: 0.15,
      metalness: 0.4,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.0,
    });

    const orbitMat = new THREE.MeshPhysicalMaterial({
      color: 0x61dafb,
      emissive: 0x61dafb,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.45,
      roughness: 0.3,
      metalness: 0.5,
      clearcoat: 0.5,
    });

    const electronCoreMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      emissive: 0x61dafb,
      emissiveIntensity: 1.5,
      roughness: 0,
      metalness: 0,
    });

    const electronGlowMat = new THREE.MeshPhysicalMaterial({
      color: 0x61dafb,
      emissive: 0x61dafb,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.3,
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
    });

    const boltMat = new THREE.MeshPhysicalMaterial({
      color: 0xffc53d,
      emissive: 0xcc7a00,
      emissiveIntensity: 0.4,
      roughness: 0.35,
      metalness: 0.5,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
    });

    // --- Environment map (simple gradient for reflections) ---
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    function buildEnvScene(isDark) {
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(isDark ? 0x0d1f3c : 0xc0d8f0);
      const envLight1 = new THREE.PointLight(0x61dafb, isDark ? 5 : 3, 20);
      envLight1.position.set(5, 5, 5);
      envScene.add(envLight1);
      const envLight2 = new THREE.PointLight(0xffc53d, isDark ? 3 : 2, 20);
      envLight2.position.set(-5, -3, -5);
      envScene.add(envLight2);
      return envScene;
    }
    const envRT = pmremGenerator.fromScene(buildEnvScene(dark));
    scene.environment = envRT.texture;

    // --- Main group ---
    const atomGroup = new THREE.Group();
    scene.add(atomGroup);

    // --- Nucleus (sphere + point light glow) ---
    const nucleus = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 64, 64),
      nucleusMat
    );
    atomGroup.add(nucleus);

    // Core glow as a point light
    const nucleusLight = new THREE.PointLight(0x61dafb, 2, 5);
    nucleusLight.position.set(0, 0, 0);
    atomGroup.add(nucleusLight);

    // --- Orbits + Electrons ---
    const RADIUS = 0.85;
    const TUBE = 0.022;
    // React logo: 3 orbits with identical tilt, separated by 60° in screen plane
    // Tilt angle α ≈ 0.39 rad gives aspect ratio sin(α) ≈ 0.38 matching the logo
    const TILT = 0.39;
    const tilts = [
      { x: TILT, z: 0, speed: 1, offset: 0, rotSpeed: 0.08, wobble: 0.015 },
      {
        x: TILT,
        z: Math.PI / 3,
        speed: 1.3,
        offset: 0.33,
        rotSpeed: -0.06,
        wobble: 0.02,
      },
      {
        x: TILT,
        z: -Math.PI / 3,
        speed: 0.9,
        offset: 0.66,
        rotSpeed: 0.1,
        wobble: 0.012,
      },
    ];

    const pts = [];
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(Math.cos(a) * RADIUS, 0, Math.sin(a) * RADIUS)
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);

    const electrons = [];
    tilts.forEach(({ x, z, speed, offset, rotSpeed, wobble }) => {
      const group = new THREE.Group();
      group.rotation.set(x, 0, z);

      // Orbit ring
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 256, TUBE, 12, true),
        orbitMat.clone()
      );
      group.add(tube);

      // Electron core (bright white center)
      const electronCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 24, 24),
        electronCoreMat.clone()
      );
      group.add(electronCore);

      // Electron glow shell
      const electronGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 16),
        electronGlowMat.clone()
      );
      group.add(electronGlow);

      electrons.push({
        group,
        core: electronCore,
        glow: electronGlow,
        tube,
        curve,
        speed,
        offset,
        rotSpeed,
        wobble,
        baseX: x,
        baseZ: z,
      });

      atomGroup.add(group);
    });

    // --- Vite Lightning Bolt (3-part, traced from logo SVG) ---
    const shape = new THREE.Shape();
    shape.moveTo(-0.171, -0.521); // bottom tip left
    shape.lineTo(-0.064, -0.207); // left edge up to first tab
    shape.lineTo(-0.185, -0.207); // first tab jog left
    shape.lineTo(-0.069, 0.048); // left edge up to second tab
    shape.lineTo(-0.196, 0.046); // second tab jog left
    shape.lineTo(0.01, 0.472); // top-left
    shape.lineTo(0.215, 0.476); // top-right
    shape.lineTo(0.096, 0.254); // right edge down to first tab
    shape.lineTo(0.244, 0.25); // first tab jog right
    shape.lineTo(0.07, -0.042); // right edge down to second tab
    shape.lineTo(0.213, -0.045); // second tab jog right
    shape.lineTo(-0.163, -0.524); // bottom tip right
    shape.closePath();

    const boltGeom = new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    // Center the geometry so it rotates around its visual center
    boltGeom.computeBoundingBox();
    boltGeom.center();

    const boltMesh = new THREE.Mesh(boltGeom, boltMat);
    boltMesh.position.set(0, 0, 0.48);
    scene.add(boltMesh);

    // Bolt glow point light
    const boltLight = new THREE.PointLight(0xffa500, 0.6, 3);
    boltLight.position.set(0, 0, 0.6);
    scene.add(boltLight);

    // --- Background particles for depth ---
    const particleCount = 120;
    const particleGeom = new THREE.BufferGeometry();
    const pPositions = new Float32Array(particleCount * 3);
    const pSizes = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      pPositions[i * 3] = (Math.random() - 0.5) * 12;
      pPositions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
      pSizes[i] = Math.random() * 2 + 0.5;
    }
    particleGeom.setAttribute(
      "position",
      new THREE.BufferAttribute(pPositions, 3)
    );
    particleGeom.setAttribute("size", new THREE.BufferAttribute(pSizes, 1));
    const particleMat = new THREE.PointsMaterial({
      color: 0x61dafb,
      size: 0.03,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(particleGeom, particleMat);
    scene.add(particles);

    // --- Theme change handler ---
    // Collects all cloned materials so they can be updated on theme switch
    const allOrbitMats = electrons.map((e) => e.tube.material);
    const allElectronCoreMats = electrons.map((e) => e.core.material);
    const allElectronGlowMats = electrons.map((e) => e.glow.material);

    function applyTheme(isDark) {
      dark = isDark;

      if (!isDark) {
        // --- Light-mode overrides ---
        renderer.toneMappingExposure = 1.0;
        bloomPass.strength = 0.15;
        bloomPass.radius = 0.2;
        bloomPass.threshold = 0.8;

        ambient.intensity = 0.9;
        keyLight.intensity = 2.5;
        rimLight.intensity = 2;
        fillLight.intensity = 2;
        backLight.intensity = 1.5;

        nucleusMat.color.setHex(0x1a8fc4);
        nucleusMat.emissive.setHex(0x0e6b96);
        nucleusMat.emissiveIntensity = 0.15;
        nucleusMat.roughness = 0.1;
        nucleusMat.metalness = 0.6;
        nucleusMat.envMapIntensity = 1.5;

        const orbitLightProps = {
          color: 0x1a8fc4,
          emissive: 0x0e6b96,
          emissiveIntensity: 0.1,
          opacity: 0.7,
          metalness: 0.7,
        };
        [orbitMat, ...allOrbitMats].forEach((m) => {
          m.color.setHex(orbitLightProps.color);
          m.emissive.setHex(orbitLightProps.emissive);
          m.emissiveIntensity = orbitLightProps.emissiveIntensity;
          m.opacity = orbitLightProps.opacity;
          m.metalness = orbitLightProps.metalness;
        });

        const coreLight = {
          color: 0x0d9bdb,
          emissive: 0x0d7fb8,
          emissiveIntensity: 0.6,
          metalness: 0.3,
        };
        [electronCoreMat, ...allElectronCoreMats].forEach((m) => {
          m.color.setHex(coreLight.color);
          m.emissive.setHex(coreLight.emissive);
          m.emissiveIntensity = coreLight.emissiveIntensity;
          m.metalness = coreLight.metalness;
        });

        const glowLight = {
          color: 0x1a8fc4,
          emissive: 0x0e6b96,
          emissiveIntensity: 0.3,
          opacity: 0.45,
        };
        [electronGlowMat, ...allElectronGlowMats].forEach((m) => {
          m.color.setHex(glowLight.color);
          m.emissive.setHex(glowLight.emissive);
          m.emissiveIntensity = glowLight.emissiveIntensity;
          m.opacity = glowLight.opacity;
        });

        boltMat.color.setHex(0xe6a200);
        boltMat.emissive.setHex(0x996600);
        boltMat.emissiveIntensity = 0.15;
        boltMat.metalness = 0.7;

        particleMat.color.setHex(0x1a6fa0);
        particleMat.size = 0.04;
        particleMat.opacity = 0.5;
        particleMat.blending = THREE.NormalBlending;
        particleMat.needsUpdate = true;

        // Rebuild env map for light background
        const newEnvRT = pmremGenerator.fromScene(buildEnvScene(false));
        scene.environment = newEnvRT.texture;
      } else {
        // --- Dark-mode: restore original values ---
        renderer.toneMappingExposure = 1.2;
        bloomPass.strength = 0.5;
        bloomPass.radius = 0.4;
        bloomPass.threshold = 0.4;

        ambient.intensity = 0.25;
        keyLight.intensity = 1.8;
        rimLight.intensity = 3;
        fillLight.intensity = 1.5;
        backLight.intensity = 2;

        nucleusMat.color.setHex(0x61dafb);
        nucleusMat.emissive.setHex(0x61dafb);
        nucleusMat.emissiveIntensity = 0.5;
        nucleusMat.roughness = 0.15;
        nucleusMat.metalness = 0.4;
        nucleusMat.envMapIntensity = 1.0;

        const orbitDarkProps = {
          color: 0x61dafb,
          emissive: 0x61dafb,
          emissiveIntensity: 0.3,
          opacity: 0.45,
          metalness: 0.5,
        };
        [orbitMat, ...allOrbitMats].forEach((m) => {
          m.color.setHex(orbitDarkProps.color);
          m.emissive.setHex(orbitDarkProps.emissive);
          m.emissiveIntensity = orbitDarkProps.emissiveIntensity;
          m.opacity = orbitDarkProps.opacity;
          m.metalness = orbitDarkProps.metalness;
        });

        const coreDark = {
          color: 0xffffff,
          emissive: 0x61dafb,
          emissiveIntensity: 1.5,
          metalness: 0,
        };
        [electronCoreMat, ...allElectronCoreMats].forEach((m) => {
          m.color.setHex(coreDark.color);
          m.emissive.setHex(coreDark.emissive);
          m.emissiveIntensity = coreDark.emissiveIntensity;
          m.metalness = coreDark.metalness;
        });

        const glowDark = {
          color: 0x61dafb,
          emissive: 0x61dafb,
          emissiveIntensity: 1.0,
          opacity: 0.3,
        };
        [electronGlowMat, ...allElectronGlowMats].forEach((m) => {
          m.color.setHex(glowDark.color);
          m.emissive.setHex(glowDark.emissive);
          m.emissiveIntensity = glowDark.emissiveIntensity;
          m.opacity = glowDark.opacity;
        });

        boltMat.color.setHex(0xffc53d);
        boltMat.emissive.setHex(0xcc7a00);
        boltMat.emissiveIntensity = 0.4;
        boltMat.metalness = 0.5;

        particleMat.color.setHex(0x61dafb);
        particleMat.size = 0.03;
        particleMat.opacity = 0.35;
        particleMat.blending = THREE.AdditiveBlending;
        particleMat.needsUpdate = true;

        // Rebuild env map for dark background
        const newEnvRT = pmremGenerator.fromScene(buildEnvScene(true));
        scene.environment = newEnvRT.texture;
      }
    }

    // Apply light-mode overrides if starting in light mode
    if (!dark) applyTheme(false);

    // Watch for theme changes on <html> class
    const themeObserver = new MutationObserver(() => {
      applyTheme(isDarkMode());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // --- Animation ---
    let prevTime = performance.now();
    const startTime = prevTime;
    let animId;

    function animate() {
      animId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - prevTime) / 1000;
      const elapsed = (now - startTime) / 1000;
      prevTime = now;

      // Nucleus rotation
      nucleus.rotation.y += delta * 0.4;
      nucleus.rotation.x += delta * 0.15;

      // Nucleus glow pulsation
      const nucleusPulse = dark
        ? 0.4 + Math.sin(elapsed * 2) * 0.15
        : 0.12 + Math.sin(elapsed * 2) * 0.05;
      nucleusMat.emissiveIntensity = nucleusPulse;
      nucleusLight.intensity = dark
        ? 1.5 + Math.sin(elapsed * 2) * 0.5
        : 0.6 + Math.sin(elapsed * 2) * 0.15;

      // Electron animation (each orbit independent)
      electrons.forEach(({ core, glow, tube, curve: c, speed, offset }) => {
        const t = (((elapsed * speed * 0.35 + offset) % 1) + 1) % 1;
        const pos = c.getPointAt(t);
        core.position.copy(pos);
        glow.position.copy(pos);

        // Pulse electron glow
        const ePulse = dark
          ? 0.25 + Math.sin(elapsed * 4 + offset * 10) * 0.1
          : 0.4 + Math.sin(elapsed * 4 + offset * 10) * 0.1;
        glow.material.opacity = ePulse;
        core.material.emissiveIntensity = dark
          ? 1.2 + Math.sin(elapsed * 3 + offset * 8) * 0.5
          : 0.5 + Math.sin(elapsed * 3 + offset * 8) * 0.15;

        // Orbit ring subtle opacity variation
        tube.material.opacity = dark
          ? 0.35 + Math.sin(elapsed * 1.5 + offset * 5) * 0.1
          : 0.6 + Math.sin(elapsed * 1.5 + offset * 5) * 0.1;
      });

      // Vite bolt glow pulse (glow only, no scale change)
      const boltGlow = (Math.sin(elapsed * 1.2) + 1) * 0.5; // 0 → 1
      boltMat.emissiveIntensity = dark ? boltGlow * 0.3 : boltGlow * 0.1;
      boltLight.intensity = dark
        ? 0.1 + boltGlow * 0.4
        : 0.05 + boltGlow * 0.15;

      // Background particles drift + twinkle
      particles.rotation.y += delta * 0.02;
      particles.rotation.x += delta * 0.01;
      particleMat.opacity = dark
        ? 0.25 + Math.sin(elapsed * 0.8) * 0.1
        : 0.4 + Math.sin(elapsed * 0.8) * 0.1;

      // Bloom strength subtle variation
      bloomPass.strength = dark
        ? 0.4 + Math.sin(elapsed * 1.5) * 0.1
        : 0.1 + Math.sin(elapsed * 1.5) * 0.05;

      composer.render();
    }
    animate();

    // --- Resize ---
    function onResize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const pRect = placeholder.getBoundingClientRect();
      const vFrac = pRect.height / h;
      camera.fov = 2 * Math.atan(1.5 / (5 * vFrac)) * (180 / Math.PI);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return () => {
      themeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animId);
      pmremGenerator.dispose();
      renderer.dispose();
      composer.dispose();
      if (canvasContainer.contains(renderer.domElement)) {
        canvasContainer.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={placeholderRef}
      className="w-full h-[250px] sm:h-[350px] my-4"
      style={{ position: "relative", overflow: "visible" }}
    >
      <style>{`@keyframes scene-fade-in { from { opacity: 0 } to { opacity: 1 } }`}</style>
      <div
        ref={canvasRef}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "100vw",
          height: "100vh",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          opacity: 0,
          animation: "scene-fade-in 1.2s ease-out 0.3s forwards",
          background: "transparent",
        }}
      />
    </div>
  );
}
