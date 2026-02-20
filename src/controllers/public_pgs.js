// src/controllers/public_pgs.js
const db = require("../db");

// GET /api/pgs/:pgId  => PG details + rooms
exports.pgDetails = async (req, res) => {
  try {
    const pgId = Number(req.params.pgId);
    if (!pgId) return res.status(400).json({ error: "Invalid pgId" });

    const pg = (
      await db.query(
        `SELECT id, owner_id, name, description, pg_type, address, area, status, amenities, rules, image_urls, created_at
         FROM pgs
         WHERE id=$1 AND status='approved'`,
        [pgId]
      )
    ).rows[0];

    if (!pg) return res.status(404).json({ error: "PG not found" });

    const rooms = (
      await db.query(
        `SELECT id, pg_id, room_type, rent_monthly, total_beds, available_beds, amenities
         FROM rooms
         WHERE pg_id=$1
         ORDER BY id ASC`,
        [pgId]
      )
    ).rows;

    res.json({ data: { ...pg, rooms } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
