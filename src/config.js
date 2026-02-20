require("dotenv").config();

module.exports = {
  PORT: Number(process.env.PORT || 8080),
  DATABASE_URL: process.env.DATABASE_URL,

  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,

  // ✅ Fixed pricing (your requested change)
  FIXED_DEPOSIT_INR: 1000,
  FIXED_PLATFORM_FEE_INR: 299,

  // 24-hour owner decision window
  BOOKING_EXPIRY_HOURS: 24
};
