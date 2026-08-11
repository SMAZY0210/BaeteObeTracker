const errorHandler = (err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    status: 'error',
    error: err.message || 'Internal server error',
  });
};
module.exports = errorHandler;
