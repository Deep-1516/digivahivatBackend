/**
 * middlewares/error.middleware.js
 *
 * Centralised error handler. Catches anything passed to next(err).
 * Normalises Mongoose validation errors and duplicate-key errors
 * into clean, client-friendly messages.
 */
const errorHandler = (err, _req, res, _next) => {
  console.error('[Error]', err.stack || err.message);

  let statusCode = err.statusCode || 500;
  let message    = err.message    || 'Internal Server Error';

  // ── Mongoose: Document Not Found ──────────────────────────────────────────
  if (err.name === 'CastError') {
    statusCode = 400;
    message    = `Invalid value for field '${err.path}'.`;
  }

  // ── Mongoose: Validation Error ────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message    = Object.values(err.errors)
      .map((e) => e.message)
      .join('. ');
  }

  // ── MongoDB: Duplicate Key (e.g., unique phone) ───────────────────────────
  if (err.code === 11000) {
    statusCode = 409;
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : 'field';
    if (field === 'phone') {
      message = 'A resident with this phone number already exists.';
    } else {
      message = `A record with this ${field} already exists.`;
    }
  }

  // ── JWT errors ────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message    = 'Invalid token.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message    = 'Token has expired. Please log in again.';
  }

  // ── Multer / File Upload errors ───────────────────────────────────────────
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    message    = 'File size exceeds the 5 MB limit. Please upload an image or document smaller than 5 MB.';
  }

  res.status(statusCode).json({ success: false, message });
};

module.exports = { errorHandler };

