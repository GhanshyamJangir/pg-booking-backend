const db = require("../db");
const { refundPayment } = require("../services/razorpay");

async function expirePendingBookings() {
  // Find pending bookings that expired
  const expired = (await db.query(`
    SELECT b.*, pay.id AS pay_id, pay.status AS pay_status, pay.razorpay_payment_id
    FROM bookings b
    JOIN payments pay ON pay.booking_id=b.id
    WHERE b.status='pending' AND b.expires_at < now()
    LIMIT 50
  `)).rows;

  for (const b of expired) {
    try {
      await db.withTx(async (client) => {
        // lock booking
        const booking = (await client.query(`SELECT * FROM bookings WHERE id=$1 FOR UPDATE`, [b.id])).rows[0];
        if (!booking || booking.status !== "pending") return;

        // mark expired
        await client.query(`UPDATE bookings SET status='expired', decision_at=now(), owner_reason='Auto-expired' WHERE id=$1`, [b.id]);

        // refund if paid
        const pay = (await client.query(`SELECT * FROM payments WHERE booking_id=$1 FOR UPDATE`, [b.id])).rows[0];
        if (pay && pay.status === "paid" && pay.razorpay_payment_id) {
          await refundPayment({ razorpayPaymentId: pay.razorpay_payment_id, amountInr: pay.amount });
          await client.query(`UPDATE payments SET status='refunded' WHERE id=$1`, [pay.id]);
        }
      });
    } catch (e) {
      // log only (don’t crash)
      console.error("expireBookings error:", b.id, e.message);
    }
  }
}

module.exports = { expirePendingBookings };
