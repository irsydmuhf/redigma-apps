"use client";

import { useEffect, useRef } from "react";

interface TubesBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  enableClickInteraction?: boolean;
}

const randomColors = (count: number): string[] =>
  Array.from({ length: count }, () =>
    "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")
  );

export function TubesBackground({
  children,
  className,
  enableClickInteraction = false,
}: TubesBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tubesRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!canvasRef.current) return;
      try {
        const mod = await import(
          // @ts-expect-error — module di-load runtime, tidak ada type
          "threejs-components/build/cursors/tubes1.min.js"
        );
        const TubesCursor = mod.default;
        if (!mounted) return;

        tubesRef.current = TubesCursor(canvasRef.current, {
          tubes: {
            colors: ["#f967fb", "#53bc28", "#6958d5"],
            lights: {
              intensity: 200,
              colors: ["#83f36e", "#fe8a2e", "#ff008a", "#60aed5"],
            },
          },
        });
      } catch (e) {
        console.error("TubesBackground gagal load:", e);
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, []);

  const handleClick = () => {
    if (!enableClickInteraction || !tubesRef.current) return;
    tubesRef.current.tubes.setColors(randomColors(3));
    tubesRef.current.tubes.setLightsColors(randomColors(4));
  };

  return (
    <div
      className={`relative w-full h-full min-h-screen overflow-hidden bg-black ${className ?? ""}`}
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        style={{ touchAction: "none" }}
      />
      <div className="relative z-10 w-full h-full pointer-events-none">
        <div className="pointer-events-auto w-full h-full">{children}</div>
      </div>
    </div>
  );
}
