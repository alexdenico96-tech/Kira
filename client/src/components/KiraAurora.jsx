// Luzes fluidas de fundo. Ficam mais intensas enquanto a Kira trabalha.
export default function KiraAurora({ busy = false }) {
  return (
    <div className={`kira-aurora${busy ? " is-busy" : ""}`} aria-hidden="true">
      <div className="kira-aurora__blob kira-aurora__blob--1" />
      <div className="kira-aurora__blob kira-aurora__blob--2" />
      <div className="kira-aurora__blob kira-aurora__blob--3" />
      <div className="kira-aurora__beam" />
    </div>
  );
}
