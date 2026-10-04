import pg from "pg";
import { randomUUID, randomBytes, createHash } from "crypto";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL não configurada. Defina uma connection string de um banco Postgres (ex: Neon, Supabase) no .env do servidor."
  );
}

const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || "");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false }
});

export async function initStore() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      searched BOOLEAN NOT NULL DEFAULT false,
      search_queries JSONB NOT NULL DEFAULT '[]',
      visited_sites JSONB NOT NULL DEFAULT '[]',
      reasoning TEXT,
      search_disabled BOOLEAN NOT NULL DEFAULT false,
      image_url TEXT,
      had_attachment BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Migrações seguras para bancos que já tinham as tabelas antes destas colunas existirem.
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS had_attachment BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS document_name TEXT;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS document_content TEXT;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS artifact_name TEXT;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS artifact_files JSONB;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS disclaimer_version TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMPTZ;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legal_acceptances (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      document_version TEXT NOT NULL,
      document_hash TEXT NOT NULL,
      accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_agent TEXT,
      UNIQUE(user_id, document_type, document_version)
    );
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email)) WHERE email IS NOT NULL;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      current_version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      description TEXT,
      stack JSONB NOT NULL DEFAULT '[]',
      entry_point TEXT
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS artifact_versions (
      id BIGSERIAL PRIMARY KEY,
      artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      files JSONB NOT NULL,
      summary TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (artifact_id, version)
    );
  `);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS artifact_id UUID;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS artifact_version INTEGER;`);
  await pool.query(`ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS description TEXT;`);
  await pool.query(`ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS stack JSONB NOT NULL DEFAULT '[]';`);
  await pool.query(`ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS entry_point TEXT;`);
  await pool.query(`ALTER TABLE artifact_versions ADD COLUMN IF NOT EXISTS change_manifest JSONB NOT NULL DEFAULT '{"created":[],"updated":[],"deleted":[]}'::jsonb;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS active_projects (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(user_id, conversation_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_response_cache (
      id BIGSERIAL PRIMARY KEY,
      fingerprint TEXT UNIQUE NOT NULL,
      normalized_prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      model TEXT,
      hits INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_artifacts_conversation ON artifacts(conversation_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact ON artifact_versions(artifact_id, version DESC);`);
}

// ---------- Users ----------

const USER_FIELDS = `id, username, email, password_hash AS "passwordHash"`;

export async function findUserByUsername(username) {
  const { rows } = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE lower(username) = lower($1)`, [username]);
  return rows[0] || null;
}

export async function createUser({ username, email, passwordHash, legal }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO users (id, username, email, password_hash, terms_version, disclaimer_version, legal_accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING id, username, email, created_at AS "createdAt"`,
      [id, username, email, passwordHash, legal.termsVersion, legal.disclaimerVersion]
    );
    await client.query(
      `INSERT INTO legal_acceptances (user_id, document_type, document_version, document_hash, user_agent)
       VALUES ($1,'terms',$2,$3,$4), ($1,'disclaimer',$5,$6,$4)`,
      [id, legal.termsVersion, legal.termsHash, legal.userAgent || null, legal.disclaimerVersion, legal.disclaimerHash]
    );
    await client.query("COMMIT");
    return { ...rows[0], passwordHash };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") throw new Error(err.constraint === "idx_users_email_lower" ? "EMAIL_TAKEN" : "USERNAME_TAKEN");
    throw err;
  } finally {
    client.release();
  }
}

export async function findUserByEmail(email) {
  const { rows } = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE lower(email) = lower($1)`, [email]);
  return rows[0] || null;
}

export async function createPasswordResetToken(userId) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await pool.query(
    `UPDATE users SET reset_token_hash = $2, reset_token_expires_at = now() + interval '1 hour' WHERE id = $1`,
    [userId, tokenHash]
  );
  return token;
}

export async function findUserByValidResetToken(token) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { rows } = await pool.query(
    `SELECT ${USER_FIELDS} FROM users WHERE reset_token_hash = $1 AND reset_token_expires_at > now()`,
    [tokenHash]
  );
  return rows[0] || null;
}

export async function clearPasswordResetToken(userId) {
  await pool.query(`UPDATE users SET reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = $1`, [userId]);
}

export async function updatePassword(userId, passwordHash) {
  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);
}

// ---------- Conversations ----------

export async function listConversations(userId) {
  const { rows } = await pool.query(`SELECT id, title, created_at AS "createdAt" FROM conversations WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
  return rows;
}

export async function getConversation(userId, conversationId) {
  const { rows: convRows } = await pool.query(`SELECT id, title, created_at AS "createdAt" FROM conversations WHERE id = $1 AND user_id = $2`, [
    conversationId,
    userId
  ]);
  if (!convRows[0]) return null;

  const { rows: messages } = await pool.query(
    `SELECT role, content, searched,
            search_queries AS "searchQueries",
            visited_sites AS "visitedSites",
            reasoning,
            search_disabled AS "searchDisabled",
            image_url AS "imageUrl",
            had_attachment AS "hadAttachment",
            document_name AS "documentName",
            document_content AS "documentContent",
            artifact_name AS "artifactName",
            artifact_files AS "artifactFiles",
            artifact_id AS "artifactId",
            artifact_version AS "artifactVersion"
     FROM messages WHERE conversation_id = $1 ORDER BY id ASC`,
    [conversationId]
  );

  return { ...convRows[0], messages };
}

