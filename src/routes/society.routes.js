/**
 * routes/society.routes.js
 *
 * All routes require SuperAdmin role.
 */
const router = require('express').Router();
const { protect, superAdminOnly } = require('../middlewares/auth.middleware');
const {
  createSociety,
  getAllSocieties,
  updateSociety,
  deleteSociety,
  getSocietyAdmins,
} = require('../controllers/society.controller');

router.get('/',           protect, superAdminOnly, getAllSocieties);
router.post('/',          protect, superAdminOnly, createSociety);
router.patch('/:id',      protect, superAdminOnly, updateSociety);
router.delete('/:id',     protect, superAdminOnly, deleteSociety);
router.get('/:id/admins', protect, superAdminOnly, getSocietyAdmins);

module.exports = router;
