"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Memory, TemplateVisualTreatment, WallTemplate } from "@/domain/memory";
import type { Group } from "three";

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

export function ThreeWall({ memories, template }: { memories: Memory[]; template?: WallTemplate }) {
  if (typeof window !== "undefined" && !("ResizeObserver" in window)) return null;
  const cards = useMemo(() => memories, [memories]);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  const treatment = template?.visualTreatment ?? DEFAULT_TREATMENT;
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden overflow-hidden rounded-lg opacity-40 md:block">
    <Canvas orthographic camera={{ position: [0, 0, 8], zoom: 55 }} fallback={null} dpr={[1, 1.5]}>
      <mesh position={[0, 0, -0.2]}><planeGeometry args={[20, 14]} /><meshBasicMaterial color={sceneColors[treatment.scene]} transparent opacity={0.16} /></mesh>
      <ambientLight intensity={1.4} /><directionalLight position={[2, 3, 5]} intensity={1.2} />
      {cards.map((memory, index) => <CardMesh key={memory.id} memory={memory} index={index} treatment={treatment} reducedMotion={reducedMotion} />)}
    </Canvas>
  </div>;
}
