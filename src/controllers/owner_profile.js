// src/controllers/owner_profile.js
const db = require("../db");

// GET /api/owner/profile/:ownerUserId
exports.getProfile = async (req, res) => {
  try {
    const ownerUserId = Number(req.params.ownerUserId);
    if (!ownerUserId) return res.status(400).json({ error: "Invalid ownerUserId" });

    const user = (
      await db.query(
        `SELECT id, name, phone, gender, role, email, whatsapp, created_at
         FROM users
         WHERE id=$1`,
        [ownerUserId]
      )
    ).rows[0];

    if (!user) return res.status(404).json({ error: "User not found" });

    const owner = (await db.query(`SELECT id, kyc_status FROM owners WHERE user_id=$1`, [ownerUserId])).rows[0];

    res.json({
      data: {
        ...user,
        owner_id: owner?.id || null,
        kyc_status: owner?.kyc_status || null,
      },
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// PATCH /api/owner/profile/:ownerUserId
exports.updateProfile = async (req, res) => {
  try {
    const ownerUserId = Number(req.params.ownerUserId);
    if (!ownerUserId) return res.status(400).json({ error: "Invalid ownerUserId" });

    const { name, phone, email, whatsapp } = req.body || {};

    if (name !== undefined && String(name).trim().length < 2) return res.status(400).json({ error: "Name minimum 2 characters" });
    if (phone !== undefined && String(phone).trim().length < 8) return res.status(400).json({ error: "Phone invalid" });

    if (email !== undefined && String(email).trim().length > 0) {
      const em = String(email).trim();
      if (!em.includes("@") || !em.includes(".")) return res.status(400).json({ error: "Email invalid" });
    }

    if (whatsapp !== undefined && String(whatsapp).trim().length > 0) {
      const wa = String(whatsapp).trim();
      if (wa.length < 8) return res.status(400).json({ error: "WhatsApp invalid" });
    }

    const row = (
      await db.query(
        `UPDATE users
         SET name = COALESCE($2, name),
             phone = COALESCE($3, phone),
             email = COALESCE($4, email),
             whatsapp = COALESCE($5, whatsapp)
         WHERE id=$1
         RETURNING id, name, phone, email, whatsapp, role`,
        [
          ownerUserId,
          name !== undefined ? String(name).trim() : null,
          phone !== undefined ? String(phone).trim() : null,
          email !== undefined ? String(email).trim() : null,
          whatsapp !== undefined ? String(whatsapp).trim() : null,
        ]
      )
    ).rows[0];

    if (!row) return res.status(404).json({ error: "User not found" });

    res.json({ data: row });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
