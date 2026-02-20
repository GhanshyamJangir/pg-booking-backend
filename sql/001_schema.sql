-- Users
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  phone TEXT UNIQUE NOT NULL,
  gender TEXT CHECK (gender IN ('boy','girl')) NOT NULL,
  role TEXT CHECK (role IN ('customer','owner','admin')) NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Owners profile
CREATE TABLE IF NOT EXISTS owners (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kyc_status TEXT CHECK (kyc_status IN ('pending','verified','rejected')) NOT NULL DEFAULT 'pending',
  upi_id TEXT,
  bank_account TEXT,
  ifsc TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PG listings
CREATE TABLE IF NOT EXISTS pgs (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  pg_type TEXT CHECK (pg_type IN ('boys','girls','both')) NOT NULL,
  address TEXT NOT NULL,
  area TEXT NOT NULL, -- Jaipur locality e.g., Mansarovar
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  amenities JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT CHECK (status IN ('pending','approved','rejected','suspended')) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rooms (inventory by beds)
CREATE TABLE IF NOT EXISTS rooms (
  id BIGSERIAL PRIMARY KEY,
  pg_id BIGINT NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  room_type TEXT CHECK (room_type IN ('single','double','triple','dorm')) NOT NULL,
  rent_monthly INT NOT NULL CHECK (rent_monthly > 0),
  total_beds INT NOT NULL CHECK (total_beds > 0),
  available_beds INT NOT NULL CHECK (available_beds >= 0),
  amenities JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pg_id BIGINT NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,

  booking_type TEXT CHECK (booking_type IN ('fixed','unlimited')) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE, -- nullable for unlimited

  beds_booked INT NOT NULL DEFAULT 1 CHECK (beds_booked >= 1),

  rent_amount INT NOT NULL CHECK (rent_amount >= 0),
  deposit_amount INT NOT NULL CHECK (deposit_amount >= 0),
  platform_fee INT NOT NULL CHECK (platform_fee >= 0),
  total_amount INT NOT NULL CHECK (total_amount >= 0),

  status TEXT CHECK (status IN ('pending','accepted','rejected','cancelled','checked_in','checked_out','expired')) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL, -- created + 24h
  owner_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decision_at TIMESTAMPTZ
);

-- Payments (Razorpay)
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  status TEXT CHECK (status IN ('created','paid','failed','refunded')) NOT NULL DEFAULT 'created',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_pgs_area_status ON pgs(area, status);
CREATE INDEX IF NOT EXISTS idx_bookings_status_expires ON bookings(status, expires_at);
