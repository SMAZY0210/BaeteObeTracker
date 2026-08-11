const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const signToken = (payload) => {
  // Use Node built-in crypto instead of uuid package (uuid v9+ is ESM-only)
  const jti = crypto.randomUUID();
  return {
    token: jwt.sign(
      { ...payload, jti },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    ),
    jti,
  };
};

module.exports = { signToken };
