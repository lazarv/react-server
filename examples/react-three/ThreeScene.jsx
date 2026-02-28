"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

function RotatingBox() {
  const meshRef = useRef(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.5;
      meshRef.current.rotation.y += delta * 0.8;
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      <meshStandardMaterial color="#4f8ef7" />
    </mesh>
  );
}

export default function ThreeScene() {
  return (
    <Canvas
      style={{ width: 400, height: 400 }}
      camera={{ position: [0, 0, 4], fov: 50 }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <RotatingBox />
    </Canvas>
  );
}
