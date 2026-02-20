// src/controllers/auth.js
const db = require("../db");

/**
 * MVP auth:
 * - No OTP / password
 * - Identify user by phone + role
 * - If exists -> update name/gender and return
 * - If not -> create and return
 */

async function findUserByPhoneRole(phone, role) {
  const row = (
    await db.query(`SELECT id, name, phone, gender, role FROM users WHERE phone=$1 AND role=$2`, [phone, role])
  ).rows[0];
  return row || null;
}

async function createUser({ name, phone, gender, role }) {
  const row = (
    await db.query(
      `INSERT INTO users (name, phone, gender, role, created_at)
       VALUES ($1,$2,$3,$4,NOW())
       RETURNING id, name, phone, gender, role`,
      [name, phone, gender || null, role]
    )
  ).rows[0];
  return row;
}

async function updateUser(id, { name, gender }) {
  const row = (
    await db.query(
      `UPDATE users
       SET name = COALESCE($2, name),
           gender = COALESCE($3, gender)
       WHERE id=$1
       RETURNING id, name, phone, gender, role`,
      [id, name || null, gender || null]
    )
  ).rows[0];
  return row;
}

// POST /api/auth/customer
// body: { name, phone, gender }
exports.customerLogin = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const gender = String(req.body?.gender || "").trim(); // boy/girl
    const role = "customer";

    if (!name || !phone || !gender) {
      return res.status(400).json({ error: "name, phone, gender required" });
    }
    if (!["boy", "girl"].includes(gender)) {
      return res.status(400).json({ error: "gender must be boy/girl" });
    }

    let user = await findUserByPhoneRole(phone, role);
    if (!user) {
      user = await createUser({ name, phone, gender, role });
    } else {
      user = await updateUser(user.id, { name, gender });
    }

    res.json({ data: { user } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// POST /api/auth/owner
// body: { name, phone }
exports.ownerLogin = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const role = "owner";

    if (!name || !phone) {
      return res.status(400).json({ error: "name, phone required" });
    }

    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: "phone must be exactly 10 digits" });
    }

    // ✅ MUST use allowed gender value (DB constraint)
    const gender = "boy";

    let user = await findUserByPhoneRole(phone, role);
    if (!user) {
      user = await createUser({ name, phone, gender, role });
    } else {
      user = await updateUser(user.id, { name, gender });
    }

    // Ensure owners row exists
    let owner = (await db.query(`SELECT id, user_id FROM owners WHERE user_id=$1`, [user.id])).rows[0];
    if (!owner) {
      owner = (
        await db.query(
          `INSERT INTO owners (user_id, kyc_status, created_at)
           VALUES ($1,'pending',NOW())
           RETURNING id, user_id`,
          [user.id]
        )
      ).rows[0];
    }

    res.json({ data: { user, owner } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
