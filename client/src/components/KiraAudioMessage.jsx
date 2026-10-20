
import { useEffect, useRef, useState } from "react";
import { Pause, Play, AudioLines } from "lucide-react";

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const value = Math.floor(seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export default function KiraAudioMessage({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setError(false);
    return () => {
      audioRef.current?.pause();
    };
  }, [src]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !src) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
    } catch {
      setError(true);
      setPlaying(false);
    }
  }

  return (
    <div className="relative w-[240px] max-w-full overflow-hidden rounded-2xl border border-violet-400/30 bg-slate-950 px-3 py-3 text-white shadow-[0_0_24px_rgba(139,92,246,0.15)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-violet-500/10 to-indigo-500/10" />

      <audio
        ref={audioRef}
        src={src || undefined}
        preload="metadata"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
      />

      <div className="relative flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!src || error}
          aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/10 text-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.25)] transition hover:scale-105 disabled:opacity-40"
        >
          {playing ? <Pause size={19} /> : <Play size={19} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium tracking-widest text-violet-300">
            <AudioLines size={12} />
            MENSAGEM DE VOZ
          </div>

          <div
            className="flex h-8 items-center justify-center gap-[3px]"
            aria-hidden="true"
          >
            {Array.from({ length: 25 }, (_, i) => (
              <span
                key={i}
                className={[
                  "w-[3px] rounded-full bg-gradient-to-b from-cyan-300 via-violet-400 to-indigo-500",
                  playing ? "animate-pulse" : ""
                ].join(" ")}
                style={{
                  height: `${6 + Math.abs(Math.sin(i * 0.65) * Math.cos(i * 0.21)) * 24}px`,
                  animationDelay: `${i * 45}ms`,
                  animationDuration: `${500 + (i % 5) * 130}ms`
                }}
              />
            ))}
          </div>

          <div className="mt-1 text-right text-[10px] tabular-nums text-slate-400">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="relative mt-2 text-xs text-rose-300">
          Áudio indisponível para reprodução.
        </p>
      )}
    </div>
  );
}
