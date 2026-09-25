/**
 * routes/auth.routes.js
 */
const router = require('express').Router();
const { register, login, seedAdmin, changePassword } = require('../controllers/auth.controller');
const { validateRegister, validateLogin } = require('../middlewares/validate.middleware');
const { protect } = require('../middlewares/auth.middleware');

router.post('/register',         validateRegister, register);
router.post('/login',            validateLogin,    login);
router.post('/change-password',  protect,          changePassword);

/**
 * POST /api/auth/seed-admin
 * One-time bootstrap endpoint. Self-disables once an Admin exists.
 * No auth required (there is no Admin yet when this is first called).
 */
router.post('/seed-admin', seedAdmin);

module.exports = router;
