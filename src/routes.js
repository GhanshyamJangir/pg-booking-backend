// src/routes.js
const express = require("express");
const path = require("path");
const multer = require("multer");

const auth = require("./controllers/auth");
const pgs = require("./controllers/pgs");
const bookings = require("./controllers/bookings");
const owner = require("./controllers/owner");

// ✅ added (customer panel routes wiring)
const customerBookings = require("./controllers/customer_bookings");
const customerMyBookings = require("./controllers/customer_my_bookings");

// ✅ added (for /owner/pgs, /owner/rooms, /owner/profile)
const db = require("./db");

const router = express.Router();

// multer setup (all screenshots/photos)
const storage = multer.diskStorage({
  // ✅ FIX: save into project-root /uploads (NOT src/uploads)
  destination: (req, file, cb) => cb(null, path.join(__dirname, "..", "uploads")),
  filename: (req, file, cb) => {
    const safe = String(file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per file
});

// -------- AUTH --------
router.post("/auth/customer", auth.customerLogin);
router.post("/auth/owner", auth.ownerLogin);

// -------- PUBLIC PGs --------
router.get("/pgs", pgs.list);
router.get("/pgs/:id", pgs.details);

// -------- CUSTOMER BOOKINGS (UPI MVP) --------
router.post("/bookings", bookings.create); // create booking with customer_upi
router.post("/bookings/:id/payment-screenshot", upload.single("file"), bookings.uploadPaymentScreenshot);
router.get("/bookings/customer/:customerUserId", bookings.listByCustomer);

// ✅ customer panel expects these:
router.post("/customer/bookings", customerBookings.createBooking);
router.get("/customer/bookings/:userId", customerMyBookings.listMyBookings);
router.post("/customer/bookings/:bookingId/cancel", customerMyBookings.cancelBooking);

// ✅ customer payment screenshot upload (NOW WORKS)
router.post(
  "/customer/bookings/:bookingId/payment-screenshot",
  upload.single("file"),
  customerBookings.uploadPaymentScreenshot
);

// -------- OWNER BOOKINGS --------
router.get("/owner/bookings/:ownerUserId", owner.listBookings);
router.post("/owner/bookings/:ownerUserId/:bookingId/accept", owner.acceptBooking);
router.post("/owner/bookings/:ownerUserId/:bookingId/reject", owner.rejectBooking);

// compatibility routes (owner panel calling without ownerUserId)
router.post("/owner/bookings/:bookingId/accept", (req, res, next) => {
  req.params.ownerUserId =
    req.body?.ownerUserId ||
    req.body?.owner_user_id ||
    req.query?.ownerUserId ||
    req.query?.owner_user_id;
  return owner.acceptBooking(req, res, next);
});

router.post("/owner/bookings/:bookingId/reject", (req, res, next) => {
  req.params.ownerUserId =
    req.body?.ownerUserId ||
    req.body?.owner_user_id ||
    req.query?.ownerUserId ||
    req.query?.owner_user_id;
  return owner.rejectBooking(req, res, next);
});

// refund screenshot (owner uploads after manual refund)
router.post(
  "/owner/bookings/:ownerUserId/:bookingId/refund-screenshot",
  upload.single("file"),
  owner.uploadRefundScreenshot
);

// compatibility route (without ownerUserId)
router.post(
  "/owner/bookings/:bookingId/refund-screenshot",
  upload.single("file"),
  (req, res, next) => {
    req.params.ownerUserId =
      req.body?.ownerUserId ||
      req.body?.owner_user_id ||
      req.query?.ownerUserId ||
      req.query?.owner_user_id;
    return owner.uploadRefundScreenshot(req, res, next);
  }
);

// Owner create PG with photos (if you already had it, keep; if not, enable)
router.post("/owner/pgs", upload.array("photos", 20), owner.createPgWithPhotos);

// ✅ FIX 1: Owner Panel dropdown (Cannot GET /api/owner/pgs)
router.get("/owner/pgs", async (req, res) => {
  try {
    const ownerUserId = Number(req.query?.ownerUserId || req.query?.ownerId || req.query?.userId || req.query?.user_id);
    if (!ownerUserId) return res.json({ data: [] });

    const rows = (
      await db.query(
        `
        SELECT p.*
        FROM pgs p
        LEFT JOIN owners o ON o.id = p.owner_id
        WHERE o.user_id = $1 OR p.owner_id = $1
        ORDER BY p.id DESC
        `,
        [ownerUserId]
      )
    ).rows;

    res.json({ data: rows });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ✅ FIX 2: Add Room (Cannot POST /api/owner/rooms)
router.post("/owner/rooms", async (req, res) => {
  try {
    const pgId = Number(req.body?.pgId || req.body?.pg_id);
    const roomType = String(req.body?.roomType || req.body?.room_type || "").trim();
    const rentMonthly = Number(req.body?.rentMonthly || req.body?.rent_monthly);
    const totalBeds = Number(req.body?.totalBeds || req.body?.total_beds);
    const availableBeds = Number(req.body?.availableBeds || req.body?.available_beds);

    if (!pgId) return res.status(400).json({ error: "pgId required" });
    if (!roomType) return res.status(400).json({ error: "roomType required" });
    if (!Number.isFinite(rentMonthly)) return res.status(400).json({ error: "rentMonthly invalid" });
    if (!Number.isFinite(totalBeds) || totalBeds <= 0) return res.status(400).json({ error: "totalBeds invalid" });
    if (!Number.isFinite(availableBeds) || availableBeds < 0) return res.status(400).json({ error: "availableBeds invalid" });

    const inserted = (
      await db.query(
        `INSERT INTO rooms (pg_id, room_type, rent_monthly, total_beds, available_beds)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING *`,
        [pgId, roomType, rentMonthly, totalBeds, availableBeds]
      )
    ).rows[0];

    res.json({ data: inserted });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ✅ FIX 3: Owner Profile Save (Cannot POST /api/owner/profile)
router.post("/owner/profile", async (req, res) => {
  try {
    const ownerUserId = Number(req.body?.ownerUserId || req.body?.user_id || req.body?.userId);
    const upi_id = String(req.body?.upi_id || req.body?.upi || req.body?.upiId || "").trim();
    const bank_account = String(req.body?.bank_account || req.body?.bankAccount || "").trim();
    const ifsc = String(req.body?.ifsc || "").trim();

    if (!ownerUserId) return res.status(400).json({ error: "ownerUserId required" });

    const existing = (await db.query(`SELECT id FROM owners WHERE user_id=$1`, [ownerUserId])).rows[0];

    let saved;
    if (!existing) {
      saved = (
        await db.query(
          `INSERT INTO owners (user_id, upi_id, bank_account, ifsc)
           VALUES ($1,$2,$3,$4)
           RETURNING id, user_id, upi_id, bank_account, ifsc`,
          [ownerUserId, upi_id || null, bank_account || null, ifsc || null]
        )
      ).rows[0];
    } else {
      saved = (
        await db.query(
          `UPDATE owners
           SET upi_id=$2, bank_account=$3, ifsc=$4
           WHERE user_id=$1
           RETURNING id, user_id, upi_id, bank_account, ifsc`,
          [ownerUserId, upi_id || null, bank_account || null, ifsc || null]
        )
      ).rows[0];
    }

    res.json({ data: saved });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;