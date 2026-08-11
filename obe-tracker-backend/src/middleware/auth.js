const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', error: 'Missing or malformed Authorization header' });
    }
    const token = authHeader.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ status: 'error', error: 'Invalid or expired token' });
    }
    if (payload.jti) {
      const blacklisted = await prisma.jwtBlacklist.findUnique({ where: { jti: payload.jti } });
      if (blacklisted) return res.status(401).json({ status: 'error', error: 'Token has been revoked' });
    }
    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ status: 'error', error: 'Insufficient permissions' });
  }
  next();
};

module.exports = { authenticate, authorize };