export async function createConversation(userId, title) {
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)
     RETURNING id, title, created_at AS "createdAt"`,
    [id, userId, title]
  );
  return { ...rows[0], messages: [] };
}

export async function appendMessages(userId, conversationId, newMessages) {
  const { rows } = await pool.query(`SELECT id FROM conversations WHERE id = $1 AND user_id = $2`, [conversationId, userId]);
  if (!rows[0]) throw new Error("Conversa não encontrada.");

  for (const m of newMessages) {
    await pool.query(
      `INSERT INTO messages (conversation_id, role, content, searched, search_queries, visited_sites, reasoning, search_disabled, image_url, had_attachment, document_name, document_content, artifact_name, artifact_files, artifact_id, artifact_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        conversationId,
        m.role,
        m.content,
        m.searched || false,
        JSON.stringify(m.searchQueries || []),
        JSON.stringify(m.visitedSites || []),
        m.reasoning || null,
        m.searchDisabled || false,
        m.imageUrl || null,
        m.hadAttachment || false,
        m.documentName || null,
        m.documentContent || null,
        m.artifactName || null,
        m.artifactFiles ? JSON.stringify(m.artifactFiles) : null,
        m.artifactId || null,
        m.artifactVersion || null
      ]
    );
  }
}

export async function deleteConversation(userId, conversationId) {
  await pool.query(`DELETE FROM conversations WHERE id = $1 AND user_id = $2`, [conversationId, userId]);
}

export async function deleteAllConversations(userId) {
  await pool.query(`DELETE FROM conversations WHERE user_id = $1`, [userId]);
}

// ---------- Feedback ----------

export async function createFeedback(userId, username, message) {
  await pool.query(`INSERT INTO feedback (user_id, username, message) VALUES ($1, $2, $3)`, [userId, username, message]);
}


// ---------- Artifacts & versions ----------

function normalizeFiles(files) {
  return (Array.isArray(files) ? files : [])
    .filter((f) => f && typeof f.path === "string" && f.path.trim() && typeof f.content === "string")
    .map((f) => ({ path: f.path.trim().replace(/^\/+/, ""), content: f.content, language: typeof f.language === "string" ? f.language : "" }));
}

