import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const BAR_COUNT = 43;
const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
  const envelope = Math.pow(Math.sin(Math.PI * (i + 1) / (BAR_COUNT + 1)), 0.72);
  const texture = 0.42 + 0.58 * Math.abs(Math.sin(i * 0.53 + 0.8) * Math.cos(i * 0.17 + 0.4));
  return {
    height: Math.round(12 + 74 * envelope * texture),
    duration: `${(0.66 + (i % 9) * 0.105).toFixed(2)}s`,
    delay: `${(-i * 0.061).toFixed(2)}s`,
  };
});

export default function KiraVoiceWave({
  mode = "processing",
  audioUrl,
  label,
  compact = false,
}) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const active = mode === "recording" || mode === "processing" || playing;
  const text = label || (mode === "recording"
    ? "KIRA ESTÁ OUVINDO"
    : mode === "ready" ? "ÁUDIO PRONTO" : "KIRA ESTÁ PROCESSANDO");

  useEffect(() => {
    setPlaying(false);
    setError(false);
    return () => audioRef.current?.pause();
  }, [audioUrl]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || error) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setPlaying(false);
      setError(true);
    }
  }

  return (
    <div className={`kira-holo relative w-full min-w-0 overflow-hidden ${compact ? "py-1" : "py-3"}`} role="status" aria-label={text}>
      <style>{`
        @keyframes kira-holo-wave {
          0% { transform: scaleY(.28); opacity: .5; }
          50% { transform: scaleY(1); opacity: 1; }
          100% { transform: scaleY(.42); opacity: .72; }
        }
        .kira-holo-bar { transform-origin: center; }
        .kira-holo-active .kira-holo-bar { animation: kira-holo-wave var(--kira-duration) ease-in-out var(--kira-delay) infinite; }
        @media (prefers-reduced-motion: reduce) { .kira-holo-active .kira-holo-bar { animation: none; } }
      `}</style>
      <div className="relative flex items-center justify-center gap-3">
        <div className={`kira-holo-bars ${active ? "kira-holo-active" : ""} flex min-w-0 flex-1 items-center justify-center gap-[2px] sm:gap-[3px] ${compact ? "h-12" : "h-24"}`} aria-hidden="true">
          {bars.map((bar, i) => (
            <span
              key={i}
              className="kira-holo-bar block w-[2px] shrink rounded-full bg-gradient-to-b from-cyan-300 via-violet-400 to-indigo-500 shadow-[0_0_9px_rgba(103,232,249,0.45)] sm:w-[3px]"
              style={{
                height: `${compact ? Math.round(bar.height * 0.48) : bar.height}px`,
                "--kira-duration": bar.duration,
                "--kira-delay": bar.delay,
                opacity: active ? 1 : 0.75,
              }}
            />
          ))}
        </div>
        {audioUrl && (
          <>
            <audio
              ref={audioRef}
              src={audioUrl}
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onError={() => setError(true)}
              className="hidden"
            />
            <button
              type="button"
              onClick={togglePlayback}
              disabled={error}
              aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-40"
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
          </>
        )}
      </div>
      <p className="mt-1 text-center text-[10px] font-medium tracking-[0.2em] text-violet-300/90">{error ? "ÁUDIO INDISPONÍVEL" : text}</p>
    </div>
  );
}
