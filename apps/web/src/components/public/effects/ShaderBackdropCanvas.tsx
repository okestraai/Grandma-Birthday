/**
 * Lazy chunk: ShaderGradient (three.js + react-three-fiber). Imported only by ShaderBackdrop.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ShaderGradient, ShaderGradientCanvas } from '@shadergradient/react';
import { getConsoleFunction, setConsoleFunction } from 'three';
import { BACKDROPS, type BackdropName } from './settings';

// ShaderGradient 2.4 creates a THREE.Clock on every render, and three r183+ warns each time that
// Clock is deprecated. Drop only that message; everything else from three.js goes to the console.
if (!getConsoleFunction()) {
  setConsoleFunction((type: 'log' | 'warn' | 'error', message: string, ...params: unknown[]) => {
    if (type === 'warn' && message.startsWith('THREE.Clock: This module has been deprecated')) return;
    console[type](message, ...params);
  });
}

/** Pauses rendering when inactive and reports the first drawn frame. */
function Driver({ active, onReady }: { active: boolean; onReady: () => void }) {
  const setFrameloop = useThree((s) => s.setFrameloop);
  const gl = useThree((s) => s.gl);
  const reported = useRef(false);

  useEffect(() => {
    // The library gives every canvas the same id; two on one page would clash.
    gl.domElement.removeAttribute('id');
    gl.domElement.setAttribute('aria-hidden', 'true');
  }, [gl]);

  useEffect(() => {
    setFrameloop(active ? 'always' : 'never');
  }, [active, setFrameloop]);

  useFrame(() => {
    if (reported.current) return;
    reported.current = true;
    // Wait one more frame so the first image is on screen before the layer fades in.
    requestAnimationFrame(onReady);
  });
  return null;
}

export default function ShaderBackdropCanvas({ name, active, onReady }: { name: BackdropName; active: boolean; onReady: () => void }) {
  const gradient = BACKDROPS[name];
  return (
    <ShaderGradientCanvas
      style={{ position: 'absolute', inset: 0 }}
      // A soft gradient gains nothing from extra pixels: render at CSS resolution everywhere.
      pixelDensity={1}
      fov={45}
      pointerEvents="none"
      lazyLoad={false}
      powerPreference="low-power"
    >
      <Driver active={active} onReady={onReady} />
      <ShaderGradient
        control="props"
        type="waterPlane"
        animate="on"
        lightType="3d"
        grain="off"
        enableTransition={false}
        {...gradient}
      />
    </ShaderGradientCanvas>
  );
}
