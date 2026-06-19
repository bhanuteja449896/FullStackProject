const db = require('../db');

const permissionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;  // 5 minutes

const getUserPermissions = async (userId) => {
  if (permissionCache.has(userId)) {
    const cached = permissionCache.get(userId);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.permissions;
    }
  }

  try {
    const result = await db.query(
      `SELECT DISTINCT p.name 
       FROM role_permissions rp
       JOIN permissions p ON rp.permission_id = p.id
       JOIN users u ON u.role_id = rp.role_id
       WHERE u.id = $1 AND u.is_active = true`,
      [userId]
    );

    const permissions = result.rows.map(row => row.name);
    permissionCache.set(userId, { permissions, timestamp: Date.now() });

    return permissions;
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    throw new Error('Failed to get user permissions');
  }
};

const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Unauthorized. User context missing.' });
      }

      const permissions = await getUserPermissions(req.user.userId);

      if (!permissions.includes(requiredPermission)) {
        // Log failed access attempt in audit logs
        try {
          await db.query(
            `INSERT INTO audit_logs (user_id, action, resource, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              req.user.userId,
              'PERMISSION_DENIED',
              requiredPermission,
              req.ip,
              req.headers['user-agent'] || 'Unknown'
            ]
          );
        } catch (logError) {
          console.error('Failed to write PERMISSION_DENIED to audit logs:', logError);
        }

        return res.status(403).json({
          error: `Permission denied. Required privilege: ${requiredPermission}`
        });
      }

      next();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
};

const clearPermissionCache = (userId) => {
  permissionCache.delete(userId);
};

module.exports = { checkPermission, getUserPermissions, clearPermissionCache };
