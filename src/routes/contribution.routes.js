/**
 * routes/contribution.routes.js
 *
 * POST   /api/contributions               — Record payment (Admin only)
 * GET    /api/contributions               — List contributions (filter by ?eventId or ?residentId)
 * GET    /api/contributions/:id/pdf-receipt — Download PDF receipt
 * DELETE /api/contributions/:id           — Delete a contribution record (Admin only)
 */
const router = require('express').Router();
const { protect, adminOnly } = require('../middlewares/auth.middleware');
const { validateContribution } = require('../middlewares/validate.middleware');
const {
  recordContribution,
  getContributions,
  generatePdfReceipt,
  deleteContribution,
} = require('../controllers/contribution.controller');

router.post('/',               protect, adminOnly, validateContribution, recordContribution);
router.get('/',                protect,            getContributions);
router.get('/:id/pdf-receipt', protect,            generatePdfReceipt);
router.delete('/:id',          protect, adminOnly, deleteContribution);

module.exports = router;
