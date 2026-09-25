/**
 * server.js — Application entry point.
 * Bootstraps Express, connects to MongoDB, and starts listening.
 */
require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

// Connect to MongoDB then start the HTTP server
connectDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Falo] Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });
});