export async function createArtifactVersioned(userId, conversationId, name, files, summary = "Criação inicial") {
  const id = randomUUID();
  const clean = normalizeFiles(files);
  if (!clean.length) throw new Error("Artifact sem arquivos.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO artifacts (id, user_id, conversation_id, name, current_version) VALUES ($1,$2,$3,$4,1)`,
      [id, userId, conversationId, name || "Artifact"]
    );
    await client.query(
      `INSERT INTO artifact_versions (artifact_id, version, files, summary) VALUES ($1,1,$2::jsonb,$3)`,
      [id, JSON.stringify(clean), summary]
    );
    await client.query("COMMIT");
    return { id, name: name || "Artifact", version: 1, files: clean, summary };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getArtifact(userId, artifactId, version = null) {
  const { rows } = await pool.query(
    `SELECT id, name, description, stack, entry_point AS "entryPoint", conversation_id AS "conversationId", current_version AS "currentVersion"
     FROM artifacts WHERE id=$1 AND user_id=$2`,
    [artifactId, userId]
  );
  const artifact = rows[0];
  if (!artifact) return null;
  const wanted = version || artifact.currentVersion;
  const { rows: versions } = await pool.query(
    `SELECT version, files, summary, change_manifest AS "changeManifest", created_at AS "createdAt"
     FROM artifact_versions WHERE artifact_id=$1 AND version=$2`,
    [artifactId, wanted]
  );
  if (!versions[0]) return null;
  return { ...artifact, ...versions[0] };
}

export async function listArtifactVersions(userId, artifactId) {
  const { rows } = await pool.query(
    `SELECT av.version, av.summary, av.created_at AS "createdAt"
     FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id
     WHERE av.artifact_id=$1 AND a.user_id=$2 ORDER BY av.version DESC`,
    [artifactId, userId]
  );
  return rows;
}

export async function addArtifactVersion(userId, artifactId, changedFiles, summary = "Alteração") {
  const current = await getArtifact(userId, artifactId);
  if (!current) return null;
  const changes = normalizeFiles(changedFiles);
  if (!changes.length) throw new Error("Nenhum arquivo alterado.");
  const map = new Map(current.files.map((f) => [f.path, f]));
  for (const f of changes) map.set(f.path, f);
  const files = [...map.values()];
  const next = current.currentVersion + 1;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO artifact_versions (artifact_id, version, files, summary) VALUES ($1,$2,$3::jsonb,$4)`,
      [artifactId, next, JSON.stringify(files), summary]
    );
    await client.query(`UPDATE artifacts SET current_version=$2, updated_at=now() WHERE id=$1 AND user_id=$3`, [artifactId, next, userId]);
    await client.query("COMMIT");
    return { id: artifactId, name: current.name, version: next, files, summary, changedFiles: changes.map(f => f.path) };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function restoreArtifactVersion(userId, artifactId, version) {
  const old = await getArtifact(userId, artifactId, Number(version));
  if (!old) return null;
  const current = await getArtifact(userId, artifactId);
  const next = current.currentVersion + 1;
  const summary = `Restaurada a partir da v${version}`;
  await pool.query(
    `INSERT INTO artifact_versions (artifact_id, version, files, summary) VALUES ($1,$2,$3::jsonb,$4)`,
    [artifactId, next, JSON.stringify(old.files), summary]
  );
  await pool.query(`UPDATE artifacts SET current_version=$2, updated_at=now() WHERE id=$1 AND user_id=$3`, [artifactId, next, userId]);
  return { id: artifactId, name: old.name, version: next, files: old.files, summary };
}


export async function updateProjectMetadata(userId, artifactId, metadata={}) {
  const {rows}=await pool.query(
    `UPDATE artifacts SET description=COALESCE($3,description), stack=COALESCE($4::jsonb,stack), entry_point=COALESCE($5,entry_point), updated_at=now()
     WHERE id=$1 AND user_id=$2 RETURNING id,name,description,stack,entry_point AS "entryPoint",current_version AS "currentVersion"`,
    [artifactId,userId,metadata.description||null,metadata.stack?JSON.stringify(metadata.stack):null,metadata.entryPoint||null]
  ); return rows[0]||null;
}
export async function listProjects(userId){
  const {rows}=await pool.query(`SELECT id,name,description,stack,entry_point AS "entryPoint",current_version AS "currentVersion",updated_at AS "updatedAt" FROM artifacts WHERE user_id=$1 ORDER BY updated_at DESC`,[userId]);
  return rows;
}
export async function findProjectMention(userId,text){
  const {rows}=await pool.query(`SELECT id,name FROM artifacts WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50`,[userId]);
  const q=String(text||"").toLowerCase();
  return rows.find(r=>q.includes(String(r.name).toLowerCase()))||null;
}
export async function setActiveProject(userId,conversationId,artifactId){
  await pool.query(`INSERT INTO active_projects(user_id,conversation_id,artifact_id) VALUES($1,$2,$3)
    ON CONFLICT(user_id,conversation_id) DO UPDATE SET artifact_id=EXCLUDED.artifact_id,updated_at=now()`,[userId,conversationId,artifactId]);
}
export async function getActiveProject(userId,conversationId){
  const {rows}=await pool.query(`SELECT artifact_id AS "artifactId" FROM active_projects WHERE user_id=$1 AND conversation_id=$2`,[userId,conversationId]);
  return rows[0]||null;
}
export async function getCachedResponse(fingerprint){
  const {rows}=await pool.query(`UPDATE ai_response_cache SET hits=hits+1 WHERE fingerprint=$1 AND expires_at>now() RETURNING response,model,hits`,[fingerprint]);
  return rows[0]||null;
}
export async function findRecentCacheCandidates(limit=30){
  const {rows}=await pool.query(`SELECT fingerprint,normalized_prompt AS "normalizedPrompt",response,model FROM ai_response_cache WHERE expires_at>now() ORDER BY created_at DESC LIMIT $1`,[limit]);
  return rows;
}
export async function putCachedResponse(fingerprint,normalizedPrompt,response,model){
  await pool.query(`INSERT INTO ai_response_cache(fingerprint,normalized_prompt,response,model) VALUES($1,$2,$3,$4)
    ON CONFLICT(fingerprint) DO UPDATE SET response=EXCLUDED.response,model=EXCLUDED.model,expires_at=now()+interval '24 hours'`,
    [fingerprint,normalizedPrompt,response,model||null]);
}
export async function saveVersionWithOperations(userId,artifactId,files,summary,manifest){
  const current=await getArtifact(userId,artifactId); if(!current)return null;
  const next=current.currentVersion+1;
  await pool.query(`INSERT INTO artifact_versions(artifact_id,version,files,summary,change_manifest) VALUES($1,$2,$3::jsonb,$4,$5::jsonb)`,
    [artifactId,next,JSON.stringify(files),summary,JSON.stringify(manifest)]);
  await pool.query(`UPDATE artifacts SET current_version=$2,updated_at=now() WHERE id=$1 AND user_id=$3`,[artifactId,next,userId]);
  return {id:artifactId,name:current.name,version:next,files,summary,changeManifest:manifest};
}
export async function getVersionChanges(userId,artifactId,version){
  const {rows}=await pool.query(`SELECT av.change_manifest AS "changeManifest",av.files,av.summary FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id WHERE av.artifact_id=$1 AND av.version=$2 AND a.user_id=$3`,[artifactId,version,userId]);
  return rows[0]||null;
}
