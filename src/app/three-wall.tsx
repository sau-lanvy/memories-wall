"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { DecorationLayer, Memory, TemplateVisualTreatment, WallTemplate } from "@/domain/memory";
import type { Group, Mesh } from "three";

const DEFAULT_TREATMENT: TemplateVisualTreatment = { scene: "paper-drift", motion: "still", intensity: 0 };
const sceneColors: Record<TemplateVisualTreatment["scene"], string> = {
  "paper-drift": "#eadfce",
  "warm-cabinet": "#8a684d",
  "soft-constellation": "#b8c7d5",
  "botanical-light": "#b9cbb1",
  "blueprint-glow": "#9fb8c8",
};

function CardMesh({ memory, index, treatment, reducedMotion }: { memory: Memory; index: number; treatment: TemplateVisualTreatment; reducedMotion: boolean }) {
  const group = useRef<Group>(null);
  const placement = memory.placements.personal;
  const position = placement?.freeform ?? { x: 8, y: 8 };
  const size = placement?.sizePreset === "small" ? [1.5, 1.05] : placement?.sizePreset === "large" ? [2.2, 1.55] : [1.85, 1.3];
  const color = ["#d7b94b", "#c16e54", "#6b855c", "#7188a4", "#b56e6e", "#9c827b", "#6d8c72"][index % 7];
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion || treatment.motion === "still") return;
    const phase = clock.getElapsedTime() * (treatment.motion === "drift" ? 0.35 : 0.55) + index;
    group.current.position.y = (50 - position.y) / 12 + Math.sin(phase) * treatment.intensity * 0.06;
    group.current.rotation.z = Math.sin(phase * 0.7) * treatment.intensity * 0.012;
  });
  return <group ref={group} position={[(position.x - 50) / 12, (50 - position.y) / 12, index * 0.01]}>
    <mesh rotation={[0, 0, ((placement?.rotation ?? 0) * Math.PI) / 180]}>
    <planeGeometry args={size as [number, number]} />
    <meshStandardMaterial color="#f7f3e9" roughness={0.85} />
    <mesh position={[0, size[1] / 2 - 0.06, 0.01]}><planeGeometry args={[size[0], 0.08]} /><meshBasicMaterial color={color} /></mesh>
    </mesh>
  </group>;
}

/**
 * Renders a single Decoration Layer: purely additive, drawn on top of everything else, and never
 * reads or alters the Template Visual Treatment. Only `animated` layers respect reduced-motion.
 */
function DecorationLayerMesh({ layer, index, reducedMotion }: { layer: DecorationLayer; index: number; reducedMotion: boolean }) {
  const group = useRef<Group>(null);
  const animated = layer === "lights" || layer === "snow" || layer === "autumn";
  const particles = useMemo(() => Array.from({ length: 10 }, (_, particleIndex) => ({
    x: ((particleIndex * 37 + index * 13) % 100) / 5 - 10,
    y: ((particleIndex * 53 + index * 7) % 100) / 7 - 7,
    seed: particleIndex,
  })), [index]);
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion || !animated) return;
    const time = clock.getElapsedTime();
    group.current.children.forEach((child, particleIndex) => {
      const mesh = child as Mesh;
      const seed = particles[particleIndex]?.seed ?? particleIndex;
      if (layer === "lights") mesh.position.y = particles[particleIndex].y + Math.sin(time * 0.4 + seed) * 0.06;
      if (layer === "snow") mesh.position.y = ((particles[particleIndex].y - time * 0.35 + seed) % 14) - 7;
      if (layer === "autumn") mesh.position.y = ((particles[particleIndex].y - time * 0.25 + seed) % 14) - 7;
    });
  });
  if (layer === "warm-glow") {
    return <mesh position={[0, 0, 0.5]}><planeGeometry args={[20, 14]} /><meshBasicMaterial color="#f4c98a" transparent opacity={0.08} /></mesh>;
  }
  const color = layer === "snow" ? "#fffaf0" : layer === "autumn" ? "#c86f3f" : "#ffe8a8";
  return <group ref={group}>
    {particles.map((particle, particleIndex) => <mesh key={particleIndex} position={[particle.x, particle.y, 0.5]}>
      <circleGeometry args={[0.05, 8]} /><meshBasicMaterial color={color} transparent opacity={0.5} />
    </mesh>)}
  </group>;
}

