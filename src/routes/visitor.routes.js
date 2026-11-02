/**
 * routes/visitor.routes.js
 *
 * Visitor Management System routes:
 * Pre-approval, QR verification, Gate Check-In, Check-Out, and History.
 */
const router = require('express').Router();
const { protect, adminOnly, guardOrAdminOnly } = require('../middlewares/auth.middleware');
const {
  preApproveVisitor,
  verifyPass,
  checkInVisitor,
  checkOutVisitor,
  getSocietyVisitors,
  getMyVisitors,
  cancelPreApproval,
  getPublicGatePass,
  getGatePassQrImage,
} = require('../controllers/visitor.controller');

// Public Gate Pass View & Direct QR Image (for WhatsApp / SMS guests without app login)
router.get('/pass/:id/qr', getGatePassQrImage);
router.get('/pass/:id', getPublicGatePass);

// Resident routes
router.post('/pre-approve',       protect, preApproveVisitor);
router.get('/my-visitors',        protect, getMyVisitors);
router.patch('/:id/cancel',       protect, cancelPreApproval);

// Guard / Admin gate operations
router.post('/verify',            protect, guardOrAdminOnly, verifyPass);
router.post('/checkin',           protect, guardOrAdminOnly, checkInVisitor);
router.post('/:id/checkout',      protect, guardOrAdminOnly, checkOutVisitor);
router.get('/society-register',   protect, guardOrAdminOnly, getSocietyVisitors);

module.exports = router;
