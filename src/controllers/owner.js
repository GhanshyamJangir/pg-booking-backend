// src/controllers/owner.js
const db = require("../db");

// GET /api/owner/bookings/:ownerUserId?status=pending|accepted|rejected
exports.listBookings = async (req, res) => {
  try {
    const ownerUserId = Number(req.params.ownerUserId);
    const status = String(req.query?.status || "pending").trim();

    if (!ownerUserId) return res.status(400).json({ error: "ownerUserId required" });

    // pending tab should show:
    // 1) bookings waiting for accept/reject AFTER payment screenshot submitted
    // 2) bookings waiting for refund screenshot upload (payment_status=refund_pending)
    let extraWhere = `AND b.status=$2`;
    let params = [ownerUserId, status];

    if (status === "pending") {
      extraWhere = `
        AND (
          (b.status='pending' AND b.payment_status='submitted')
          OR (b.status='pending' AND b.payment_status='refund_pending')
        )
      `;
      params = [ownerUserId];
    }

    // accepted tab may be accepted/approved/confirmed depending on DB
    if (status === "accepted") {
      extraWhere = `AND (b.status='accepted' OR b.status='approved' OR b.status='confirmed')`;
      params = [ownerUserId];
    }

    // rejected tab may have variants depending on DB
    if (status === "rejected") {
      extraWhere = `AND (b.status='rejected' OR b.status='cancelled' OR b.status='canceled' OR b.status='declined')`;
      params = [ownerUserId];
    }

    const rows = (
      await db.query(
        `SELECT b.*,
                u.name as user_name, u.gender,
                p.name as pg_name, p.area,
                r.room_type
         FROM bookings b
         JOIN users u ON u.id=b.user_id
         JOIN pgs p ON p.id=b.pg_id
         JOIN rooms r ON r.id=b.room_id
         WHERE p.owner_id IN (SELECT id FROM owners WHERE user_id=$1)
         ${extraWhere}
         ORDER BY b.created_at DESC`,
        params
      )
    ).rows;

    res.json({ data: rows });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// POST /api/owner/bookings/:ownerUserId/:bookingId/accept
exports.acceptBooking = async (req, res) => {
  const client = await db.connect();
  try {
    const ownerUserId = Number(req.params.ownerUserId);
    const bookingId = Number(req.params.bookingId);
    if (!ownerUserId) return res.status(400).json({ error: "ownerUserId required" });
    if (!bookingId) return res.status(400).json({ error: "bookingId invalid" });

    await client.query("BEGIN");

    const booking = (
      await client.query(
        `SELECT b.*, p.owner_id
         FROM bookings b
         JOIN pgs p ON p.id=b.pg_id
         WHERE b.id=$1
         FOR UPDATE`,
        [bookingId]
      )
    ).rows[0];

    if (!booking) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "booking not found" });
    }

    // verify ownership
    const ownerRow = (await client.query(`SELECT id FROM owners WHERE user_id=$1`, [ownerUserId])).rows[0];
    if (!ownerRow || Number(ownerRow.id) !== Number(booking.owner_id)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "not your booking" });
    }

    if (String(booking.status || "") !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "booking is not in pending state" });
    }

    // Deduct beds on accept (final booking)
    const room = (
      await client.query(
        `SELECT id, available_beds
         FROM rooms
         WHERE id=$1
         FOR UPDATE`,
        [Number(booking.room_id)]
      )
    ).rows[0];

    const needBeds = Number(booking.beds_booked || 1);
    if (!room) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "room not found" });
    }
    if (Number(room.available_beds) < needBeds) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "not enough beds available to accept" });
    }

    await client.query(
      `UPDATE rooms SET available_beds = available_beds - $1 WHERE id=$2`,
      [needBeds, Number(booking.room_id)]
    );

    // NOTE: status constraint varies by DB; keep your existing accepted logic if it was already working.
    const updated = (
      await client.query(
        `UPDATE bookings
         SET status='accepted',
             decision_at=NOW(),
             owner_reason=NULL,
             payment_status='verified'
         WHERE id=$1
         RETURNING *`,
        [bookingId]
      )
    ).rows[0];

    await client.query("COMMIT");
    res.json({ data: updated });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
};

