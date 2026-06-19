const { verifyAccessToken } = require('../auth/jwt');

const verifyToken = (req, res, next) => {
  try {
    const token = req.cookies.accessToken;

    if (!token) {
      return res.status(401).json({ error: 'No authorization token' });
    }

    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: error.message || 'Unauthorized' });
  }
};

module.exports = { verifyToken };
