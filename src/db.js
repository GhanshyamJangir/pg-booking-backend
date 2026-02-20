// src/db.js
const { Pool } = require("pg");

// IMPORTANT: allow self-signed chain (Windows + pooler issue)
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true"
    ? { rejectUnauthorized: false }
    : false,
});

pool.on("error", (err) => {
  console.error("❌ Unexpected PG pool error:", err.message);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
};
