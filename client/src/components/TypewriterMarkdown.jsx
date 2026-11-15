import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown.jsx";
import { nextBoundary, revealSpeed, safePartialMarkdown } from "../lib/typewriter.js";

// Revela a resposta como se a Kira estivesse escrevendo. Clique para mostrar tudo de uma vez.
export default function TypewriterMarkdown({ content = "", animate = true, onTick, onDone }) {
  const [visible, setVisible] = useState(animate ? 0 : content.length);
  const doneRef = useRef(!animate);

  useEffect(() => {
    if (!animate || !content) {
      setVisible(content.length);
      onDone?.();
      return undefined;
    }
    doneRef.current = false;
    const speed = revealSpeed(content.length);
    let frame;
    let last = performance.now();
    let position = 0;
    let budget = 0;
    const tick = (now) => {
      budget += ((now - last) / 1000) * speed;
      last = now;
      if (budget >= 1) {
        position = nextBoundary(content, position + Math.floor(budget));
        budget = budget % 1;
        setVisible(position);
        onTick?.();
      }
      if (position < content.length) frame = requestAnimationFrame(tick);
      else { doneRef.current = true; onDone?.(); }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, animate]);

  const typing = visible < content.length;
  return (
    <div
      onClick={typing ? () => { setVisible(content.length); onDone?.(); } : undefined}
      title={typing ? "Clique para mostrar tudo" : undefined}
      className={typing ? "cursor-default" : undefined}
    >
      <Markdown typing={typing}>{typing ? safePartialMarkdown(content.slice(0, visible)) : content}</Markdown>
    </div>
  );
}
