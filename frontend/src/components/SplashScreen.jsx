import { useState, useEffect } from 'react';

// Halftone orb — Stitch design, code-generated dots
function HalftoneOrbSplash() {
  const dots = [];
  const grid = 10;
  const size = 120;
  const gap = 4;
  const cellSize = (size - gap * (grid - 1)) / grid;

  for (let i = 0; i < grid * grid; i++) {
    const x = i % grid;
    const y = Math.floor(i / grid);
    const dist = Math.sqrt(Math.pow(x - 4.5, 2) + Math.pow(y - 4.5, 2));
    const dotSize = Math.max(1, 8 - dist * 1.4);
    const opacity = Math.max(0.05, 1 - dist / 6);

    dots.push(
      <div
        key={i}
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          backgroundColor: '#b79fff',
          opacity,
        }}
      />
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${grid}, 1fr)`,
      gridTemplateRows: `repeat(${grid}, 1fr)`,
      gap: 4,
      width: 120,
      height: 120,
      justifyItems: 'center',
      alignItems: 'center',
    }}>
      {dots}
    </div>
  );
}

export default function SplashScreen({ onFinish }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFadeOut(true), 1800);
    const finish = setTimeout(() => onFinish(), 2300);
    return () => { clearTimeout(timer); clearTimeout(finish); };
  }, [onFinish]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      backgroundColor: '#0e0e0e',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'opacity 0.5s ease',
      opacity: fadeOut ? 0 : 1,
      pointerEvents: fadeOut ? 'none' : 'auto',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute',
        width: 180,
        height: 180,
        background: 'rgba(183, 159, 255, 0.1)',
        borderRadius: '50%',
        filter: 'blur(60px)',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -60%)',
        pointerEvents: 'none',
      }} />

      {/* Halftone orb */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <HalftoneOrbSplash />

        {/* AETHER text */}
        <h1 style={{
          marginTop: 32,
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          fontSize: 24,
          color: '#ffffff',
          letterSpacing: '0.6em',
          lineHeight: 1,
          userSelect: 'none',
        }}>
          AETHER
        </h1>
      </div>
    </div>
  );
}
