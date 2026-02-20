// src/controllers/bookings.js
const db = require("../db");

const FIXED_DEPOSIT = 1000;
const FIXED_PLATFORM = 299;

// POST /api/bookings
// body: { customerUserId, pgId, roomId, bookingType, startDate, endDate, bedsBooked, customerUpi }
exports.create = async (req, res) => {
  const client = await db.connect();
  try {
    const customerUserId = Number(req.body?.customerUserId);
    const pgId = Number(req.body?.pgId);
    const roomId = Number(req.body?.roomId);
    const bookingType = String(req.body?.bookingType || "fixed").trim(); // fixed/unlimited
    const startDate = req.body?.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body?.endDate ? new Date(req.body.endDate) : null;
    const bedsBooked = Number(req.body?.bedsBooked || 1);
    const customerUpi = String(req.body?.customerUpi || "").trim();

    if (!customerUserId || !pgId || !roomId) {
      return res.status(400).json({ error: "customerUserId, pgId, roomId required" });
    }
    if (!customerUpi) {
      return res.status(400).json({ error: "customerUpi required" });
    }
    if (!Number.isFinite(bedsBooked) || bedsBooked <= 0) {
      return res.status(400).json({ error: "bedsBooked invalid" });
    }
    if (bookingType === "fixed") {
      if (!startDate || !endDate) return res.status(400).json({ error: "startDate & endDate required for fixed" });
    }

    await client.query("BEGIN");

    // room details
    const room = (await client.query(
      `SELECT id, pg_id, room_type, rent_monthly, total_beds, available_beds
       FROM rooms WHERE id=$1 AND pg_id=$2`,
      [roomId, pgId]
    )).rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "room not found" });
    }
    if (room.available_beds < bedsBooked) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "not enough beds available" });
    }

    // owner upi from owners table via pg.owner_id -> owners.user_id?
    const pg = (await client.query(
      `SELECT p.id, p.owner_id, p.name,
              o.upi_id as owner_upi
       FROM pgs p
       LEFT JOIN owners o ON o.id = p.owner_id
       WHERE p.id=$1`,
      [pgId]
    )).rows[0];

    // If owner upi missing, still allow booking (owner can add later)
    const ownerUpi = String(pg?.owner_upi || "").trim() || null;

    const rentAmount = Number(room.rent_monthly || 0);
    const depositAmount = FIXED_DEPOSIT;
    const platformFee = FIXED_PLATFORM;
    const totalAmount = rentAmount + depositAmount + platformFee;

    // create booking (DON'T touch payments table)
    const booking = (await client.query(
      `INSERT INTO bookings
        (user_id, pg_id, room_id, booking_type, start_date, end_date, beds_booked,
         rent_amount, deposit_amount, platform_fee, total_amount,
         status, expires_at, owner_reason, created_at, decision_at,
         customer_upi, owner_upi, payment_status, payment_screenshot_url, refund_screenshot_url)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,
         $8,$9,$10,$11,
         'pending', NOW() + INTERVAL '30 minutes', NULL, NOW(), NULL,
         $12,$13,'pending',NULL,NULL)
       RETURNING *`,
      [
        customerUserId,
        pgId,
        roomId,
        bookingType,
        startDate,
        endDate,
        bedsBooked,
        rentAmount,
        depositAmount,
        platformFee,
        totalAmount,
        customerUpi,
        ownerUpi,
      ]
    )).rows[0];

    // reduce beds immediately for MVP (or you can reduce after accept; your choice)
    await client.query(
      `UPDATE rooms SET available_beds = available_beds - $1 WHERE id=$2`,
      [bedsBooked, roomId]
    );

    await client.query("COMMIT");

    res.json({
      data: {
        id: booking.id, // ✅ added (fix Booking ID: undefined)
        booking,
        payment: {
          ownerUpi: ownerUpi,
          note: ownerUpi
            ? "Customer should pay to owner UPI and upload screenshot."
            : "Owner UPI not set yet. Owner should add UPI in profile.",
        },
      },
    });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
};

// POST /api/bookings/:id/payment-screenshot (multipart form-data, field name: file)
exports.uploadPaymentScreenshot = async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    if (!bookingId) return res.status(400).json({ error: "bookingId invalid" });
    if (!req.file) return res.status(400).json({ error: "file required" });

    const url = `/uploads/${req.file.filename}`;

    const updated = (await db.query(
      `UPDATE bookings
       SET payment_screenshot_url=$2,
           payment_status='submitted'
       WHERE id=$1
       RETURNING id, payment_status, payment_screenshot_url`,
      [bookingId, url]
    )).rows[0];

    res.json({ data: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// GET /api/bookings/customer/:customerUserId
exports.listByCustomer = async (req, res) => {
  try {
    const customerUserId = Number(req.params.customerUserId);
    if (!customerUserId) return res.status(400).json({ error: "customerUserId invalid" });

    const rows = (await db.query(
      `SELECT b.*,
              p.name as pg_name, p.area,
              r.room_type
       FROM bookings b
       JOIN pgs p ON p.id=b.pg_id
       JOIN rooms r ON r.id=b.room_id
       WHERE b.user_id=$1
       ORDER BY b.created_at DESC`,
      [customerUserId]
    )).rows;

    res.json({ data: rows });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
