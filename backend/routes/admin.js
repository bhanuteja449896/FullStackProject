const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { checkPermission, clearPermissionCache } = require('../middleware/rbac');
const { hashPassword } = require('../auth/jwt');

// ===== GET AUDIT LOGS =====
router.get('/audit-logs', verifyToken, checkPermission('view:audit'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT al.*, u.email as user_email
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT 100`
    );

    res.json({ logs: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== CREATE USER =====
router.post('/users', verifyToken, checkPermission('create:users'), async (req, res) => {
  try {
    const { email, password, fullName, roleName } = req.body;

    if (!email || !password || !roleName) {
      return res.status(400).json({ error: 'Email, password, and role are required' });
    }

    // Check if user exists
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Get role ID
    const roleResult = await db.query(
      'SELECT id FROM roles WHERE name = $1',
      [roleName.toLowerCase()]
    );

    if (roleResult.rows.length === 0) {
      return res.status(400).json({ error: `Invalid role name: ${roleName}` });
    }

    const roleId = roleResult.rows[0].id;

    // Hash password
    const passwordHash = await hashPassword(password);

    // Insert user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name, role_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name`,
      [email, passwordHash, fullName || email.split('@')[0], roleId]
    );

    const newUser = result.rows[0];

    // Log admin action
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, ip_address, user_agent, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.userId,
        'CREATE_USER',
        'users',
        newUser.id,
        req.cleanedIp,
        req.headers['user-agent'] || 'Unknown',
        JSON.stringify({ email: newUser.email, role: roleName })
      ]
    );

    res.status(201).json({ user: newUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== DELETE USER =====
router.delete('/users/:id', verifyToken, checkPermission('delete:users'), async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.userId) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    // Verify user exists and get their info
    const userRes = await db.query('SELECT email FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const email = userRes.rows[0].email;

    // Delete user (cascade will handle sessions or comments as configured)
    await db.query('DELETE FROM users WHERE id = $1', [id]);

    // Clear permission cache
    clearPermissionCache(id);

    // Log action
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, ip_address, user_agent, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.userId,
        'DELETE_USER',
        'users',
        id,
        req.cleanedIp,
        req.headers['user-agent'] || 'Unknown',
        JSON.stringify({ email })
      ]
    );

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
