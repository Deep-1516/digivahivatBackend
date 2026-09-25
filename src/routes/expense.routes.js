/**
 * routes/expense.routes.js
 *
 * POST   /api/expenses         — Log expense with optional receipt image (Admin only)
 * GET    /api/expenses         — List expenses (filter by ?eventId)
 * DELETE /api/expenses/:id     — Remove an expense (Admin only)
 */
const router = require('express').Router();
const { protect, adminOnly } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');
const { validateExpense } = require('../middlewares/validate.middleware');
const { logExpense, getExpenses, updateExpenseStatus, updateExpense, deleteExpense } = require('../controllers/expense.controller');

// Residents can log and edit their own expenses (submission goes to Pending for admin review)
router.post('/', protect, upload.single('receipt'), validateExpense, logExpense);
router.get('/',  protect, getExpenses);
router.patch('/:id/status', protect, adminOnly, updateExpenseStatus);
router.patch('/:id', protect, upload.single('receipt'), updateExpense);
router.delete('/:id', protect, deleteExpense);

module.exports = router;
