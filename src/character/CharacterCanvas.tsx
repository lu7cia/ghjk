import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildCharacter, type BuiltCharacter } from './rig';
import { makePixelTexture } from './ps1Material';
import { drawHabitat } from './habitat';
import type { CharacterConfig, HabitatConfig } from '../lib/types';

interface Props {
  character: CharacterConfig;
  habitat: HabitatConfig;
  /** Decoded uploads used as clothing textures. */
  topImage?: HTMLImageElement | null;
  bottomImage?: HTMLImageElement | null;
  /** Decoded upload used as the habitat backdrop, overriding the preset. */
  backdropImage?: HTMLImageElement | null;
  /** Internal render size. Small on purpose — this is the whole look. */
  internalWidth?: number;
  internalHeight?: number;
  className?: string;
  interactive?: boolean;
}

/**
 * Renders the character into a deliberately tiny framebuffer (320x240 by
 * default) and lets CSS blow it up with nearest-neighbour scaling. Rendering
 * small and upscaling is what actually sells the era — a 4K render with a
 * posterise filter on top never looks right.
 */
export function CharacterCanvas({
  character,
  habitat,
  topImage,
  bottomImage,
  backdropImage,
  internalWidth = 320,
  internalHeight = 240,
  className,
  interactive = true,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    pivot: THREE.Group;
    built: BuiltCharacter | null;
    yaw: number;
    dragging: boolean;
    lastX: number;
    raf: number;
  } | null>(null);

  /* ---------------------------------------------------- one-time scene setup */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setPixelRatio(1); // never upscale — the chunk is the point
    renderer.setSize(internalWidth, internalHeight, false);
    renderer.setClearColor(0x05060a, 1);

    const canvas = renderer.domElement;
    // Fill the panel but letterbox rather than stretch: the framebuffer is 4:3
    // and the panel around it is not, so scaling both axes to 100% distorts the
    // character. object-fit does the scaling; image-rendering keeps it chunky.
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.objectFit = 'contain';
    canvas.style.display = 'block';
    canvas.style.imageRendering = 'pixelated';
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, internalWidth / internalHeight, 0.1, 100);
    camera.position.set(0, 1.02, 3.15);
    camera.lookAt(0, 0.95, 0);

    const pivot = new THREE.Group();
    scene.add(pivot);

    const st = {
      renderer, scene, camera, pivot,
      built: null as BuiltCharacter | null,
      yaw: 0, dragging: false, lastX: 0, raf: 0,
    };
    stateRef.current = st;

    let last = performance.now();
    const loop = () => {
      st.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      if (!st.dragging && character.turntable) st.yaw += dt * 0.45;
      st.pivot.rotation.y = st.yaw;

      // A slow breathing bob, so a still character never looks like a statue.
      st.pivot.position.y = Math.sin(now / 1400) * 0.006;

      st.renderer.render(st.scene, st.camera);
    };
    st.raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(st.raf);
      st.built?.dispose();
      renderer.dispose();
      canvas.remove();
      stateRef.current = null;
    };
    // Scene lifetime is intentionally tied to the framebuffer size only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [internalWidth, internalHeight]);

  /* -------------------------------------------------------- drag to rotate */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !interactive) return;

    const down = (e: PointerEvent) => {
      const st = stateRef.current;
      if (!st) return;
      st.dragging = true;
      st.lastX = e.clientX;
      host.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const st = stateRef.current;
      if (!st || !st.dragging) return;
      st.yaw += (e.clientX - st.lastX) * 0.012;
      st.lastX = e.clientX;
    };
    const up = (e: PointerEvent) => {
      const st = stateRef.current;
      if (!st) return;
      st.dragging = false;
      if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
    };

    host.addEventListener('pointerdown', down);
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
    return () => {
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', up);
    };
  }, [interactive]);

  /* ------------------------------------------------------- rebuild the body */
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;

    st.built?.dispose();
    st.pivot.clear();

    const built = buildCharacter(character, { top: topImage, bottom: bottomImage });
    st.built = built;
    st.pivot.add(built.group);

    // Frame the whole figure with a little headroom, whatever height it ended
    // up being. Recomputed on every rebuild so the height slider stays framed.
    const halfFov = THREE.MathUtils.degToRad(st.camera.fov / 2);
    const target = built.height * 0.5;
    const distance = (built.height * 0.66) / Math.tan(halfFov);
    st.camera.position.set(0, target * 1.05, distance);
    st.camera.lookAt(0, target, 0);

    applyLighting(built, habitat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, topImage, bottomImage]);

  /* -------------------------------------------- backdrop + lighting updates */
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;

    const old = st.scene.background;
    if (old instanceof THREE.Texture) old.dispose();

    const source: TexImageSource = backdropImage ?? drawHabitat(habitat.presetId);
    st.scene.background = makePixelTexture(source);

    if (st.built) applyLighting(st.built, habitat);
  }, [habitat, backdropImage]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        cursor: interactive ? 'ew-resize' : 'default',
        touchAction: 'none',
      }}
    />
  );
}

function applyLighting(built: BuiltCharacter, habitat: HabitatConfig): void {
  const light = new THREE.Color(habitat.lightColor);
  const fog = new THREE.Color(habitat.fogColor);
  // Ambient is a cool, heavily-dimmed tint of the key light, which is roughly
  // what a single hardware light plus a flat ambient term looked like.
  const ambient = light.clone().multiplyScalar(0.42).lerp(fog, 0.45);

  // Density maps to how close the fog wall sits, not to an exponential term:
  // linear fog is what the hardware had.
  const near = 2.2 + (1 - habitat.fogDensity) * 2.0;
  const far = near + 1.5 + (1 - habitat.fogDensity) * 14;

  for (const m of built.materials) {
    m.uniforms.uLightColor.value.copy(light);
    m.uniforms.uAmbient.value.copy(ambient);
    m.uniforms.uLightIntensity.value = habitat.lightIntensity;
    m.uniforms.uFogColor.value.copy(fog);
    m.uniforms.uFogNear.value = near;
    m.uniforms.uFogFar.value = far;
  }
}
