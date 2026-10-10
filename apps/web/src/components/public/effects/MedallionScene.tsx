/**
 * Lazy chunk: the 3D medallion (three.js + react-three-fiber). Imported only by Medallion.
 *
 * Geometry is built in code: a cylinder for the coin, tori for the raised rims, and the hero's
 * "70" outline (seventy-outline.ts, from the bundled Playfair Display) extruded on both faces.
 * Lighting is a generated studio room (no files are downloaded) plus a warm key and a cool fill.
 * Rendering is on demand: frames are only requested while the coin is on screen and the tab is
 * visible, so it costs nothing otherwise.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { useIsPhone } from './gate';
import { MEDALLION } from './settings';
import { SEVENTY_OUTLINE } from './seventy-outline';

const RADIUS = 1;
const THICKNESS = 0.14;

function useSeventyGeometry() {
  const geometry = useMemo(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${SEVENTY_OUTLINE.d}"/></svg>`;
    const shapes = new SVGLoader().parse(svg).paths.flatMap((path) => SVGLoader.createShapes(path));
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth: 26,
      bevelEnabled: true,
      bevelThickness: 14,
      bevelSize: 7,
      bevelSegments: 3,
      curveSegments: 10,
    });
    const width = SEVENTY_OUTLINE.maxX - SEVENTY_OUTLINE.minX;
    const scale = (RADIUS * 1.08) / width;
    geo.translate(-(SEVENTY_OUTLINE.minX + width / 2), -(SEVENTY_OUTLINE.minY + SEVENTY_OUTLINE.maxY) / 2, 0);
    geo.scale(scale, scale, scale);
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function StudioLighting() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = MEDALLION.environment;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
      room.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    };
  }, [gl, scene]);
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[3, 4, 5]} intensity={MEDALLION.keyLight} color="#FFF1D6" />
      <directionalLight position={[-4, -2, 3]} intensity={MEDALLION.fillLight} color="#DCE8F2" />
    </>
  );
}

function Coin({ active, onReady }: { active: boolean; onReady: () => void }) {
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const seventy = useSeventyGeometry();
  const motion = useRef({ angle: -0.5, tilt: 0.12, velocity: 0, dragging: false, lastX: 0, lastY: 0, reported: false });

  const materials = useMemo(
    () => ({
      field: new THREE.MeshStandardMaterial({ color: MEDALLION.goldDeep, metalness: MEDALLION.metalness, roughness: MEDALLION.roughness + 0.2 }),
      relief: new THREE.MeshStandardMaterial({ color: MEDALLION.gold, metalness: MEDALLION.metalness, roughness: MEDALLION.roughness - 0.1 }),
      edge: new THREE.MeshStandardMaterial({ color: MEDALLION.gold, metalness: MEDALLION.metalness, roughness: MEDALLION.roughness }),
    }),
    [],
  );
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  // Kick the render loop whenever the coin becomes active again.
  useEffect(() => {
    if (active) invalidate();
  }, [active, invalidate]);

  useFrame((_, delta) => {
    const m = motion.current;
    const g = group.current;
    if (!g) return;
    const dt = Math.min(delta, 1 / 20); // no jump after a pause
    if (!m.dragging) {
      m.angle += (MEDALLION.idleSpeed + m.velocity) * dt;
      m.velocity *= Math.pow(0.04, dt); // drag momentum fades out in about a second
      m.tilt += (0.12 - m.tilt) * Math.min(1, dt * 2);
    }
    g.rotation.set(m.tilt, m.angle, 0);
    if (!m.reported) {
      m.reported = true;
      requestAnimationFrame(onReady);
    }
    if (active) invalidate();
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    const m = motion.current;
    m.dragging = true;
    m.velocity = 0;
    m.lastX = e.clientX;
    m.lastY = e.clientY;
    gl.domElement.style.cursor = 'grabbing';
    invalidate();
  };
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const m = motion.current;
    if (!m.dragging) return;
    const dx = e.clientX - m.lastX;
    const dy = e.clientY - m.lastY;
    m.lastX = e.clientX;
    m.lastY = e.clientY;
    m.angle += dx * MEDALLION.dragSpeed;
    m.tilt = THREE.MathUtils.clamp(m.tilt + dy * MEDALLION.dragSpeed * 0.5, -0.6, 0.6);
    m.velocity = THREE.MathUtils.clamp(dx * MEDALLION.dragSpeed * 30, -4, 4);
    invalidate();
  };
  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    const m = motion.current;
    if (!m.dragging) return;
    m.dragging = false;
    (e.target as unknown as Element).releasePointerCapture?.(e.pointerId);
    gl.domElement.style.cursor = 'grab';
    invalidate();
  };

  const face = THICKNESS / 2;
  return (
    <group
      ref={group}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerOver={() => {
        if (!motion.current.dragging) gl.domElement.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        if (!motion.current.dragging) gl.domElement.style.cursor = '';
      }}
    >
      {/* body */}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.field}>
        <cylinderGeometry args={[RADIUS, RADIUS, THICKNESS, 128, 1]} />
      </mesh>
      {/* raised rims and a fine inner ring on both faces */}
      {[face, -face].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh material={materials.edge}>
            <torusGeometry args={[RADIUS - 0.045, 0.045, 20, 128]} />
          </mesh>
          <mesh material={materials.relief}>
            <torusGeometry args={[RADIUS * 0.8, 0.008, 8, 128]} />
          </mesh>
        </group>
      ))}
      {/* the embossed "70", front and back */}
      <mesh geometry={seventy} material={materials.relief} position={[0, 0, face - 0.005]} />
      <mesh geometry={seventy} material={materials.relief} position={[0, 0, -face + 0.005]} rotation={[0, Math.PI, 0]} />
    </group>
  );
}

export default function MedallionScene({ active, onReady }: { active: boolean; onReady: () => void }) {
  const phone = useIsPhone();
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, phone ? 1 : 1.5]}
      camera={{ position: [0, 0, 3.7], fov: 35 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      // Horizontal drags turn the coin; vertical swipes keep scrolling the page.
      style={{ position: 'absolute', inset: 0, touchAction: 'pan-y' }}
      aria-hidden
    >
      <StudioLighting />
      <Coin active={active} onReady={onReady} />
    </Canvas>
  );
}
