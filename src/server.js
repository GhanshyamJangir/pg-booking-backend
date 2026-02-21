require("dotenv").config();
const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const db = require("./db");

const app = express();

const allowedOrigins = (
  process.env.FRONTEND_ORIGINS ||
  "https://ghanshyamjangir.github.io"
)
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // allow anyway (prevents CORS crash)
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("PG Booking Backend OK");
});

app.use("/api", routes);

app.use((err, req, res, next) => {
  console.error("❌ API Error:", err);
  res.status(400).json({ error: err.message || "Unknown error" });
});

const PORT = process.env.PORT || 8080;

async function start() {
  try {
    await db.query("SELECT 1");
    console.log("✅ DB Connected");
  } catch (e) {
    console.error("❌ DB NOT Connected:", e.message);
  }

  app.listen(PORT, () =>
    console.log(`✅ Server running on ${PORT}`)
  );
}

start();