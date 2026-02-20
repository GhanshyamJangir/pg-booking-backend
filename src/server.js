// src/server.js
require("dotenv").config();
console.log("DATABASE_URL:", process.env.DATABASE_URL);
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const routes = require("./routes");
const db = require("./db");

const app = express();

const ALLOWED_ORIGINS = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.length === 0) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error("CORS blocked: " + origin));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));

// ensure uploads folder exists
const uploadsDirSrc = path.join(__dirname, "uploads");
const uploadsDirRoot = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDirSrc)) fs.mkdirSync(uploadsDirSrc, { recursive: true });
if (!fs.existsSync(uploadsDirRoot)) fs.mkdirSync(uploadsDirRoot, { recursive: true });

// serve uploads (support both locations)
app.use("/uploads", express.static(uploadsDirSrc));
app.use("/uploads", express.static(uploadsDirRoot));

app.get("/", (req, res) => res.send("PG Booking Backend OK"));

app.use("/api", routes);

app.use((err, req, res, next) => {
  console.error("❌ API Error:", err);
  res.status(400).json({ error: err.message || "Unknown error" });
});

const PORT = Number(process.env.PORT || 8080);

async function start() {
  try {
    await db.query("SELECT 1 as ok");
    console.log("✅ DB Connected");
  } catch (e) {
    console.error("❌ DB NOT Connected:", e.message);
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on ${PORT}`));
}

start();