const bcrypt = require('bcrypt');
const crypto = require('crypto');
const prisma = require('../prisma');
const { signToken } = require('../utils/jwt');
const { sendOtp } = require('../utils/mailer');

// POST /api/v1/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: 'error', error: 'Email and password are required' });
    }

    // Allow login by email (case-insensitive) OR institutionalId (student roll number)
    const emailInput = email.trim();
    let user;
    try {
      user = await prisma.user.findFirst({
        where: { email: { equals: emailInput, mode: 'insensitive' } },
      });
      if (!user) {
        user = await prisma.user.findFirst({ where: { institutionalId: emailInput } });
      }
    } catch (dbErr) {
      // Database not set up yet or table missing
      return res.status(503).json({
        status: 'error',
        error: 'Database not ready. Please run: npx prisma migrate dev && npm run db:seed',
      });
    }
    // Always compare to prevent timing attacks
    const dummyHash = '$2b$10$invalidhashfortimingnnnnnnnnnnnnnnnnnnnnnnnnnnnnn';
    const valid = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!user || !valid || !user.isActive) {
      return res.status(401).json({ status: 'error', error: 'Invalid credentials' });
    }

    const { token, jti } = signToken({
      userId: user.id,
      role: user.role,
      institutionId: user.institutionId,
    });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return res.json({
      status: 'success',
      data: {
        token,
        user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
      },
    });
  } catch (err) { next(err); }
};

// POST /api/v1/auth/logout
const logout = async (req, res, next) => {
  try {
    const { jti, userId } = req.user;
    if (jti) {
      const exp = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await prisma.jwtBlacklist.create({ data: { userId, jti, expiresAt: exp } });
    }
    return res.json({ status: 'success', data: { message: 'Logged out' } });
  } catch (err) { next(err); }
};

// POST /api/v1/auth/forgot-password
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email: email?.toLowerCase() } });
    // Always return 200 to not leak existence
    if (user && user.isActive) {
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await prisma.otpToken.create({ data: { userId: user.id, token: otp, expiresAt } });
      await sendOtp(user.email, otp);
    }
    return res.json({ status: 'success', data: { message: 'If that email exists, an OTP has been sent' } });
  } catch (err) { next(err); }
};

// POST /api/v1/auth/reset-password
const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ status: 'error', error: 'email, otp, and newPassword are required' });
    }

    // Password policy: ≥ 8 chars, at least one letter, one digit
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPassword)) {
      return res.status(400).json({ status: 'error', error: 'Password must be ≥8 chars with at least one letter and one digit' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(400).json({ status: 'error', error: 'Invalid OTP' });

    const record = await prisma.otpToken.findFirst({
      where: { userId: user.id, token: otp, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) return res.status(400).json({ status: 'error', error: 'Invalid or expired OTP' });

    const hash = await bcrypt.hash(newPassword, Number(process.env.BCRYPT_COST) || 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } }),
      prisma.otpToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    return res.json({ status: 'success', data: { message: 'Password reset successful' } });
  } catch (err) { next(err); }
};

module.exports = { login, logout, forgotPassword, resetPassword };
