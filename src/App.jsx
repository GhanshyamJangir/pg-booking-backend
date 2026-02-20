// C:\pg-customer-app\src\App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = "http://127.0.0.1:8080";

const DEPOSIT_FIXED = 1000;
const PLATFORM_FIXED = 299;

function cx(...a) {
  return a.filter(Boolean).join(" ");
}

function formatDateInput(d) {
  // expects yyyy-mm-dd already or Date
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeJsonParse(v, fallback) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function money(n) {
  const x = Number(n || 0);
  return `₹${x.toLocaleString("en-IN")}`;
}

function Badge({ children }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.12)",
        fontSize: 12,
        color: "rgba(255,255,255,0.9)",
      }}
    >
      {children}
    </span>
  );
}

function Button({ children, onClick, variant = "primary", disabled, style }) {
  const base = {
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700,
    color: "white",
    background:
      variant === "primary"
        ? "linear-gradient(135deg, rgba(59,130,246,0.95), rgba(37,99,235,0.9))"
        : "rgba(255,255,255,0.06)",
    opacity: disabled ? 0.6 : 1,
    boxShadow: variant === "primary" ? "0 10px 30px rgba(37,99,235,0.25)" : "none",
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...style }}>
      {children}
    </button>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", maxLength, style }) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        maxLength={maxLength}
        style={{
          height: 44,
          padding: "0 14px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.06)",
          outline: "none",
          color: "white",
          ...style,
        }}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 44,
          padding: "0 14px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.06)",
          outline: "none",
          color: "white",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ color: "black" }}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Card({ children, style }) {
  return (
    <div
      style={{
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.20)",
        boxShadow: "0 30px 90px rgba(0,0,0,0.35)",
        padding: 18,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("search"); // search | bookings
  const [view, setView] = useState("home"); // home | details | pay
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState({ type: "", text: "" });

  // customer session
  const [customer, setCustomer] = useState(() => safeJsonParse(localStorage.getItem("pg_customer_session") || "null", null));

  // login inputs
  const [name, setName] = useState(customer?.user?.name || "");
  const [phone, setPhone] = useState(customer?.user?.phone || "");
  const [gender, setGender] = useState(customer?.user?.gender || "boy");

  // search inputs/results
  const [area, setArea] = useState("Mansarovar");
  const [searchGender, setSearchGender] = useState(customer?.user?.gender || "boy");
  const [pgs, setPgs] = useState([]);
  const [selectedPgId, setSelectedPgId] = useState(null);
  const [pgDetails, setPgDetails] = useState(null);

  // booking UI state
  const [bookingType, setBookingType] = useState("fixed"); // fixed | unlimited
  const [bedsBooked, setBedsBooked] = useState(1);
  const [startDate, setStartDate] = useState(formatDateInput(new Date()));
  const [endDate, setEndDate] = useState(formatDateInput(new Date(Date.now() + 7 * 86400000)));
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  // after create booking => payment step
  const [createdBooking, setCreatedBooking] = useState(null);
  const [ownerUpiId, setOwnerUpiId] = useState(null);

  // payment submit form
  const [customerUpiId, setCustomerUpiId] = useState("");
  const [paymentUtr, setPaymentUtr] = useState("");
  const [paymentFile, setPaymentFile] = useState(null);

  // my bookings
  const [myBookings, setMyBookings] = useState([]);

  const topBg = useMemo(() => {
    return {
      minHeight: "100vh",
      padding: 18,
      color: "white",
      background:
        "radial-gradient(1200px 800px at 10% 10%, rgba(59,130,246,0.25), transparent 55%), radial-gradient(1000px 700px at 80% 20%, rgba(99,102,241,0.18), transparent 55%), radial-gradient(800px 600px at 40% 90%, rgba(14,165,233,0.12), transparent 60%), linear-gradient(180deg, #030712, #020617)",
    };
  }, []);

  useEffect(() => {
    if (customer?.user?.gender) setSearchGender(customer.user.gender);
  }, [customer?.user?.gender]);

  function setError(msg) {
    setBanner({ type: "error", text: msg });
  }
  function setOk(msg) {
    setBanner({ type: "ok", text: msg });
  }
  function clearBanner() {
    setBanner({ type: "", text: "" });
  }

  async function apiJson(url, opts = {}) {
    const res = await fetch(url, opts);
    const text = await res.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      j = { error: text || `HTTP ${res.status}` };
    }
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
    if (j?.error) throw new Error(j.error);
    return j;
  }

  async function loginCustomer() {
    clearBanner();
    const nm = String(name || "").trim();
    const ph = String(phone || "").trim();
    const gd = String(gender || "").trim();

    if (!nm) return setError("Name required");
    if (!/^\d{10}$/.test(ph)) return setError("Phone must be 10 digits");
    if (!["boy", "girl"].includes(gd)) return setError("Gender must be boy/girl");

    setLoading(true);
    try {
      const j = await apiJson(`${API_BASE}/api/auth/customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nm, phone: ph, gender: gd }),
      });

      const sess = { user: j?.data?.user };
      setCustomer(sess);
      localStorage.setItem("pg_customer_session", JSON.stringify(sess));
      setOk(`Logged in: ${sess.user?.name} (ID: ${sess.user?.id})`);
      setTab("search");
      setView("home");
    } catch (e) {
      setError(e.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("pg_customer_session");
    setCustomer(null);
    setName("");
    setPhone("");
    setGender("boy");
    setSelectedPgId(null);
    setPgDetails(null);
    setCreatedBooking(null);
    setOwnerUpiId(null);
    setCustomerUpiId("");
    setPaymentUtr("");
    setPaymentFile(null);
    setTab("search");
    setView("home");
    setPgs([]);
    setMyBookings([]);
    setOk("Logged out");
  }

  async function searchPgs() {
    clearBanner();
    if (!customer?.user?.id) return setError("Please login first");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (area) qs.set("area", area);
      qs.set("gender", searchGender);

      const j = await apiJson(`${API_BASE}/api/pgs?${qs.toString()}`);
      setPgs(j?.data || []);
      setOk(`Results: ${(j?.data || []).length}`);
    } catch (e) {
      setError(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function openPgDetails(pgId) {
    clearBanner();
    setLoading(true);
    try {
      const j = await apiJson(`${API_BASE}/api/pgs/${pgId}`);
      setSelectedPgId(pgId);
      setPgDetails(j?.data || null);
      setSelectedRoomId(null);
      setBookingType("fixed");
      setBedsBooked(1);
      setStartDate(formatDateInput(new Date()));
      setEndDate(formatDateInput(new Date(Date.now() + 7 * 86400000)));
      // owner upi available in details
      setOwnerUpiId(j?.data?.pg?.owner_upi_id || null);
      setView("details");
    } catch (e) {
      setError(e.message || "Failed to load PG details");
    } finally {
      setLoading(false);
    }
  }

  const rooms = pgDetails?.rooms || [];
  const pg = pgDetails?.pg || null;

  const selectedRoom = useMemo(() => {
    return rooms.find((r) => String(r.id) === String(selectedRoomId)) || null;
  }, [rooms, selectedRoomId]);

  const rentAmount = Number(selectedRoom?.rent_monthly || 0);
  const totalAmount = rentAmount + DEPOSIT_FIXED + PLATFORM_FIXED;

  async function createBooking() {
    clearBanner();
    if (!customer?.user?.id) return setError("Please login first");
    if (!pg?.id) return setError("PG not selected");
    if (!selectedRoomId) return setError("Please select a room");
    if (!Number.isFinite(Number(bedsBooked)) || Number(bedsBooked) <= 0) return setError("Beds must be >= 1");

    if (bookingType === "fixed") {
      if (!startDate || !endDate) return setError("Start date and end date required");
      if (new Date(startDate).toString() === "Invalid Date") return setError("Invalid start date");
      if (new Date(endDate).toString() === "Invalid Date") return setError("Invalid end date");
    }

    setLoading(true);
    try {
      const body = {
        customerUserId: Number(customer.user.id), // ✅ REQUIRED
        pgId: Number(pg.id),
        roomId: Number(selectedRoomId),
        bookingType,
        startDate: bookingType === "fixed" ? startDate : null,
        endDate: bookingType === "fixed" ? endDate : null,
        bedsBooked: Number(bedsBooked),
      };

      const j = await apiJson(`${API_BASE}/api/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const booking = j?.data?.booking;
      setCreatedBooking(booking || null);
      const upiFromApi = j?.data?.owner_upi_id || null;
      const upiFromDetails = pg?.owner_upi_id || ownerUpiId || null;
      setOwnerUpiId(upiFromApi || upiFromDetails || null);

      // prepare payment form
      setCustomerUpiId("");
      setPaymentUtr("");
      setPaymentFile(null);

      setOk(`Booking created (ID: ${booking?.id}). Now pay via UPI and upload screenshot.`);
      setView("pay");
    } catch (e) {
      setError(e.message || "Booking failed");
    } finally {
      setLoading(false);
    }
  }

  async function submitPayment() {
    clearBanner();
    if (!createdBooking?.id) return setError("No booking to pay");
    const upi = String(customerUpiId || "").trim();
    if (!upi) return setError("Customer UPI ID required");
    if (!paymentFile) return setError("Payment screenshot required");

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("customerUpiId", upi);
      if (paymentUtr?.trim()) fd.append("utr", paymentUtr.trim());
      fd.append("screenshot", paymentFile);

      const res = await fetch(`${API_BASE}/api/bookings/${createdBooking.id}/payment`, {
        method: "POST",
        body: fd,
      });
      const text = await res.text();
      let j;
      try {
        j = JSON.parse(text);
      } catch {
        j = { error: text || `HTTP ${res.status}` };
      }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (j?.error) throw new Error(j.error);

      setOk("Payment submitted ✅ Waiting for owner accept/reject.");
      // refresh my bookings
      await loadMyBookings();
      setTab("bookings");
      setView("home");
      setCreatedBooking(null);
    } catch (e) {
      setError(e.message || "Payment submit failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadMyBookings() {
    clearBanner();
    if (!customer?.user?.id) return setError("Please login first");
    setLoading(true);
    try {
      const j = await apiJson(`${API_BASE}/api/customers/${customer.user.id}/bookings`);
      setMyBookings(j?.data || []);
      setOk("Bookings refreshed");
    } catch (e) {
      setError(e.message || "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // initial fetch results if logged in
    if (customer?.user?.id) {
      searchPgs().catch(() => {});
      loadMyBookings().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const header = (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 0.2 }}>PG Customer Panel</div>
        <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
          Jaipur only • Deposit {money(DEPOSIT_FIXED)} • Platform {money(PLATFORM_FIXED)}
        </div>
        {customer?.user?.id ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
            <Badge>Logged in: {String(customer.user.name || "").toUpperCase()}</Badge>
            <Badge>ID: {customer.user.id}</Badge>
            <Badge>Gender: {customer.user.gender}</Badge>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Button variant={tab === "search" ? "primary" : "ghost"} onClick={() => { setTab("search"); setView("home"); }}>
          Search PGs
        </Button>
        <Button
          variant={tab === "bookings" ? "primary" : "ghost"}
          onClick={() => {
            setTab("bookings");
            setView("home");
            loadMyBookings();
          }}
        >
          My Bookings
        </Button>
        {customer?.user?.id ? (
          <Button variant="ghost" onClick={logout}>
            Logout
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div style={topBg}>
      <div style={{ maxWidth: 1040, margin: "0 auto", display: "grid", gap: 16 }}>
        {header}

        {banner.text ? (
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.12)",
              background: banner.type === "error" ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.10)",
              color: "rgba(255,255,255,0.92)",
            }}
          >
            {banner.text}
          </div>
        ) : null}

        {/* LOGIN */}
        {!customer?.user?.id ? (
          <Card>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Customer Login (MVP)</div>
              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>Name + Phone + Gender (No OTP)</div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.8fr", gap: 12 }}>
                <Input label="Name" value={name} onChange={setName} placeholder="e.g. Ghanshyam" />
                <Input
                  label="Phone (10 digits)"
                  value={phone}
                  onChange={(v) => setPhone(v.replace(/[^\d]/g, "").slice(0, 10))}
                  placeholder="e.g. 9876543210"
                  maxLength={10}
                />
                <Select
                  label="Gender"
                  value={gender}
                  onChange={setGender}
                  options={[
                    { value: "boy", label: "Boy" },
                    { value: "girl", label: "Girl" },
                  ]}
                />
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button disabled={loading} onClick={loginCustomer}>
                  {loading ? "Please wait..." : "Continue"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setName("");
                    setPhone("");
                    setGender("boy");
                    clearBanner();
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {/* MAIN CONTENT */}
        {customer?.user?.id ? (
          <>
            {/* SEARCH TAB */}
            {tab === "search" ? (
              <>
                {view === "home" ? (
                  <Card>
                    <div style={{ display: "grid", gap: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 16, fontWeight: 900 }}>Search PGs</div>
                        <div style={{ display: "flex", gap: 10 }}>
                          <Button variant="ghost" onClick={searchPgs} disabled={loading}>
                            Refresh
                          </Button>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr auto auto", gap: 12, alignItems: "end" }}>
                        <Input label="Area (Jaipur)" value={area} onChange={setArea} placeholder="e.g. Mansarovar" />
                        <Select
                          label="Customer Gender"
                          value={searchGender}
                          onChange={setSearchGender}
                          options={[
                            { value: "boy", label: "Boy" },
                            { value: "girl", label: "Girl" },
                          ]}
                        />
                        <Button disabled={loading} onClick={searchPgs} style={{ height: 44 }}>
                          Search
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setArea("Mansarovar");
                            setSearchGender(customer.user.gender || "boy");
                            setPgs([]);
                            clearBanner();
                          }}
                          style={{ height: 44 }}
                        >
                          Reset
                        </Button>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                        {(pgs || []).map((it) => {
                          const images = Array.isArray(it.image_urls) ? it.image_urls : [];
                          const cover = images[0] ? `${API_BASE}${images[0]}` : null;
                          return (
                            <div
                              key={it.id}
                              style={{
                                borderRadius: 18,
                                border: "1px solid rgba(255,255,255,0.10)",
                                background: "rgba(255,255,255,0.04)",
                                overflow: "hidden",
                                cursor: "pointer",
                              }}
                              onClick={() => openPgDetails(it.id)}
                            >
                              <div
                                style={{
                                  height: 170,
                                  background: cover
                                    ? `url(${cover}) center / cover no-repeat`
                                    : "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                                  display: "grid",
                                  placeItems: "center",
                                  color: "rgba(255,255,255,0.55)",
                                  fontWeight: 800,
                                }}
                              >
                                {!cover ? "No Image" : null}
                              </div>
                              <div style={{ padding: 14, display: "grid", gap: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                  <div style={{ fontWeight: 900 }}>{it.name}</div>
                                  <Badge>{it.pg_type}</Badge>
                                </div>
                                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{it.address}</div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <Badge>{it.area}</Badge>
                                  <Badge>{images.length} photos</Badge>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </Card>
                ) : null}

                {/* DETAILS */}
                {view === "details" ? (
                  <Card>
                    <div style={{ display: "grid", gap: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontSize: 20, fontWeight: 900 }}>{pg?.name || "PG"}</div>
                          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{pg?.address}</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Badge>{pg?.pg_type}</Badge>
                            <Badge>{pg?.area}</Badge>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setView("home");
                              setPgDetails(null);
                              setSelectedPgId(null);
                              setSelectedRoomId(null);
                              clearBanner();
                            }}
                          >
                            ← Back
                          </Button>
                          <Button variant="ghost" onClick={() => openPgDetails(selectedPgId)} disabled={loading}>
                            Refresh
                          </Button>
                        </div>
                      </div>

                      {/* Photos */}
                      <div style={{ display: "grid", gap: 10 }}>
                        <div style={{ fontWeight: 900 }}>Photos</div>
                        {Array.isArray(pg?.image_urls) && pg.image_urls.length ? (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
                            {pg.image_urls.map((u, idx) => (
                              <div
                                key={idx}
                                style={{
                                  borderRadius: 14,
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  overflow: "hidden",
                                  background: "rgba(255,255,255,0.04)",
                                  height: 92,
                                }}
                              >
                                <img
                                  src={`${API_BASE}${u}`}
                                  alt="pg"
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: "rgba(255,255,255,0.6)" }}>No images saved for this PG.</div>
                        )}
                      </div>

                      {/* Booking form */}
                      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                          <Select
                            label="Booking type"
                            value={bookingType}
                            onChange={setBookingType}
                            options={[
                              { value: "fixed", label: "Fixed (dates)" },
                              { value: "unlimited", label: "Unlimited (open)" },
                            ]}
                          />
                          <Input
                            label="Beds"
                            type="number"
                            value={String(bedsBooked)}
                            onChange={(v) => setBedsBooked(Number(String(v).replace(/[^\d]/g, "")) || 1)}
                            placeholder="1"
                            style={{ appearance: "textfield" }}
                          />
                          <div />
                        </div>

                        {bookingType === "fixed" ? (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <Input label="Start date" type="date" value={startDate} onChange={setStartDate} />
                            <Input label="End date" type="date" value={endDate} onChange={setEndDate} />
                          </div>
                        ) : null}
                      </div>

                      {/* Rooms */}
                      <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 900 }}>Rooms</div>
                          <Badge>{selectedRoomId ? "Selected ✅" : "Select a room to book"}</Badge>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                          {rooms.map((r) => {
                            const isSel = String(r.id) === String(selectedRoomId);
                            const rent = Number(r.rent_monthly || 0);
                            const total = rent + DEPOSIT_FIXED + PLATFORM_FIXED;
                            return (
                              <div
                                key={r.id}
                                style={{
                                  borderRadius: 18,
                                  border: isSel ? "1px solid rgba(59,130,246,0.55)" : "1px solid rgba(255,255,255,0.10)",
                                  background: isSel ? "rgba(59,130,246,0.10)" : "rgba(255,255,255,0.04)",
                                  padding: 14,
                                  display: "grid",
                                  gap: 10,
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                                  <div style={{ fontWeight: 900 }}>{r.room_type}</div>
                                  <Badge>{r.available_beds} beds</Badge>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                                  <div style={{ color: "rgba(255,255,255,0.78)" }}>Rent: {money(rent)}</div>
                                  <div style={{ color: "rgba(255,255,255,0.78)" }}>Deposit: {money(DEPOSIT_FIXED)}</div>
                                  <div style={{ color: "rgba(255,255,255,0.78)" }}>Platform: {money(PLATFORM_FIXED)}</div>
                                  <div style={{ fontWeight: 900 }}>Total: {money(total)}</div>
                                </div>

                                <div style={{ display: "flex", gap: 10 }}>
                                  <Button variant={isSel ? "primary" : "ghost"} onClick={() => setSelectedRoomId(r.id)}>
                                    {isSel ? "Selected" : "Select"}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Footer actions */}
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 6, color: "rgba(255,255,255,0.8)", fontSize: 13 }}>
                          <div>
                            Customer: <b>{String(customer.user.name || "").toUpperCase()}</b> (ID: <b>{customer.user.id}</b>)
                          </div>
                          <div>
                            Selected Room: <b>{selectedRoomId || "-"}</b> • Type: <b>{bookingType}</b> • Beds: <b>{bedsBooked}</b>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                          <Button disabled={loading} onClick={createBooking}>
                            {loading ? "Please wait..." : "Book Now"}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setSelectedRoomId(null);
                              setBedsBooked(1);
                              setBookingType("fixed");
                              setStartDate(formatDateInput(new Date()));
                              setEndDate(formatDateInput(new Date(Date.now() + 7 * 86400000)));
                              clearBanner();
                            }}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ) : null}

                {/* PAYMENT */}
                {view === "pay" ? (
                  <Card>
                    <div style={{ display: "grid", gap: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontSize: 18, fontWeight: 900 }}>UPI Payment (Manual)</div>
                          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
                            Pay to owner UPI → upload screenshot → owner will accept/reject.
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setView("details");
                              clearBanner();
                            }}
                          >
                            ← Back
                          </Button>
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: 12 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 12 }}>
                          <div style={{ display: "grid", gap: 10 }}>
                            <div style={{ fontWeight: 900 }}>Booking Summary</div>
                            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 1.6 }}>
                              <div>
                                Booking ID: <b>{createdBooking?.id || "-"}</b>
                              </div>
                              <div>
                                PG: <b>{pg?.name || "-"}</b>
                              </div>
                              <div>
                                Room: <b>{selectedRoom?.room_type || "-"}</b>
                              </div>
                              <div>
                                Rent: <b>{money(rentAmount)}</b>
                              </div>
                              <div>
                                Deposit: <b>{money(DEPOSIT_FIXED)}</b>
                              </div>
                              <div>
                                Platform: <b>{money(PLATFORM_FIXED)}</b>
                              </div>
                              <div>
                                Total: <b>{money(totalAmount)}</b>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "grid", gap: 10 }}>
                            <div style={{ fontWeight: 900 }}>Owner UPI</div>
                            <div
                              style={{
                                padding: 14,
                                borderRadius: 16,
                                border: "1px solid rgba(255,255,255,0.12)",
                                background: "rgba(255,255,255,0.04)",
                                fontWeight: 900,
                                wordBreak: "break-word",
                              }}
                            >
                              {ownerUpiId ? ownerUpiId : "UPI not added by owner yet"}
                            </div>

                            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
                              Owner UPI empty ho to owner panel → Owner Profile me UPI ID save karo.
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <Input
                            label="Your UPI ID (for refund)"
                            value={customerUpiId}
                            onChange={setCustomerUpiId}
                            placeholder="e.g. ghanshyam@upi"
                          />
                          <Input
                            label="UTR / Ref No (optional)"
                            value={paymentUtr}
                            onChange={setPaymentUtr}
                            placeholder="e.g. 123456789012"
                          />
                        </div>

                        <label style={{ display: "grid", gap: 8 }}>
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Upload payment screenshot</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setPaymentFile(e.target.files?.[0] || null)}
                            style={{
                              height: 44,
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.14)",
                              background: "rgba(255,255,255,0.06)",
                              color: "rgba(255,255,255,0.85)",
                            }}
                          />
                        </label>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <Button disabled={loading} onClick={submitPayment}>
                            {loading ? "Please wait..." : "Submit Payment"}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setCustomerUpiId("");
                              setPaymentUtr("");
                              setPaymentFile(null);
                              clearBanner();
                            }}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ) : null}
              </>
            ) : null}

            {/* BOOKINGS TAB */}
            {tab === "bookings" ? (
              <Card>
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 16, fontWeight: 900 }}>My Bookings</div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <Button variant="ghost" onClick={loadMyBookings} disabled={loading}>
                        Refresh
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setTab("search");
                          setView("home");
                        }}
                      >
                        Back
                      </Button>
                    </div>
                  </div>

                  <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
                    Customer: <b>{String(customer.user.name || "").toUpperCase()}</b> (ID: <b>{customer.user.id}</b>)
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                    {(myBookings || []).map((b) => {
                      const imgs = Array.isArray(b.image_urls) ? b.image_urls : [];
                      const cover = imgs[0] ? `${API_BASE}${imgs[0]}` : null;

                      return (
                        <div
                          key={b.id}
                          style={{
                            borderRadius: 18,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background: "rgba(255,255,255,0.04)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: 140,
                              background: cover
                                ? `url(${cover}) center / cover no-repeat`
                                : "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                              display: "grid",
                              placeItems: "center",
                              color: "rgba(255,255,255,0.55)",
                              fontWeight: 800,
                            }}
                          >
                            {!cover ? "No Image" : null}
                          </div>
                          <div style={{ padding: 14, display: "grid", gap: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ fontWeight: 900 }}>{b.pg_name || "PG"}</div>
                              <Badge>{b.status}</Badge>
                            </div>

                            <div style={{ display: "grid", gap: 6, color: "rgba(255,255,255,0.78)", fontSize: 13 }}>
                              <div>
                                Booking #{b.id} • Room: <b>{b.room_type}</b>
                              </div>
                              <div>
                                Type: <b>{b.booking_type}</b> • Beds: <b>{b.beds_booked}</b>
                              </div>
                              <div>
                                Dates:{" "}
                                <b>
                                  {b.start_date ? String(b.start_date).slice(0, 10) : "-"} →{" "}
                                  {b.end_date ? String(b.end_date).slice(0, 10) : "-"}
                                </b>
                              </div>
                              <div style={{ fontWeight: 900 }}>Total: {money(b.total_amount)}</div>
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <Badge>Payment: {b.payment_status || "pending"}</Badge>
                              <Badge>Refund: {b.refund_status || "none"}</Badge>
                            </div>

                            {b.payment_screenshot_url ? (
                              <div style={{ display: "grid", gap: 8 }}>
                                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Payment screenshot</div>
                                <a
                                  href={`${API_BASE}${b.payment_screenshot_url}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: "rgba(59,130,246,1)", fontWeight: 800 }}
                                >
                                  Open
                                </a>
                              </div>
                            ) : null}

                            {b.refund_screenshot_url ? (
                              <div style={{ display: "grid", gap: 8 }}>
                                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Refund screenshot</div>
                                <a
                                  href={`${API_BASE}${b.refund_screenshot_url}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: "rgba(34,197,94,1)", fontWeight: 800 }}
                                >
                                  Open
                                </a>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {!myBookings.length ? <div style={{ color: "rgba(255,255,255,0.65)" }}>No bookings yet.</div> : null}
                </div>
              </Card>
            ) : null}
          </>
        ) : null}

        {/* Footer note */}
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, paddingBottom: 12 }}>
          Tip: If you see “Failed to fetch”, ensure backend is running at <b>{API_BASE}</b>.
        </div>
      </div>
    </div>
  );
}
