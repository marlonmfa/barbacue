import { Pool } from "pg";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

// Run once with DATABASE_URL and INITIAL_STAFF_PASSWORD supplied privately.
// Existing accounts are preserved; running again never resets their passwords.
const password = process.env.INITIAL_STAFF_PASSWORD;
if (!password || password.length < 8 || !process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL e INITIAL_STAFF_PASSWORD (mínimo 8 caracteres).");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const hash = promisify(scrypt);
const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const [name, username] of [["Marlon", "marlon@barbacue.cog.ia.br"], ["Claudio", "claudio@barbacue.cog.ia.br"]]) {
    const salt = randomBytes(16);
    const derived = await hash(password, salt, 64);
    const result = await client.query("INSERT INTO staff_users(name, username, password_hash, role, active, must_change_password) VALUES($1, $2, $3, 'admin', true, true) ON CONFLICT(username) DO NOTHING RETURNING username", [name, username, `${salt.toString("hex")}:${derived.toString("hex")}`]);
    console.log(`${username}: ${result.rowCount ? "criado; troca de senha obrigatória" : "já existe; preservado"}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally { client.release(); await pool.end(); }
