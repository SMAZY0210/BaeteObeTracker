const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const { login, logout, forgotPassword, resetPassword } = require('../controllers/auth.controller');

// Rate limiting is off during testing. Set RATE_LIMIT=on in the backend env
// to switch the real limiter back on before going live, no route changes needed.
const limiter = process.env.RATE_LIMIT === 'on'
  ? rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { status: 'error', error: 'Too many attempts' } })
  : (req, res, next) => next();

router.post('/login', limiter, login);
router.post('/logout', authenticate, logout);
router.post('/forgot-password', limiter, forgotPassword);
router.post('/reset-password', limiter, resetPassword);

module.exports = router;