// src/controllers/owner_pgs.js
const db = require("../db");

async function getOwnerIdByUserId(ownerUserId) {
  const row = (await db.query(`SELECT id FROM owners WHERE user_id=$1`, [ownerUserId])).rows[0];
  return row?.id || null;
}

// GET /api/owner/pgs/:ownerUserId
exports.listOwnerPgs = async (req, res) => {
  try {
    const ownerUserId = Number(req.params.ownerUserId);
    if (!ownerUserId) return res.status(400).json({ error: "Invalid ownerUserId" });

    const ownerId = await getOwnerIdByUserId(ownerUserId);
    if (!ownerId) return res.status(404).json({ error: "Owner not found" });

    const rows = (
      await db.query(
        `SELECT id, name, description, pg_type, address, area, status, image_urls, created_at
         FROM pgs
         WHERE owner_id=$1
         ORDER BY created_at DESC`,
        [ownerId]
      )
    ).rows;

    res.json({ data: rows });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// POST /api/owner/pgs  (multipart/form-data) create with images
exports.createPgWithImages = async (req, res) => {
  try {
    const ownerUserId = Number(req.body?.ownerUserId);
    const name = (req.body?.name || "").toString().trim();
    const description = (req.body?.description || "").toString().trim();
    const pg_type = (req.body?.pg_type || "").toString().trim();
    const address = (req.body?.address || "").toString().trim();
    const area = (req.body?.area || "").toString().trim();

    if (!ownerUserId || !name || !pg_type || !address || !area) {
      return res.status(400).json({ error: "ownerUserId, name, pg_type, address, area required" });
    }
    if (!["boys", "girls", "both"].includes(pg_type)) {
      return res.status(400).json({ error: "pg_type must be boys/girls/both" });
    }

    const jaipurOk =
      `${address} ${area}`.toLowerCase().includes("jaipur") || area.toLowerCase().includes("jaipur");
    if (!jaipurOk) {
      return res.status(400).json({ error: "Only Jaipur allowed currently. Address/Area must include 'Jaipur'." });
    }

    const ownerId = await getOwnerIdByUserId(ownerUserId);
    if (!ownerId) return res.status(404).json({ error: "Owner not found" });

    const files = req.files || [];
    if (files.length < 10 || files.length > 20) {
      return res.status(400).json({ error: "Upload minimum 10 and maximum 20 photos" });
    }

    const imageUrls = files.map((f) => `/uploads/${f.filename}`);

    // ✅ jsonb safe insert
    const row = (
      await db.query(
        `INSERT INTO pgs
          (owner_id, name, description, pg_type, address, area, amenities, rules, status, image_urls)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,'approved',$9::jsonb)
         RETURNING id, name, pg_type, address, area, status, image_urls`,
        [
          ownerId,
          name,
          description || null,
          pg_type,
          address,
          area,
          {},
          {},
          JSON.stringify(imageUrls),
        ]
      )
    ).rows[0];

    res.json({ data: row });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// ✅ NEW: POST /api/owner/pgs/:pgId/images  (add images to existing PG)
exports.addPgImages = async (req, res) => {
  try {
    const pgId = Number(req.params.pgId);
    const ownerUserId = Number(req.body?.ownerUserId);

    if (!pgId) return res.status(400).json({ error: "Invalid pgId" });
    if (!ownerUserId) return res.status(400).json({ error: "ownerUserId required" });

    const ownerId = await getOwnerIdByUserId(ownerUserId);
    if (!ownerId) return res.status(404).json({ error: "Owner not found" });

    const pg = (
      await db.query(`SELECT id, image_urls FROM pgs WHERE id=$1 AND owner_id=$2`, [pgId, ownerId])
    ).rows[0];
    if (!pg) return res.status(403).json({ error: "PG not found for this owner" });

    const files = req.files || [];
    if (files.length < 1) return res.status(400).json({ error: "At least 1 photo required" });

    const newUrls = files.map((f) => `/uploads/${f.filename}`);

    // pg.image_urls can be jsonb array OR null
    const existing = Array.isArray(pg.image_urls) ? pg.image_urls : [];

    const merged = [...existing, ...newUrls];

    if (merged.length > 20) {
      return res.status(400).json({ error: `Total photos max 20 allowed. Current total would be ${merged.length}` });
    }

    const updated = (
      await db.query(
        `UPDATE pgs
         SET image_urls = $2::jsonb
         WHERE id=$1
         RETURNING id, image_urls`,
        [pgId, JSON.stringify(merged)]
      )
    ).rows[0];

    res.json({ data: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// Rooms
exports.addRoom = async (req, res) => {
  try {
    const pgId = Number(req.params.pgId);
    const ownerUserId = Number(req.body?.ownerUserId);
    const room_type = (req.body?.room_type || "").toString().trim();
    const rent_monthly = Number(req.body?.rent_monthly);
    const total_beds = Number(req.body?.total_beds);
    const available_beds = Number(req.body?.available_beds);

    if (!pgId || !ownerUserId || !room_type) return res.status(400).json({ error: "Missing fields" });
    if (!Number.isFinite(rent_monthly) || rent_monthly < 0) return res.status(400).json({ error: "rent_monthly invalid" });
    if (!Number.isFinite(total_beds) || total_beds < 1) return res.status(400).json({ error: "total_beds invalid" });
    if (!Number.isFinite(available_beds) || available_beds < 0) return res.status(400).json({ error: "available_beds invalid" });
    if (available_beds > total_beds) return res.status(400).json({ error: "available_beds cannot exceed total_beds" });

    const ownerId = await getOwnerIdByUserId(ownerUserId);
    if (!ownerId) return res.status(404).json({ error: "Owner not found" });

    const pg = (await db.query(`SELECT id FROM pgs WHERE id=$1 AND owner_id=$2`, [pgId, ownerId])).rows[0];
    if (!pg) return res.status(403).json({ error: "PG not found for this owner" });

    const row = (
      await db.query(
        `INSERT INTO rooms (pg_id, room_type, rent_monthly, total_beds, available_beds, amenities)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, pg_id, room_type, rent_monthly, total_beds, available_beds`,
        [pgId, room_type, rent_monthly, total_beds, available_beds, {}]
      )
    ).rows[0];

    res.json({ data: row });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.updateRoom = async (req, res) => {
  try {
    const roomId = Number(req.params.roomId);
    const ownerUserId = Number(req.body?.ownerUserId);
    if (!roomId || !ownerUserId) return res.status(400).json({ error: "roomId & ownerUserId required" });

    const ownerId = await getOwnerIdByUserId(ownerUserId);
    if (!ownerId) return res.status(404).json({ error: "Owner not found" });

    const room = (
      await db.query(
        `SELECT r.*, p.owner_id
         FROM rooms r
         JOIN pgs p ON p.id=r.pg_id
         WHERE r.id=$1`,
        [roomId]
      )
    ).rows[0];

    if (!room) return res.status(404).json({ error: "Room not found" });
    if (Number(room.owner_id) !== Number(ownerId)) return res.status(403).json({ error: "Not your room" });

    const rent_monthly = req.body?.rent_monthly !== undefined ? Number(req.body.rent_monthly) : null;
    const total_beds = req.body?.total_beds !== undefined ? Number(req.body.total_beds) : null;
    const available_beds = req.body?.available_beds !== undefined ? Number(req.body.available_beds) : null;

    const newTotal = total_beds ?? room.total_beds;
    const newAvail = available_beds ?? room.available_beds;
    if (available_beds !== null && (!Number.isFinite(available_beds) || available_beds < 0)) return res.status(400).json({ error: "available_beds invalid" });
    if (total_beds !== null && (!Number.isFinite(total_beds) || total_beds < 1)) return res.status(400).json({ error: "total_beds invalid" });
    if (newAvail > newTotal) return res.status(400).json({ error: "available_beds cannot exceed total_beds" });

    const row = (
      await db.query(
        `UPDATE rooms
         SET rent_monthly = COALESCE($2, rent_monthly),
             total_beds = COALESCE($3, total_beds),
             available_beds = COALESCE($4, available_beds)
         WHERE id=$1
         RETURNING id, pg_id, room_type, rent_monthly, total_beds, available_beds`,
        [roomId, rent_monthly, total_beds, available_beds]
      )
    ).rows[0];

    res.json({ data: row });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
