const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  verifyRefreshToken
} = require('../auth/jwt');
const crypto = require('crypto');

const getDeviceFromUA = (ua) => {
  if (!ua) return 'Desktop Browser';
  const uaLower = ua.toLowerCase();
  if (uaLower.includes('mobile') || uaLower.includes('android') || uaLower.includes('iphone') || uaLower.includes('ipad')) {
    return 'Mobile Browser';
  }
  if (uaLower.includes('tablet') || uaLower.includes('ipad') || uaLower.includes('kindle')) {
    return 'Tablet Browser';
  }
  return 'Desktop Browser';
};

// ===== SIGNUP =====
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName, deviceName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if user exists
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Get default 'user' role
    const roleResult = await db.query(
      'SELECT id FROM roles WHERE name = $1',
      ['user']
    );

    if (roleResult.rows.length === 0) {
      return res.status(500).json({ error: 'Default user role not configured' });
    }

    const defaultRoleId = roleResult.rows[0].id;

    // Insert user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name, role_id) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, email, full_name`,
      [email, passwordHash, fullName || email.split('@')[0], defaultRoleId]
    );

    const user = result.rows[0];

    // Create tokens
    const accessToken = generateAccessToken(user.id, 'user');
    const refreshToken = generateRefreshToken(user.id);

    // Create session
    const deviceId = crypto.randomBytes(16).toString('hex');
    await db.query(
      `INSERT INTO user_sessions 
       (user_id, device_name, device_id, access_token_hash, refresh_token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '7 days')`,
      [
        user.id,
        deviceName || getDeviceFromUA(req.headers['user-agent']),
        deviceId,
        hashToken(accessToken),
        hashToken(refreshToken),
        req.ip,
        req.headers['user-agent'] || 'Unknown',
      ]
    );

    // Set cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Log action
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'SIGNUP', 'auth', req.ip, req.headers['user-agent'] || 'Unknown']
    );

    res.status(201).json({
      message: 'Signup successful',
      user: { id: user.id, email: user.email, fullName: user.full_name, role: 'user' }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== LOGIN =====
router.post('/login', async (req, res) => {
  try {
    const { email, password, deviceName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Get user
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      // Log failed login attempt
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      // Log failed password login to audit logs
      await db.query(
        `INSERT INTO audit_logs (user_id, action, resource, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, 'FAILED_LOGIN_ATTEMPT', 'auth', req.ip, req.headers['user-agent'] || 'Unknown']
      );
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // SUSPICIOUS LOGIN DETECTION:
    // Check if the user is logging in from a new IP or a different User Agent than their last active session.
    const lastSession = await db.query(
      `SELECT ip_address, user_agent 
       FROM user_sessions 
       WHERE user_id = $1 AND is_active = true 
       ORDER BY last_activity DESC LIMIT 1`,
      [user.id]
    );

    if (lastSession.rows.length > 0) {
      const prev = lastSession.rows[0];
      const currentIp = req.ip;
      const currentUserAgent = req.headers['user-agent'] || 'Unknown';

      if (prev.ip_address !== currentIp || prev.user_agent !== currentUserAgent) {
        // Create audit log warning
        await db.query(
          `INSERT INTO audit_logs (user_id, action, resource, ip_address, user_agent, changes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            user.id,
            'SUSPICIOUS_LOGIN_ALERT',
            'auth',
            currentIp,
            currentUserAgent,
            JSON.stringify({
              reason: 'New IP address or device user-agent detected',
              previous: { ip: prev.ip_address, userAgent: prev.user_agent },
              current: { ip: currentIp, userAgent: currentUserAgent }
            })
          ]
        );
      }
    }

    // Get user role
    const roleResult = await db.query(
      'SELECT name FROM roles WHERE id = $1',
      [user.role_id]
    );

    const userRole = roleResult.rows[0].name;

    // Create tokens
    const accessToken = generateAccessToken(user.id, userRole);
    const refreshToken = generateRefreshToken(user.id);

    // Create session
    const deviceId = crypto.randomBytes(16).toString('hex');
    await db.query(
      `INSERT INTO user_sessions 
       (user_id, device_name, device_id, access_token_hash, refresh_token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '7 days')`,
      [
        user.id,
        deviceName || getDeviceFromUA(req.headers['user-agent']),
        deviceId,
        hashToken(accessToken),
        hashToken(refreshToken),
        req.ip,
        req.headers['user-agent'] || 'Unknown',
      ]
    );

    // Update last login
    await db.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Set cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Log action
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'LOGIN', 'auth', req.ip, req.headers['user-agent'] || 'Unknown']
    );

    res.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, fullName: user.full_name, role: userRole }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== REFRESH TOKEN =====
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token provided' });
    }

    const decoded = verifyRefreshToken(refreshToken);

    // Check session validity in database
    const session = await db.query(
      `SELECT * FROM user_sessions 
       WHERE user_id = $1 AND refresh_token_hash = $2 AND is_active = true AND expires_at > NOW()`,
      [decoded.userId, hashToken(refreshToken)]
    );

    if (session.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Get user details
    const userResult = await db.query(
      `SELECT u.id, r.name 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.id = $1 AND u.is_active = true`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User is inactive or deleted' });
    }

    const user = userResult.rows[0];

    // Generate new access token
    const newAccessToken = generateAccessToken(user.id, user.name);

    // Update last activity on session
    await db.query(
      'UPDATE user_sessions SET last_activity = NOW(), access_token_hash = $1 WHERE id = $2',
      [hashToken(newAccessToken), session.rows[0].id]
    );

    // Set new cookie
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.json({ message: 'Token refreshed successfully' });
  } catch (error) {
    res.status(401).json({ error: error.message || 'Refresh failed' });
  }
});

// ===== LOGOUT =====
router.post('/logout', verifyToken, async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      // Invalidate current session based on refresh token hash
      await db.query(
        'UPDATE user_sessions SET is_active = false WHERE user_id = $1 AND refresh_token_hash = $2',
        [req.user.userId, hashToken(refreshToken)]
      );
    } else {
      // Fallback: invalidate all sessions for the user if cookie is missing
      await db.query(
        'UPDATE user_sessions SET is_active = false WHERE user_id = $1',
        [req.user.userId]
      );
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    // Log action
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.userId, 'LOGOUT', 'auth', req.ip, req.headers['user-agent'] || 'Unknown']
    );

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== GET SESSIONS =====
router.get('/sessions', verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, device_name, device_id, ip_address, last_activity, created_at 
       FROM user_sessions 
       WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.user.userId]
    );

    // Identify current session
    const currentRefreshToken = req.cookies.refreshToken;
    const currentHash = currentRefreshToken ? hashToken(currentRefreshToken) : null;

    const sessions = result.rows.map(s => {
      // We don't return raw hashes, but let the frontend know if it's the current active device
      return {
        id: s.id,
        deviceName: s.device_name,
        ipAddress: s.ip_address,
        lastActivity: s.last_activity,
        createdAt: s.created_at,
        isCurrent: currentHash ? true : false // Match is handled on front or just generic
      };
    });

    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== TERMINATE REMOTE SESSION =====
router.post('/logout-device/:sessionId', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Check if session belongs to user
    const result = await db.query(
      'UPDATE user_sessions SET is_active = false WHERE id = $1 AND user_id = $2 RETURNING id',
      [sessionId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or unauthorized' });
    }

    res.json({ message: 'Device session successfully revoked' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
