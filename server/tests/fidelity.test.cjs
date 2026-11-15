const test = require('node:test');
const assert = require('node:assert/strict');
const req = import('../lib/requirements.js');
const react = import('../lib/reactChecks.js');
const dev = import('../lib/developerAgent.js');

const pedido = `Crie um e-commerce em React com:
- página inicial com banner e produtos em destaque
- catálogo com filtro por categoria e busca
- carrinho com adicionar, remover e total
- página de login
Quero 12 produtos de tênis.`;

test('extrai checklist de listas e quantidades sem modelo', async () => {
  const { extractRequirementsHeuristic } = await req;
  const list = extractRequirementsHeuristic(pedido);
  assert.ok(list.length >= 5);
  assert.ok(list.some(r => /carrinho/i.test(r.text)));
  assert.ok(list.some(r => r.kind === 'quantity' && r.count === 12));
});

test('usa o checklist do modelo e mantém quantidades detectadas por regex', async () => {
  const { extractRequirements } = await req;
  const ask = async () => '```json\n{"requirements":[{"id":"R1","text":"Carrinho com total","kind":"feature","terms":["carrinho","total"],"count":null}]}\n```';
  const { requirements, source } = await extractRequirements(pedido, ask);
  assert.equal(source, 'model');
  assert.ok(requirements.some(r => r.count === 12));
});

test('modelo com resposta inválida cai na extração determinística', async () => {
  const { extractRequirements } = await req;
  const { source } = await extractRequirements(pedido, async () => 'não sei');
  assert.equal(source, 'heuristic');
});

test('verifica requisitos no código: termos, quantidade e arquivos citados', async () => {
  const { verifyRequirements } = await req;
  const reqs = [
    { id: 'R1', text: 'Carrinho com total', terms: ['carrinho', 'total'], count: null },
    { id: 'R2', text: 'Página de login', terms: ['login'], count: null },
    { id: 'R3', text: '12 produtos', terms: ['produto'], count: 12 }
  ];
  const files = [
    { path: 'src/pages/Carrinho.jsx', content: 'export default function Carrinho(){ const total = 0; return <p>{total}</p> }' },
    { path: 'src/data/produtos.js', content: 'export default [' + Array.from({ length: 5 }, (_, i) => `{ id: ${i}, nome: "Tênis ${i}", preco: 100 }`).join(',') + ']' }
  ];
  const check = verifyRequirements(files, reqs, [{ id: 'R1', files: ['src/pages/Carrinho.jsx'] }, { id: 'R2', files: ['src/pages/Login.jsx'] }]);
  assert.deepEqual(check.missing.map(m => m.id), ['R2', 'R3']);
  assert.match(check.missing[1].reason, /pedido 12/);
});

test('React: acusa componente e hook sem import e import default/nomeado inexistente', async () => {
  const { inspectReactProject } = await react;
  const { issues } = inspectReactProject([
    { path: 'src/App.jsx', content: 'import Header from "./components/Header";\nimport { Footer } from "./components/Footer";\nexport default function App(){ const [a] = useState(0); return <><Header/><ProductGrid/><Footer/></> }' },
    { path: 'src/components/Header.jsx', content: 'export function Header(){ return <header/> }' },
    { path: 'src/components/Footer.jsx', content: 'export default function Footer(){ return <footer/> }' }
  ]);
  assert.ok(issues.some(i => i.includes('<ProductGrid>')));
  assert.ok(issues.some(i => i.includes('useState()')));
  assert.ok(issues.some(i => i.includes('não tem export default')));
  assert.ok(issues.some(i => i.includes('{ Footer }')));
});

test('React: projeto correto não gera falso positivo', async () => {
  const { inspectReactProject } = await react;
  const { issues } = inspectReactProject([
    { path: 'src/App.jsx', content: 'import { useState } from "react";\nimport { BrowserRouter, Routes, Route } from "react-router-dom";\nimport Card, { Badge } from "./Card";\nfunction useCart(){ return useState([]) }\nexport default function App(){ const [c] = useCart(); const Icon = c.icon; return <BrowserRouter><Routes><Route path="/" element={<Card icon={Icon}><Badge/><Icon/></Card>}/></Routes></BrowserRouter> }' },
    { path: 'src/Card.jsx', content: 'export const Badge = () => <span/>;\nexport default function Card({ children, icon: Icon }){ return <div><Icon/>{children}</div> }' }
  ]);
  assert.deepEqual(issues, []);
});

test('developerPrompt inclui checklist e regras de React compatíveis com o preview', async () => {
  const { developerPrompt } = await dev;
  const text = developerPrompt('Crie um app React de tarefas', [], [{ id: 'R1', text: 'filtro por status', terms: ['filtro'] }]);
  assert.match(text, /CHECKLIST DE FIDELIDADE/);
  assert.match(text, /R1\. filtro por status/);
  assert.match(text, /nunca aliases "@\/"/);
});
