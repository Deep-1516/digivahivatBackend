/**
 * routes/notice.routes.js
 *
 * Notice Board API:
 * POST   /api/notices     — Add notice (Admin only)
 * GET    /api/notices     — Get notices for user's society (Residents & Admins)
 * GET    /api/notices/:id — Get notice details
 * PATCH  /api/notices/:id — Update notice (Admin only)
 * DELETE /api/notices/:id — Delete notice (Admin only)
 */
const router = require('express').Router();
const { protect, adminOnly } = require('../middlewares/auth.middleware');
const {
  createNotice,
  getNotices,
  getNoticeById,
  updateNotice,
  deleteNotice,
} = require('../controllers/notice.controller');

router.post('/',    protect, adminOnly, createNotice);
router.get('/',     protect,            getNotices);
router.get('/:id',  protect,            getNoticeById);
router.patch('/:id', protect, adminOnly, updateNotice);
router.delete('/:id', protect, adminOnly, deleteNotice);

module.exports = router;
