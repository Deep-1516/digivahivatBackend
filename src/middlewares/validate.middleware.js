/**
 * middlewares/validate.middleware.js
 *
 * Centralised request-body validation using express-validator.
 * Each exported array is a "validation chain" to attach to a route.
 */
const { body, validationResult } = require('express-validator');

/**
 * Runs after a validation chain. Returns 422 with field-level errors
 * if any validation rule fails.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors:  errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
const validateRegister = [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone is required.')
    .matches(/^\d{10}$/).withMessage('Phone must be a valid 10-digit number.'),
  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
  handleValidationErrors,
];

const validateLogin = [
  body('phone').trim().notEmpty().withMessage('Phone is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
  handleValidationErrors,
];

// ─── Events ───────────────────────────────────────────────────────────────────
const validateCreateEvent = [
  body('title').trim().notEmpty().withMessage('Event title is required.'),
  body('targetBudget')
    .notEmpty().withMessage('Target budget is required.')
    .isNumeric().withMessage('Target budget must be a number.')
    .custom((v) => v > 0).withMessage('Target budget must be greater than 0.'),
  handleValidationErrors,
];

// ─── Contributions ────────────────────────────────────────────────────────────
const validateContribution = [
  body('contributionType')
    .optional()
    .isIn(['Event', 'Annual'])
    .withMessage('contributionType must be Event or Annual.'),
  // eventId required only for Event type — cross-field check in controller
  body('eventId')
    .if(body('contributionType').not().equals('Annual'))
    .notEmpty().withMessage('eventId is required for Event contributions.')
    .isMongoId().withMessage('Invalid eventId.'),
  body('annualYear')
    .if(body('contributionType').equals('Annual'))
    .notEmpty().withMessage('annualYear is required for Annual contributions.')
    .isInt({ min: 2000, max: 2100 }).withMessage('annualYear must be a valid year.'),
  body('residentId').notEmpty().withMessage('residentId is required.').isMongoId().withMessage('Invalid residentId.'),
  body('amount')
    .notEmpty().withMessage('Amount is required.')
    .isNumeric().withMessage('Amount must be a number.')
    .custom((v) => v > 0).withMessage('Amount must be greater than 0.'),
  body('paymentMode').optional().isIn(['Cash', 'UPI']).withMessage('paymentMode must be Cash or UPI.'),
  body('paymentStatus').optional().isIn(['Paid', 'Pending', 'Partial']).withMessage('Invalid paymentStatus.'),
  handleValidationErrors,
];

// ─── Expenses ─────────────────────────────────────────────────────────────────
const validateExpense = [
  body('eventId').notEmpty().withMessage('eventId is required.').isMongoId().withMessage('Invalid eventId.'),
  body('title').trim().notEmpty().withMessage('Expense title is required.'),
  body('amount')
    .notEmpty().withMessage('Amount is required.')
    .isNumeric().withMessage('Amount must be a number.')
    .custom((v) => v > 0).withMessage('Amount must be greater than 0.'),
  body('category')
    .optional()
    .isIn(['Decoration', 'Panditji/Pooja', 'Mahaprasad/Food', 'Sound/Lighting', 'Miscellaneous'])
    .withMessage('Invalid category.'),
  handleValidationErrors,
];

// ─── Residents ────────────────────────────────────────────────────────────────
const validateAddResident = [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone is required.')
    .matches(/^\d{10}$/).withMessage('Phone must be a valid 10-digit number.'),
  body('totalMembers')
    .optional()
    .isInt({ min: 1 }).withMessage('totalMembers must be a positive integer.'),
  handleValidationErrors,
];

module.exports = {
  validateRegister,
  validateLogin,
  validateCreateEvent,
  validateContribution,
  validateExpense,
  validateAddResident,
};