function DomDecorationLayers({ layers, reducedMotion }: { layers: DecorationLayer[]; reducedMotion: boolean }) {
  const particles = Array.from({ length: 16 }, (_, index) => ({
    left: `${8 + ((index * 47) % 84)}%`,
    top: `${8 + ((index * 31) % 80)}%`,
    delay: `${(index % 8) * -0.7}s`,
    size: `${3 + (index % 4)}px`,
    opacity: 0.45 + (index % 4) * 0.12,
  }));
  const bulbs = Array.from({ length: 14 }, (_, index) => ({
    left: `${12 + index * 5.8}%`,
    top: `${5 + [0, 1, 0, 3, 1, 4, 2, 5, 3, 2, 5, 7, 9, 11][index]}%`,
    delay: `${(index % 6) * -0.45}s`,
  }));
  return <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" aria-hidden="true">
    {layers.includes("warm-glow") && <div className="absolute inset-0 rounded-lg shadow-[inset_0_0_90px_rgba(244,201,138,0.42)]" />}
    {layers.includes("lights") && <><div className="absolute right-[6%] top-[6%] h-10 w-[82%] -rotate-2 rounded-[50%] border-t border-[#6f4b2d]/55" />{bulbs.map((bulb, index) => <i key={`bulb-${index}`} className="absolute h-3.5 w-3.5 rounded-full bg-[#ffe8a8] shadow-[0_0_14px_5px_rgba(255,214,126,0.95)] motion-safe:animate-[wall-bulb-pulse_2.8s_ease-in-out_infinite]" style={{ left: bulb.left, top: bulb.top, animationDelay: bulb.delay, animationPlayState: reducedMotion ? "paused" : "running" }} />)}</>}
    {layers.includes("snow") && particles.map((particle, index) => <i key={`snow-${index}`} className="absolute rounded-full bg-white shadow-[0_0_5px_1px_rgba(255,255,255,.6)] motion-safe:animate-[wall-snow-fall_10s_linear_infinite]" style={{ left: particle.left, top: particle.top, width: particle.size, height: particle.size, opacity: particle.opacity, animationDelay: particle.delay, animationPlayState: reducedMotion ? "paused" : "running" }} />)}
    {layers.includes("autumn") && particles.slice(0, 12).map((particle, index) => <i key={`autumn-${index}`} className="absolute rounded-[100%_0] bg-[#c86f3f] shadow-sm motion-safe:animate-[wall-autumn-fall_9s_linear_infinite]" style={{ left: particle.left, top: particle.top, width: `${6 + index % 4}px`, height: `${9 + index % 5}px`, opacity: particle.opacity, transform: `rotate(${index * 31}deg)`, animationDelay: particle.delay, animationPlayState: reducedMotion ? "paused" : "running" }} />)}
  </div>;
}

/** Renders the selected template's decorative scene without owning wall interaction. */
export function ThreeWall({ memories, template, decorationLayers = [] }: { memories: Memory[]; template?: WallTemplate; decorationLayers?: DecorationLayer[] }) {
  const cards = useMemo(() => memories, [memories]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [canRender, setCanRender] = useState(false);
  const [eventSource, setEventSource] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!("ResizeObserver" in window)) return;
    setCanRender(true);
    const query = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (!query) return;
    const update = () => setReducedMotion(query.matches);
    update();
    if (typeof query.addEventListener === "function") query.addEventListener("change", update);
    return () => { if (typeof query.removeEventListener === "function") query.removeEventListener("change", update); };
  }, []);
  const treatment = template?.visualTreatment ?? DEFAULT_TREATMENT;
  return <div ref={setEventSource} aria-hidden="true" className="pointer-events-none absolute inset-0 hidden overflow-hidden rounded-lg opacity-70 md:block">
    <DomDecorationLayers layers={decorationLayers} reducedMotion={reducedMotion} />
    {canRender && eventSource && <Canvas eventSource={eventSource} orthographic camera={{ position: [0, 0, 8], zoom: 55 }} fallback={null} dpr={[1, 1.5]}>
      <mesh position={[0, 0, -0.2]}><planeGeometry args={[20, 14]} /><meshBasicMaterial color={sceneColors[treatment.scene]} transparent opacity={0.16} /></mesh>
      <ambientLight intensity={1.4} /><directionalLight position={[2, 3, 5]} intensity={1.2} />
      {cards.map((memory, index) => <CardMesh key={memory.id} memory={memory} index={index} treatment={treatment} reducedMotion={reducedMotion} />)}
      {decorationLayers.map((layer, index) => <DecorationLayerMesh key={layer} layer={layer} index={index} reducedMotion={reducedMotion} />)}
    </Canvas>}
  </div>;
}
