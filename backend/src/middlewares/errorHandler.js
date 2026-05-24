function errorHandler(error, req, res, next) {
  const status = error.statusCode || 500;
  const message = error.message || "Internal server error";
  const details = error.details || null;

  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.error(`[${req.method}] ${req.path}`, message, details || "");
  }

  res.status(status).json({
    success: false,
    message,
    details,
  });
}

module.exports = errorHandler;
