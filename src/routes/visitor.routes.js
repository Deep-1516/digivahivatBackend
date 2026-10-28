/**
 * routes/visitor.routes.js
 *
 * Visitor Management System routes:
 * Pre-approval, QR verification, Gate Check-In, Check-Out, and History.
 */
const router = require('express').Router();
const { protect, adminOnly } = require('../middlewares/auth.middleware');
const {
  preApproveVisitor,
  verifyPass,
  checkInVisitor,
  checkOutVisitor,
  getSocietyVisitors,
  getMyVisitors,
  cancelPreApproval,
} = require('../controllers/visitor.controller');

// Resident routes
router.post('/pre-approve',       protect, preApproveVisitor);
router.get('/my-visitors',        protect, getMyVisitors);
router.patch('/:id/cancel',       protect, cancelPreApproval);

// Guard / Admin gate operations
router.post('/verify',            protect, adminOnly, verifyPass);
router.post('/checkin',           protect, adminOnly, checkInVisitor);
router.post('/:id/checkout',      protect, adminOnly, checkOutVisitor);
router.get('/society-register',   protect, adminOnly, getSocietyVisitors);

module.exports = router;
