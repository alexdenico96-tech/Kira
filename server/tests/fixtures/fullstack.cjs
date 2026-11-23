// Projeto full-stack de exemplo (React + Express + PostgreSQL) usado nos testes.
const files = {
  'package.json': JSON.stringify({ name: 'tarefas', private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' }, dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' }, devDependencies: { vite: '^5.4.0', '@vitejs/plugin-react': '^4.3.0' } }, null, 2),
  'index.html': '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
  'vite.config.js': 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()], server: { proxy: { "/api": "http://localhost:3001" } } });',
  'src/main.jsx': 'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\nimport "./index.css";\ncreateRoot(document.getElementById("root")).render(<App />);',
  'src/App.jsx': 'import { useEffect, useState } from "react";\nimport { CheckCircle } from "lucide-react";\nimport { listTasks } from "./lib/api.js";\nexport default function App() { const [t, setT] = useState([]); useEffect(() => { listTasks().then(setT); }, []); return <main><CheckCircle />{t.map(x => <p key={x.id}>{x.title}</p>)}</main>; }',
  'src/lib/api.js': 'const API = import.meta.env.VITE_API_URL || "/api";\nconst demo = [{ id: 1, title: "Exemplo" }];\nexport async function listTasks() { try { const r = await fetch(`${API}/tasks`); if (!r.ok) throw 0; return await r.json(); } catch { return demo; } }',
  'src/index.css': 'body{margin:0;font-family:system-ui}',
  'server/package.json': JSON.stringify({ name: 'tarefas-api', type: 'module', scripts: { dev: 'node --watch index.js', start: 'node index.js', 'db:setup': 'node scripts/setup-db.js' }, dependencies: { express: '^4.21.1', pg: '^8.13.1', cors: '^2.8.5', dotenv: '^16.4.5' } }, null, 2),
  'server/db.js': 'import pg from "pg";\nconst pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false });\nexport const query = (text, params) => pool.query(text, params);',
  'server/index.js': 'import "dotenv/config";\nimport express from "express";\nimport cors from "cors";\nimport { query } from "./db.js";\nconst app = express();\napp.use(cors()); app.use(express.json());\napp.get("/api/health", async (_q, r) => { await query("SELECT 1"); r.json({ ok: true }); });\napp.get("/api/tasks", async (_q, r) => { const { rows } = await query("SELECT * FROM tasks ORDER BY id"); r.json(rows); });\napp.post("/api/tasks", async (q, r) => { const { rows } = await query("INSERT INTO tasks (title) VALUES ($1) RETURNING *", [q.body.title]); r.status(201).json(rows[0]); });\napp.listen(process.env.PORT || 3001);',
  'server/schema.sql': 'CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW());',
  'server/seed.sql': "INSERT INTO tasks (title) VALUES ('Comprar café') ON CONFLICT DO NOTHING;",
  'server/scripts/setup-db.js': 'import "dotenv/config";\nimport fs from "node:fs";\nimport { query } from "../db.js";\nawait query(fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));\nawait query(fs.readFileSync(new URL("../seed.sql", import.meta.url), "utf8"));\nprocess.exit(0);',
  'server/.env.example': 'DATABASE_URL=postgresql://usuario:senha@localhost:5432/tarefas\nDATABASE_SSL=false\nPORT=3001\n',
  'README.md': '# Tarefas\nComo rodar...'
};
module.exports = () => Object.entries(files).map(([path, content]) => ({ path, content }));
