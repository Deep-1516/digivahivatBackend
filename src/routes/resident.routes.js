/**
 * routes/resident.routes.js
 *
 * GET    /api/residents      — All residents + society stats (authenticated)
 * GET    /api/residents/me   — Own profile (authenticated)
 * POST   /api/residents      — Add resident (Admin only)
 * PATCH  /api/residents/:id  — Update resident (Admin only)
 * DELETE /api/residents/:id  — Remove resident (Admin only)
 */
const router = require('express').Router();
const { protect, adminOnly } = require('../middlewares/auth.middleware');
const { validateAddResident } = require('../middlewares/validate.middleware');
const {
  addResident,
  getAllResidents,
  getMyProfile,
  updateResident,
  deleteResident,
} = require('../controllers/resident.controller');

router.get('/me',    protect,              getMyProfile);
router.get('/',      protect,              getAllResidents);
router.post('/',     protect, adminOnly,   validateAddResident, addResident);
router.patch('/:id', protect, adminOnly,   updateResident);
router.delete('/:id',protect, adminOnly,   deleteResident);

module.exports = router;
