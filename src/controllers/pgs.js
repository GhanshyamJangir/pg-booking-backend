// src/controllers/pgs.js
const db = require("../db");

// GET /api/pgs?area=...&gender=boy|girl
exports.list = async (req, res) => {
  try {
    const area = req.query.area ? String(req.query.area).trim() : null;
    const gender = req.query.gender ? String(req.query.gender).trim() : null; // boy/girl

    // For MVP filtering:
    // - boy can see boys/both
    // - girl can see girls/both
    let pgTypes = null;
    if (gender === "boy") pgTypes = ["boys", "both"];
    if (gender === "girl") pgTypes = ["girls", "both"];

    const params = [];
    let where = `WHERE p.status='approved'`;

    if (area) {
      params.push(area);
      where += ` AND LOWER(p.area) LIKE LOWER($${params.length})`;
      params[params.length - 1] = `%${area}%`;
    }
    if (pgTypes) {
      params.push(pgTypes);
      where += ` AND p.pg_type = ANY($${params.length})`;
    }

    const rows = (
      await db.query(
        `SELECT p.id, p.name, p.pg_type, p.address, p.area, p.lat, p.lng,
                COALESCE(p.amenities,'{}'::jsonb) as amenities,
                COALESCE(p.image_urls,'[]'::jsonb) as image_urls
         FROM pgs p
         ${where}
         ORDER BY p.id DESC`,
        params
      )
    ).rows;

    res.json({ data: rows });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// GET /api/pgs/:id  (for customer details)
exports.details = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "id required" });

    const pg = (
      await db.query(
        `SELECT p.*,
                o.upi_id as owner_upi_id
         FROM pgs p
         JOIN owners o ON o.id = p.owner_id
         WHERE p.id=$1`,
        [id]
      )
    ).rows[0];

    if (!pg) return res.status(404).json({ error: "PG not found" });

    const rooms = (
      await db.query(
        `SELECT id, pg_id, room_type, rent_monthly, total_beds, available_beds
         FROM rooms
         WHERE pg_id=$1
         ORDER BY id DESC`,
        [id]
      )
    ).rows;

    res.json({ data: { pg, rooms } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
