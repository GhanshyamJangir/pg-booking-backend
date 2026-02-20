const BASE = "http://localhost:8080";

async function req(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(json.error ? JSON.stringify(json.error) : JSON.stringify(json));
  return json;
}

export const Api = {
  pendingBookings: (ownerUserId) => req(`/api/owner/bookings/${ownerUserId}`),

  accept: (bookingId) =>
    req(`/api/owner/bookings/${bookingId}/accept`, { method: "POST" }),

  reject: (bookingId, reason) =>
    req(`/api/owner/bookings/${bookingId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }),
};
