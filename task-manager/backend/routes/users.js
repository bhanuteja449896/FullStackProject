const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

// ===== GET MY PROFILE =====
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.full_name, r.name as role, u.created_at, u.last_login
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1 AND u.is_active = true`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found or inactive' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== GET ALL USERS (Manager/Admin) =====
router.get('/', verifyToken, checkPermission('read:users'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.full_name, r.name as role, u.is_active, u.created_at, u.last_login
       FROM users u
       JOIN roles r ON u.role_id = r.id
       ORDER BY u.created_at DESC`
    );

    res.json({ users: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
