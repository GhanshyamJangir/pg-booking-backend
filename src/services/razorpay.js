const Razorpay = require("razorpay");
const crypto = require("crypto");
const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = require("../config");

const rzp = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
});

async function createOrder({ amountInr, receipt }) {
  // Razorpay amount is in paise
  const order = await rzp.orders.create({
    amount: amountInr * 100,
    currency: "INR",
    receipt
  });
  return order; // {id, amount, ...}
}

function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");
  return expected === signature;
}

async function refundPayment({ razorpayPaymentId, amountInr }) {
  // You can refund partial/full. MVP: full refund
  return rzp.payments.refund(razorpayPaymentId, { amount: amountInr * 100 });
}

module.exports = { createOrder, verifyPaymentSignature, refundPayment };
