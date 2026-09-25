/**
 * app.js — Express application factory.
 * Assembles all middleware and mounts route groups.
 */
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');
const path    = require('path');

const authRoutes         = require('./routes/auth.routes');
const residentRoutes     = require('./routes/resident.routes');
const eventRoutes        = require('./routes/event.routes');
const contributionRoutes = require('./routes/contribution.routes');
const expenseRoutes      = require('./routes/expense.routes');
const societyRoutes      = require('./routes/society.routes');
const { errorHandler }   = require('./middlewares/error.middleware');

const app = express();

// ─── Security & Logging ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// Disabled in development — hot reload + multi-tab use burns through limits fast.
// In production: global 500 req/15 min guard + tight 20 req/15 min on auth routes.
const isDev = process.env.NODE_ENV !== 'production';

if (!isDev) {
  // Global guard — 500 requests per 15 minutes per IP
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: 'Too many requests. Please try again later.' },
    })
  );
}

// Auth-specific limiter — only active in production to prevent brute-force login
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 0 : 20,          // 0 = unlimited in dev
  skip: () => isDev,            // always skip in dev
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static uploads folder (local fallback) ───────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',          authLimiter, authRoutes);
app.use('/api/societies',     societyRoutes);
app.use('/api/residents',     residentRoutes);
app.use('/api/events',        eventRoutes);
app.use('/api/contributions', contributionRoutes);
app.use('/api/expenses',      expenseRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'Falo API' }));

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
