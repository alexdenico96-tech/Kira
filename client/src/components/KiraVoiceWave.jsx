import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const BAR_COUNT = 29;

export default function KiraVoiceWave({
  mode = "processing",
  audioUrl,
  label,
  compact = false
}) {
  const [levels, setLevels] = useState(() => Array(BAR_COUNT).fill(0.3));
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    if (mode === "ready") return;
    let frameId;
    let last = 0;
    const animate = (time) => {
      if (time - last >= 45) {
        setLevels(Array.from({ length: BAR_COUNT }, (_, i) => {
          const envelope = 0.22 + 0.78 * Math.sin((i / (BAR_COUNT - 1)) * Math.PI);
          return envelope * (0.25 + 0.75 * Math.abs(Math.sin(time * 0.004 + i * 0.57)));
        }));
        last = time;
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [mode]);

  useEffect(() => {
    return () => audioRef.current?.pause();
  }, []);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  };

  const text = label || (mode === "recording"
    ? "KIRA ESTÁ OUVINDO"
    : mode === "ready" ? "ÁUDIO PRONTO" : "PROCESSANDO ÁUDIO");

  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-violet-500/30 bg-slate-950/95 ${compact ? "px-3 py-2" : "px-4 py-3"} shadow-[0_0_24px_rgba(139,92,246,0.18)]`}>
      <div className={`relative flex ${compact ? "h-11 w-11" : "h-14 w-14"} shrink-0 items-center justify-center`} aria-hidden="true">
        <div className={`absolute inset-0 rounded-full border border-dashed border-cyan-400/40 ${mode !== "ready" ? "animate-spin [animation-duration:9s]" : ""}`} />
        <div className={`absolute inset-2 rounded-full border border-violet-400/60 shadow-[0_0_18px_rgba(139,92,246,0.4)] ${mode !== "ready" ? "animate-pulse" : ""}`} />
        <div className="relative z-10 h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_12px_#67e8f9]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex h-10 items-center justify-center gap-[2px]" aria-hidden="true">
          {levels.map((level, index) => (
            <span key={index} className="w-[3px] rounded-full bg-gradient-to-b from-cyan-300 via-violet-400 to-indigo-500 shadow-[0_0_6px_rgba(167,139,250,0.55)] transition-[height] duration-75" style={{ height: `${Math.max(5, (mode === "ready" ? (0.2 + 0.6 * Math.abs(Math.sin(index * 0.63))) : level) * 36)}px` }} />
          ))}
        </div>
        <p className="mt-1 text-center text-[10px] font-medium tracking-[0.14em] text-violet-300">{text}</p>
      </div>
      {audioUrl && (
        <>
          <audio ref={audioRef} src={audioUrl} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} className="hidden" />
          <button type="button" onClick={togglePlayback} aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"} title={playing ? "Pausar áudio" : "Reproduzir áudio"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20">
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </>
      )}
    </div>
  );
}
