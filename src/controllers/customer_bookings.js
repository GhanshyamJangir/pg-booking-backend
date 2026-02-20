// src/controllers/customer_bookings.js
const db = require("../db");

const DEPOSIT_FIXED = 1000;
const PLATFORM_FIXED = 299;

exports.createBooking = async (req, res) => {
  const client = await db.connect();
  try {
    const user_id = Number(req.body?.user_id);
    const pg_id = Number(req.body?.pg_id);
    const room_id = Number(req.body?.room_id);
    const booking_type = String(req.body?.booking_type || "fixed");
    const beds_booked = Number(req.body?.beds_booked || 1);

    const start_date_raw = req.body?.start_date;
    const end_date_raw = req.body?.end_date;

    const customer_upi = String(req.body?.customer_upi || req.body?.customerUpi || "").trim();

    if (!user_id || !pg_id || !room_id) {
      return res.status(400).json({ error: "user_id, pg_id, room_id required" });
    }
    if (!start_date_raw) return res.status(400).json({ error: "start_date required" });

    if (!customer_upi) {
      return res.status(400).json({ error: "customer_upi required" });
    }

    if (!["fixed", "unlimited"].includes(booking_type)) {
      return res.status(400).json({ error: "booking_type must be fixed/unlimited" });
    }

    const start_date = new Date(start_date_raw);
    if (isNaN(start_date.getTime())) return res.status(400).json({ error: "Invalid start_date" });

    let end_date = null;
    if (booking_type === "fixed") {
      if (!end_date_raw) return res.status(400).json({ error: "end_date required for fixed" });
      end_date = new Date(end_date_raw);
      if (isNaN(end_date.getTime())) return res.status(400).json({ error: "Invalid end_date" });
      if (end_date < start_date) return res.status(400).json({ error: "end_date must be >= start_date" });
    }

    if (!Number.isFinite(beds_booked) || beds_booked < 1) {
      return res.status(400).json({ error: "beds_booked must be >= 1" });
    }

    await client.query("BEGIN");

    // PG approved check
    const pg = (
      await client.query(
        `SELECT p.id, p.owner_id, o.upi_id as owner_upi
         FROM pgs p
         LEFT JOIN owners o ON o.id = p.owner_id
         WHERE p.id=$1 AND p.status='approved'`,
        [pg_id]
      )
    ).rows[0];

    if (!pg) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "PG not found/approved" });
    }

    // Room check
    const room = (
      await client.query(
        `SELECT id, pg_id, rent_monthly, available_beds
         FROM rooms
         WHERE id=$1 AND pg_id=$2`,
        [room_id, pg_id]
      )
    ).rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Room not found" });
    }
    if (Number(room.available_beds) < beds_booked) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Not enough beds available" });
    }

    const rent_amount = Number(room.rent_monthly) || 0;
    const deposit_amount = DEPOSIT_FIXED;
    const platform_fee = PLATFORM_FIXED;
    const total_amount = rent_amount + deposit_amount + platform_fee;

    // keep same style: expires_at set (24h)
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const owner_upi = String(pg?.owner_upi || "").trim() || null;

    // Create booking (pending + payment pending)
    const inserted = (
      await client.query(
        `INSERT INTO bookings
          (user_id, pg_id, room_id, booking_type, start_date, end_date, beds_booked,
           rent_amount, deposit_amount, platform_fee, total_amount,
           status, expires_at, created_at,
           customer_upi, owner_upi, payment_status, payment_screenshot_url, refund_screenshot_url)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,
           $8,$9,$10,$11,
           'pending',$12,NOW(),
           $13,$14,'pending',NULL,NULL)
         RETURNING id, user_id, pg_id, room_id, booking_type, start_date, end_date,
                   beds_booked, rent_amount, deposit_amount, platform_fee, total_amount,
                   status, expires_at, created_at, customer_upi, owner_upi, payment_status,
                   payment_screenshot_url, refund_screenshot_url`,
        [
          user_id,
          pg_id,
          room_id,
          booking_type,
          start_date.toISOString(),
          booking_type === "fixed" ? end_date.toISOString() : null,
          beds_booked,
          rent_amount,
          deposit_amount,
          platform_fee,
          total_amount,
          expires_at.toISOString(),
          customer_upi,
          owner_upi,
        ]
      )
    ).rows[0];

    // reduce beds now (owner reject adds back in owner.js)
    await client.query(
      `UPDATE rooms SET available_beds = available_beds - $1 WHERE id=$2`,
      [beds_booked, room_id]
    );

    // optional payments table insert (same as old behavior)
    try {
      await client.query(
        `INSERT INTO payments (booking_id, amount, status, razorpay_order_id, razorpay_payment_id, created_at)
         VALUES ($1,$2,$3,NULL,NULL,NOW())`,
        [inserted.id, total_amount, "created"]
      );
    } catch (e) {
      console.log("⚠ payments insert skipped (constraint/structure):", e.message);
    }

    await client.query("COMMIT");

    // ✅ IMPORTANT: bookingId provide so frontend can do: res.data.bookingId
    res.json({
      bookingId: inserted.id,
      data: inserted,
      payment: {
        mode: "upi",
        status: "pending",
        ownerUpi: owner_upi,
        note: owner_upi
          ? "Pay to owner UPI and upload screenshot."
          : "Owner UPI not set yet. Owner should add UPI in profile.",
      },
    });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
};

// POST /api/customer/bookings/:bookingId/payment-screenshot (multipart form-data, field: file)
exports.uploadPaymentScreenshot = async (req, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const user_id = Number(req.body?.user_id || req.body?.userId || req.body?.customerUserId);

    if (!bookingId) return res.status(400).json({ error: "Invalid bookingId" });
    if (!user_id) return res.status(400).json({ error: "user_id required" });
    if (!req.file) return res.status(400).json({ error: "file required" });

    const booking = (
      await db.query(`SELECT id, user_id, status, payment_status FROM bookings WHERE id=$1`, [bookingId])
    ).rows[0];

    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (Number(booking.user_id) !== Number(user_id)) return res.status(403).json({ error: "Not your booking" });

    if (String(booking.status) !== "pending") {
      return res.status(400).json({ error: "Only pending booking can upload payment screenshot" });
    }

    const url = `/uploads/${req.file.filename}`;

    const updated = (
      await db.query(
        `UPDATE bookings
         SET payment_screenshot_url=$2,
             payment_status='submitted'
         WHERE id=$1
         RETURNING id, payment_status, payment_screenshot_url`,
        [bookingId, url]
      )
    ).rows[0];

    res.json({ data: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
