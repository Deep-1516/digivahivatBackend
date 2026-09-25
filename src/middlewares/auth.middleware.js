/**
 * middlewares/auth.middleware.js
 *
 * protect      — Verifies JWT, attaches req.user (with societyId populated)
 * adminOnly    — Requires role Admin or SuperAdmin
 * superAdminOnly — Requires role SuperAdmin
 * sameSociety  — Ensures req.user.societyId matches the requested resource's society
 */
const jwt      = require('jsonwebtoken');
const Resident = require('../models/Resident.model');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized. No token provided.' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await Resident.findById(decoded.id).select('-password').populate('societyId', 'name');
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User no longer exists.' });
    }
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token invalid or expired.' });
  }
};

/** Admin or SuperAdmin */
const adminOnly = (req, res, next) => {
  if (!['Admin', 'SuperAdmin'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
  }
  next();
};

/** SuperAdmin only */
const superAdminOnly = (req, res, next) => {
  if (req.user?.role !== 'SuperAdmin') {
    return res.status(403).json({ success: false, message: 'Access denied. Super Admin only.' });
  }
  next();
};

module.exports = { protect, adminOnly, superAdminOnly };
