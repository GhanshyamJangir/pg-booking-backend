// src/controllers/customer_my_bookings.js
const db = require("../db");

// GET /api/customer/bookings/:userId?status=pending
exports.listMyBookings = async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const status = (req.query.status || "").toString().trim().toLowerCase();
    const allowed = ["pending", "accepted", "rejected", "cancelled"];

    const params = [userId];
    let where = `WHERE b.user_id = $1`;

    if (status) {
      if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status filter" });
      params.push(status);
      where += ` AND b.status = $${params.length}`;
    }

    const rows = (
      await db.query(
        `
        SELECT
          b.id, b.status, b.booking_type, b.start_date, b.end_date,
          b.rent_amount, b.deposit_amount, b.platform_fee, b.total_amount,
          b.customer_upi, b.owner_upi, b.payment_status,
          b.payment_screenshot_url, b.refund_screenshot_url,
          b.created_at,
          p.id as pg_id, p.name as pg_name, p.area, p.address, p.pg_type,
          r.id as room_id, r.room_type, r.rent_monthly
        FROM bookings b
        JOIN pgs p ON p.id = b.pg_id
        JOIN rooms r ON r.id = b.room_id
        ${where}
        ORDER BY b.created_at DESC
        `,
        params
      )
    ).rows;

    res.json({ data: rows });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// POST /api/customer/bookings/:bookingId/cancel  body: { user_id }
exports.cancelBooking = async (req, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const userId = Number(req.body?.user_id);

    if (!bookingId) return res.status(400).json({ error: "Invalid bookingId" });
    if (!userId) return res.status(400).json({ error: "user_id required" });

    const booking = (
      await db.query(`SELECT id, user_id, status FROM bookings WHERE id=$1`, [bookingId])
    ).rows[0];

    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (Number(booking.user_id) !== Number(userId)) return res.status(403).json({ error: "Not your booking" });

    if (booking.status !== "pending") {
      return res.status(400).json({ error: "Only pending booking can be cancelled" });
    }

    const row = (
      await db.query(
        `UPDATE bookings SET status='cancelled' WHERE id=$1 RETURNING id, status`,
        [bookingId]
      )
    ).rows[0];

    // payments table may or may not exist in different DB versions
    try {
      await db.query(`UPDATE payments SET status='cancelled' WHERE booking_id=$1`, [bookingId]);
    } catch {}

    res.json({ data: row });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};