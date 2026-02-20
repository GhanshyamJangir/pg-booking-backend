const { FIXED_DEPOSIT_INR, FIXED_PLATFORM_FEE_INR } = require("../config");

function daysBetween(startDate, endDate) {
  const s = new Date(startDate);
  const e = new Date(endDate);
  const ms = e.getTime() - s.getTime();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return Math.max(days, 0);
}

// MVP rule: monthlyRent / 30 per day
function calculateRentAmount({ bookingType, rentMonthly, startDate, endDate }) {
  const perDay = Math.round(rentMonthly / 30);

  if (bookingType === "unlimited") {
    // First month upfront
    return rentMonthly;
  }

  const days = daysBetween(startDate, endDate);
  return perDay * days;
}

function priceBreakup({ bookingType, rentMonthly, startDate, endDate }) {
  const rentAmount = calculateRentAmount({ bookingType, rentMonthly, startDate, endDate });
  const depositAmount = FIXED_DEPOSIT_INR;      // ✅ fixed 1000
  const platformFee = FIXED_PLATFORM_FEE_INR;   // ✅ fixed 299
  const totalAmount = rentAmount + depositAmount + platformFee;

  return { rentAmount, depositAmount, platformFee, totalAmount };
}

module.exports = { priceBreakup };
