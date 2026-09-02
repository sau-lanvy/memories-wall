"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import type { Memory } from "@/domain/memory";

function CardMesh({ memory, index }: { memory: Memory; index: number }) {
  const placement = memory.placements.personal;
  const position = placement?.freeform ?? { x: 8, y: 8 };
  const size = placement?.sizePreset === "small" ? [1.5, 1.05] : placement?.sizePreset === "large" ? [2.2, 1.55] : [1.85, 1.3];
  const color = ["#d7b94b", "#c16e54", "#6b855c", "#7188a4", "#b56e6e", "#9c827b", "#6d8c72"][index % 7];
  return <mesh position={[(position.x - 50) / 12, (50 - position.y) / 12, index * 0.01]} rotation={[0, 0, ((placement?.rotation ?? 0) * Math.PI) / 180]}>
    <planeGeometry args={size as [number, number]} />
    <meshStandardMaterial color="#f7f3e9" roughness={0.85} />
    <mesh position={[0, size[1] / 2 - 0.06, 0.01]}><planeGeometry args={[size[0], 0.08]} /><meshBasicMaterial color={color} /></mesh>
  </mesh>;
}

export function ThreeWall({ memories }: { memories: Memory[] }) {
  if (typeof window !== "undefined" && !("ResizeObserver" in window)) return null;
  const cards = useMemo(() => memories, [memories]);
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden overflow-hidden rounded-lg opacity-40 md:block">
    <Canvas orthographic camera={{ position: [0, 0, 8], zoom: 55 }} fallback={null}>
      <ambientLight intensity={1.4} /><directionalLight position={[2, 3, 5]} intensity={1.2} />
      {cards.map((memory, index) => <CardMesh key={memory.id} memory={memory} index={index} />)}
    </Canvas>
  </div>;
}
