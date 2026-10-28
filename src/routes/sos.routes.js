/**
 * routes/sos.routes.js
 *
 * Emergency SOS routes:
 * POST   /api/sos                — Trigger emergency alert
 * GET    /api/sos/active         — Get active alerts for society
 * GET    /api/sos/history        — Get past alerts
 * PUT    /api/sos/:id/acknowledge — Help dispatched / responding
 * PUT    /api/sos/:id/resolve     — Incident resolved
 * PUT    /api/sos/:id/cancel      — Cancel alert
 */
const router = require('express').Router();
const { protect } = require('../middlewares/auth.middleware');
const {
  triggerAlert,
  getActiveAlerts,
  getAlertHistory,
  acknowledgeAlert,
  resolveAlert,
  cancelAlert,
} = require('../controllers/sos.controller');

router.post('/',                  protect, triggerAlert);
router.get('/active',             protect, getActiveAlerts);
router.get('/history',            protect, getAlertHistory);
router.put('/:id/acknowledge',     protect, acknowledgeAlert);
router.put('/:id/resolve',         protect, resolveAlert);
router.put('/:id/cancel',          protect, cancelAlert);

module.exports = router;
