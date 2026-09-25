/**
 * utils/jwt.utils.js
 *
 * Centralised JWT helper so token generation logic lives in one place.
 */
const jwt = require('jsonwebtoken');

/**
 * Signs and returns a JWT for the given resident _id.
 * @param {string} id — Mongoose ObjectId string
 * @returns {string} Signed JWT token
 */
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

module.exports = { generateToken };
