const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const sendOtp = async (to, otp) => {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Your OBE Tracker Password Reset OTP',
    text: `Your OTP is: ${otp}. It expires in 10 minutes.`,
    html: `<p>Your OTP is: <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
  });
};

module.exports = { sendOtp };
