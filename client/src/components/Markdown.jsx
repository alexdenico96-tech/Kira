import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// Links abrem em nova aba; citações [n] das pesquisas aparecem como selos com o número.
function Link({ href, title, children }) {
  if (title?.startsWith("fonte:")) {
    const domain = title.slice(6);
    return (
      <a href={href} target="_blank" rel="noreferrer" className="kira-cite" title={domain}>
        {children}
      </a>
    );
  }
  return <a href={href} title={title} target="_blank" rel="noreferrer">{children}</a>;
}

export default function Markdown({ children, typing = false }) {
  return (
    <div className={`markdown-body text-[15px] text-paper font-body leading-relaxed${typing ? " is-typing" : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={{ a: Link }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
