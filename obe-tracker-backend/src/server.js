// Catch any uncaught errors and log them clearly
process.on('uncaughtException', (err) => {
  console.error('[CRASH] Uncaught Exception:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] Unhandled Rejection:', reason);
});

let app;
try {
  app = require('./app');
} catch (err) {
  console.error('[CRASH] Failed to load app:', err.message);
  console.error(err.stack);
  // Export a minimal handler so Vercel doesn't show a blank 500
  app = (req, res) => res.status(500).json({
    error: 'App failed to load',
    message: err.message,
  });
}

// Local dev: start HTTP server
if (require.main === module) {
  const prisma = require('./prisma');
  const PORT = process.env.PORT || 3000;
  const start = async () => {
    try {
      await prisma.$connect();
      console.log('✅ Database connected');
      app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
    } catch (err) {
      console.error('Failed to start:', err);
      process.exit(1);
    }
  };
  start();
}

// Vercel serverless export
module.exports = app;
