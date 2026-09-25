/**
 * routes/event.routes.js
 *
 * GET    /api/events                    — List all events
 * POST   /api/events                    — Create event (Admin only)
 * GET    /api/events/:id/dashboard      — Real-time financial summary
 * PATCH  /api/events/:id                — Update event (Admin only)
 * DELETE /api/events/:id                — Delete event (Admin only)
 * GET    /api/events/:id/export/excel   — Download Excel audit (Admin only)
 */
const router = require('express').Router();
const { protect, adminOnly } = require('../middlewares/auth.middleware');
const { validateCreateEvent } = require('../middlewares/validate.middleware');
const {
  createEvent,
  getAllEvents,
  getEventDashboard,
  updateEvent,
  deleteEvent,
} = require('../controllers/event.controller');
const { exportEventExcel } = require('../controllers/export.controller');

router.get('/',                     protect,             getAllEvents);
router.post('/',                    protect, adminOnly,  validateCreateEvent, createEvent);
router.get('/:id/dashboard',        protect,             getEventDashboard);
router.patch('/:id',                protect, adminOnly,  updateEvent);
router.delete('/:id',               protect, adminOnly,  deleteEvent);
router.get('/:id/export/excel',     protect, adminOnly,  exportEventExcel);

module.exports = router;
