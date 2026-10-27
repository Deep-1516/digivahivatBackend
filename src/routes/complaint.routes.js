/**
 * routes/complaint.routes.js
 *
 * Member Requests & Complaints (Helpdesk API):
 * POST   /api/complaints           — Submit request or complaint (Residents & Admins)
 * GET    /api/complaints           — List (Residents see ONLY their own; Admins see all society complaints)
 * GET    /api/complaints/:id       — Details (Private to creator & Admin)
 * PATCH  /api/complaints/:id/status — Update status & remarks (Admin only)
 * DELETE /api/complaints/:id       — Delete
 */
const router = require('express').Router();
const { protect, adminOnly } = require('../middlewares/auth.middleware');
const {
  createComplaint,
  getComplaints,
  getComplaintById,
  updateComplaintStatus,
  deleteComplaint,
} = require('../controllers/complaint.controller');

router.post('/',           protect,            createComplaint);
router.get('/',            protect,            getComplaints);
router.get('/:id',         protect,            getComplaintById);
router.patch('/:id/status', protect, adminOnly, updateComplaintStatus);
router.delete('/:id',      protect,            deleteComplaint);

module.exports = router;
