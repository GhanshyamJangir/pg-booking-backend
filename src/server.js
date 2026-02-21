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

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ SINGLE uploads folder (project root)
const uploadDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Serve same uploads folder
app.use("/uploads", express.static(uploadDir));

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
  app.listen(PORT, () => console.log(`✅ Server running on ${PORT}`));
}

start();