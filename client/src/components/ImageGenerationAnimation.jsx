
import { useMemo } from "react";
import { Sparkles } from "lucide-react";

export default function ImageGenerationAnimation() {
  const particles = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        angle: (i * 137.508 * Math.PI) / 180,
        radius: 24 + (i % 8) * 15,
        delay: -(i % 12) * 0.22,
        duration: 2.2 + (i % 5) * 0.35,
        size: 2 + (i % 3)
      })),
    []
  );

  return (
    <div
      role="status"
      aria-label="Kira está gerando sua imagem"
      className="relative mt-3 w-full max-w-md overflow-hidden rounded-2xl border border-neon/20 bg-panel2"
    >
      <div className="relative flex h-64 items-center justify-center overflow-hidden">
        <div className="absolute h-40 w-40 rounded-full bg-neon/10 blur-3xl animate-pulse" />

        <div className="relative flex items-center justify-center">
          {particles.map((particle) => (
            <span
              key={particle.id}
              className="absolute rounded-full bg-neon shadow-[0_0_10px_currentColor] animate-[kiraParticle_3s_ease-in-out_infinite]"
              style={{
                width: particle.size,
                height: particle.size,
                "--particle-x": `${Math.cos(particle.angle) * particle.radius}px`,
                "--particle-y": `${Math.sin(particle.angle) * particle.radius}px`,
                animationDelay: `${particle.delay}s`,
                animationDuration: `${particle.duration}s`
              }}
            />
          ))}

          <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl border border-neon/30 bg-panel shadow-lg shadow-neon/10">
            <Sparkles className="text-neon animate-pulse" size={28} />
          </div>
        </div>
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-neon" />
          <span className="text-sm font-medium text-paper">
            Kira está criando sua imagem
          </span>
        </div>
        <p className="mt-1 text-xs text-mist">
          Transformando sua descrição em uma composição visual...
        </p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-neon/10">
          <div className="h-full w-1/3 rounded-full bg-neon animate-[kiraProgress_2s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}
