import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const COUNT = 31;
const bars = Array.from({ length: COUNT }, (_, i) =>
  Math.round(5 + 27 * Math.pow(Math.sin(Math.PI * (i + 1) / (COUNT + 1)), 0.8) *
    (0.42 + 0.58 * Math.abs(Math.sin(i * 0.64 + 0.7))))
);

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const value = Math.floor(seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export default function KiraAudioMessage({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(NaN);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setDuration(NaN);
    setCurrentTime(0);
    setError(false);
    return () => audioRef.current?.pause();
  }, [src]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !src || error) return;
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

  const progress = Number.isFinite(duration) && duration > 0
    ? Math.min(1, currentTime / duration) : 0;

  return (
    <div className="w-[270px] max-w-full rounded-xl border border-violet-400/20 bg-slate-950/60 px-3 py-2.5 text-white">
      <style>{`
        @keyframes kira-audio-breathe { 0%, 100% { transform: scaleY(.4); } 50% { transform: scaleY(1); } }
        @media (prefers-reduced-motion: reduce) { .kira-audio-animated { animation: none !important; } }
      `}</style>
      <audio
        ref={audioRef}
        src={src || undefined}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!src || error}
          aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-40"
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex h-9 items-center justify-center gap-[3px]" aria-hidden="true">
            {bars.map((height, i) => (
              <span
                key={i}
                className={`block w-[3px] min-w-0 flex-1 rounded-full bg-gradient-to-b from-cyan-300 via-violet-400 to-indigo-500 ${playing ? "kira-audio-animated" : ""}`}
                style={{
                  height: `${height}px`,
                  opacity: i / COUNT <= progress ? 1 : 0.55,
                  animation: playing ? `kira-audio-breathe ${0.65 + (i % 7) * 0.12}s ease-in-out ${-i * 0.05}s infinite` : "none",
                }}
              />
            ))}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] tabular-nums text-slate-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
      {Number.isFinite(duration) && duration > 0 && (
        <input
          type="range"
          min="0"
          max={duration}
          step="0.1"
          value={Math.min(currentTime, duration)}
          onChange={(e) => {
            const time = Number(e.target.value);
            if (audioRef.current) audioRef.current.currentTime = time;
            setCurrentTime(time);
          }}
          aria-label="Posição do áudio"
          className="mt-2 block h-1 w-full cursor-pointer accent-cyan-400"
        />
      )}
      {error && <p role="alert" className="mt-2 text-xs text-rose-300">Áudio indisponível para reprodução.</p>}
    </div>
  );
}
