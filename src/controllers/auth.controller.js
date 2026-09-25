/**
 * controllers/auth.controller.js
 *
 * Handles resident self-registration, login, and first-time admin seeding.
 */
const Resident          = require('../models/Resident.model');
const { generateToken } = require('../utils/jwt.utils');

// ─── POST /api/auth/register ──────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { name, phone, password, houseOrFlatNo, totalMembers } = req.body;

    // Prevent duplicate registrations
    const existing = await Resident.findOne({ phone });
    if (existing) {
      return res.status(409).json({ success: false, message: 'A resident with this phone number already exists.' });
    }

    const resident = await Resident.create({
      name,
      phone,
      password,
      houseOrFlatNo: houseOrFlatNo || null,
      totalMembers:  totalMembers  || 1,
      role: 'Resident', // Self-registered users are always Residents
    });

    const token = generateToken(resident._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      data: {
        _id:          resident._id,
        name:         resident.name,
        phone:        resident.phone,
        houseOrFlatNo: resident.houseOrFlatNo,
        totalMembers: resident.totalMembers,
        role:         resident.role,
        token,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Phone and password are required.' });
    }

    // Explicitly select password back in (it is excluded by default in the schema)
    const resident = await Resident.findOne({ phone }).select('+password');

    if (!resident || !(await resident.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid phone number or password.' });
    }

    const token = generateToken(resident._id);

    res.json({
      success: true,
      data: {
        _id:           resident._id,
        name:          resident.name,
        phone:         resident.phone,
        houseOrFlatNo: resident.houseOrFlatNo,
        totalMembers:  resident.totalMembers,
        role:          resident.role,
        token,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/seed-admin ────────────────────────────────────────────────
/**
 * Creates the first SuperAdmin account from environment variables.
 * Only works when ZERO SuperAdmin accounts exist — self-disables after first use.
 */
const seedAdmin = async (req, res, next) => {
  try {
    // Guard: refuse if a SuperAdmin already exists
    const existingAdmin = await Resident.findOne({ role: 'SuperAdmin' });
    if (existingAdmin) {
      return res.status(409).json({
        success: false,
        message: 'A SuperAdmin account already exists. Seed endpoint is disabled.',
      });
    }

    const phone = process.env.ADMIN_PHONE;
    const name  = process.env.ADMIN_NAME  || 'Super Admin';
    const pass  = process.env.ADMIN_PASS  || 'Admin@1234';

    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'ADMIN_PHONE is missing or invalid in server .env. Set a 10-digit number and restart the server.',
      });
    }

    // Check if a resident with this phone already exists (promote them)
    let admin = await Resident.findOne({ phone });
    if (admin) {
      admin.role = 'SuperAdmin';
      await admin.save();
    } else {
      admin = await Resident.create({
        name,
        phone,
        password:     pass,
        totalMembers: 1,
        role:         'SuperAdmin',   // Platform-level super admin
        societyId:    null,
      });
    }

    const token = generateToken(admin._id);

    res.status(201).json({
      success: true,
      message: `Admin account seeded for ${admin.name} (${admin.phone}).`,
      data: {
        _id:   admin._id,
        name:  admin.name,
        phone: admin.phone,
        role:  admin.role,
        token,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/change-password ──────────────────────────────────────────
/**
 * Authenticated route: allows any logged-in user to change their own password.
 * Requires the current password to be correct before accepting the new one.
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both currentPassword and newPassword are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    // Re-fetch with password field (excluded by default via schema select: false)
    const resident = await Resident.findById(req.user._id).select('+password');
    if (!resident) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    const isMatch = await resident.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    resident.password = newPassword;  // Pre-save hook will hash it automatically
    await resident.save();

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, seedAdmin, changePassword };
