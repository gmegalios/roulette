import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import cors from "cors";
import express from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import pg from "pg";

const required = ["DATABASE_URL", "MICROSOFT_CLIENT_ID", "MICROSOFT_TENANT_ID"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing environment settings: ${missing.join(", ")}`);

const port = Number(process.env.PORT || 1187);
const tenantId = process.env.MICROSOFT_TENANT_ID;
const clientId = process.env.MICROSOFT_CLIENT_ID;
const requiredScope = process.env.MICROSOFT_API_SCOPE || "access_as_user";
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "https://gmegalios.github.io")
  .split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean));
const tlsCert = process.env.TLS_CERT_FILE;
const tlsKey = process.env.TLS_KEY_FILE;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require"
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
    : false
});
const jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`));

function mapEntry(row) {
  return {
    id: String(row.id),
    date: row.entry_date,
    amount: Number(row.amount),
    note: row.note,
    createdAt: new Date(row.created_at).toISOString(),
    createdBy: {
      name: row.creator_name,
      username: row.creator_email,
      tenantId: row.created_by_tenant_id || "",
      objectId: row.created_by_object_id || ""
    }
  };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function cleanEntry(body) {
  const date = String(body.date || "").trim();
  const amount = Number(body.amount);
  const note = String(body.note || "").trim().slice(0, 140);
  if (!validDate(date)) return { error: "Choose a valid date." };
  if (!Number.isFinite(amount) || Math.abs(amount) >= 1e16) return { error: "Enter a valid win or loss amount." };
  return { entry: { date, amount, note } };
}

async function authenticate(req, res, next) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  if (!match) return res.status(401).json({ error: "Microsoft sign-in is required." });
  try {
    const audience = [...new Set([clientId, `api://${clientId}`, process.env.MICROSOFT_API_AUDIENCE].filter(Boolean))];
    const issuer = [
      `https://login.microsoftonline.com/${tenantId}/v2.0`,
      `https://sts.windows.net/${tenantId}/`
    ];
    const { payload } = await jwtVerify(match[1], jwks, { audience, issuer });
    const scopes = String(payload.scp || "").split(" ");
    if (payload.tid !== tenantId || !scopes.includes(requiredScope)) {
      return res.status(403).json({ error: "This account does not have access to the Roulette API." });
    }
    req.user = payload;
    next();
  } catch (error) {
    console.warn("Rejected access token:", error.code || error.message);
    return res.status(401).json({ error: "The Microsoft session is invalid or expired." });
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  if (req.headers["access-control-request-private-network"] === "true") {
    res.set("Access-Control-Allow-Private-Network", "true");
  }
  next();
});
app.use(cors({
  origin(origin, callback) {
    const normalized = origin?.replace(/\/$/, "");
    callback(null, !origin || allowedOrigins.has(normalized));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"]
}));
app.use(express.json({ limit: "32kb" }));

app.get("/health", asyncRoute(async (_req, res) => {
  await pool.query("select 1");
  res.json({ ok: true });
}));

app.get("/config", (_req, res) => {
  res.json({
    clientId,
    tenantId,
    apiScope: process.env.MICROSOFT_API_SCOPE_URI || `api://${clientId}/${requiredScope}`
  });
});

app.use("/api", authenticate);

app.get("/api/entries", asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    select id, entry_date::text, amount, note, created_at,
           created_by_object_id::text, created_by_tenant_id::text,
           creator_name, creator_email
    from public.roulette_entries
    order by entry_date desc, created_at desc
  `);
  res.json({ entries: result.rows.map(mapEntry) });
}));

app.post("/api/entries", asyncRoute(async (req, res) => {
  const { entry, error } = cleanEntry(req.body || {});
  if (error) return res.status(400).json({ error });
  const user = req.user;
  const result = await pool.query(`
    insert into public.roulette_entries
      (entry_date, amount, note, created_by_object_id, created_by_tenant_id, creator_name, creator_email)
    values ($1, $2, $3, $4, $5, $6, $7)
    returning id, entry_date::text, amount, note, created_at,
              created_by_object_id::text, created_by_tenant_id::text,
              creator_name, creator_email
  `, [entry.date, entry.amount, entry.note, user.oid, user.tid,
    user.name || user.preferred_username || "Microsoft user",
    user.preferred_username || user.upn || user.email || ""]);
  res.status(201).json({ entry: mapEntry(result.rows[0]) });
}));

app.put("/api/entries/:id", asyncRoute(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "Invalid entry ID." });
  const { entry, error } = cleanEntry(req.body || {});
  if (error) return res.status(400).json({ error });
  const result = await pool.query(`
    update public.roulette_entries
    set entry_date = $1, amount = $2, note = $3
    where id = $4
    returning id, entry_date::text, amount, note, created_at,
              created_by_object_id::text, created_by_tenant_id::text,
              creator_name, creator_email
  `, [entry.date, entry.amount, entry.note, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Entry not found." });
  res.json({ entry: mapEntry(result.rows[0]) });
}));

app.delete("/api/entries/:id", asyncRoute(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "Invalid entry ID." });
  const result = await pool.query("delete from public.roulette_entries where id = $1", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Entry not found." });
  res.json({ ok: true });
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "The database request failed." });
});

const hasTls = Boolean(tlsCert && tlsKey);
if (Boolean(tlsCert) !== Boolean(tlsKey)) throw new Error("Set both TLS_CERT_FILE and TLS_KEY_FILE, or neither.");
const server = hasTls
  ? https.createServer({ cert: fs.readFileSync(tlsCert), key: fs.readFileSync(tlsKey) }, app)
  : http.createServer(app);

server.listen(port, "0.0.0.0", () => {
  console.log(`Roulette API listening on ${hasTls ? "https" : "http"}://0.0.0.0:${port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