// ✅ FIXED: Reject should NOT finalize. It should open refund screenshot step.
// POST /api/owner/bookings/:ownerUserId/:bookingId/reject
exports.rejectBooking = async (req, res) => {
  try {
    const ownerUserId = Number(req.params.ownerUserId);
    const bookingId = Number(req.params.bookingId);
    const reason = String(req.body?.reason || "Rejected").trim();

    if (!ownerUserId) return res.status(400).json({ error: "ownerUserId required" });
    if (!bookingId) return res.status(400).json({ error: "bookingId invalid" });

    const booking = (await db.query(
      `SELECT b.*, p.owner_id
       FROM bookings b
       JOIN pgs p ON p.id=b.pg_id
       WHERE b.id=$1`,
      [bookingId]
    )).rows[0];

    if (!booking) return res.status(404).json({ error: "booking not found" });

    const ownerRow = (await db.query(`SELECT id FROM owners WHERE user_id=$1`, [ownerUserId])).rows[0];
    if (!ownerRow || Number(ownerRow.id) !== Number(booking.owner_id)) {
      return res.status(403).json({ error: "not your booking" });
    }

    if (String(booking.status || "") !== "pending") {
      return res.status(400).json({ error: "booking is not in pending state" });
    }

    // Only mark refund pending (NO final reject here)
    const updated = (await db.query(
      `UPDATE bookings
       SET owner_reason=$2,
           payment_status='refund_pending'
       WHERE id=$1
       RETURNING *`,
      [bookingId, reason]
    )).rows[0];

    res.json({ data: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// ✅ FIXED: Final reject happens ONLY after refund screenshot upload
// POST /api/owner/bookings/:ownerUserId/:bookingId/refund-screenshot (multipart file)
exports.uploadRefundScreenshot = async (req, res) => {
  try {
    const ownerUserId = Number(req.params.ownerUserId);
    const bookingId = Number(req.params.bookingId);
    if (!ownerUserId) return res.status(400).json({ error: "ownerUserId required" });
    if (!bookingId) return res.status(400).json({ error: "bookingId invalid" });
    if (!req.file) return res.status(400).json({ error: "file required" });

    const ownerRow = (await db.query(`SELECT id FROM owners WHERE user_id=$1`, [ownerUserId])).rows[0];
    const bk = (await db.query(
      `SELECT b.id, b.status, b.payment_status, p.owner_id
       FROM bookings b
       JOIN pgs p ON p.id=b.pg_id
       WHERE b.id=$1`,
      [bookingId]
    )).rows[0];

    if (!ownerRow || !bk || Number(ownerRow.id) !== Number(bk.owner_id)) {
      return res.status(403).json({ error: "not your booking" });
    }

    if (String(bk.status || "") !== "pending" || String(bk.payment_status || "") !== "refund_pending") {
      return res.status(400).json({ error: "booking is not waiting for refund" });
    }

    const url = `/uploads/${req.file.filename}`;

    const updated = (await db.query(
      `UPDATE bookings
       SET refund_screenshot_url=$2,
           payment_status='refunded',
           status='rejected',
           decision_at=NOW()
       WHERE id=$1
       RETURNING id, status, payment_status, refund_screenshot_url`,
      [bookingId, url]
    )).rows[0];

    res.json({ data: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// POST /api/owner/pgs  (multipart photos[])
// body: ownerUserId, name, description, pgType, address, area
exports.createPgWithPhotos = async (req, res) => {
  try {
    const ownerUserId = Number(req.body?.ownerUserId);
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const pgType =
      String(req.body?.pgType || req.body?.pg_type || "").trim();
    const address = String(req.body?.address || "").trim();
    const area = String(req.body?.area || "").trim();

    if (!ownerUserId) return res.status(400).json({ error: "ownerUserId required" });
    if (!name || !pgType || !address || !area) {
      return res.status(400).json({ error: "name, pgType, address, area required" });
    }

    const owner = (await db.query(`SELECT id FROM owners WHERE user_id=$1`, [ownerUserId])).rows[0];
    if (!owner) return res.status(400).json({ error: "owner profile not found" });

    // ✅ Max 3 PG per owner
    const existingCount = (await db.query(
      `SELECT COUNT(*)::int AS cnt FROM pgs WHERE owner_id=$1`,
      [owner.id]
    )).rows[0]?.cnt;
    if (Number(existingCount) >= 3) {
      return res.status(400).json({ error: "Maximum 3 PG allowed per owner" });
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length < 10 || files.length > 20) {
      return res.status(400).json({ error: "photos required: min 10 max 20" });
    }

    const imageUrls = files.map((f) => `/uploads/${f.filename}`);

    const pg = (
      await db.query(
        `INSERT INTO pgs (owner_id, name, description, pg_type, address, area, status, created_at, image_urls)
         VALUES ($1,$2,$3,$4,$5,$6,'approved',NOW(),$7::jsonb)
         RETURNING *`,
        [owner.id, name, description || null, pgType, address, area, JSON.stringify(imageUrls)]
      )
    ).rows[0];

    res.json({ data: pg });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};