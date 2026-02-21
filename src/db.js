const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("❌ Unexpected PG pool error:", err.message);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
};