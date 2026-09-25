/**
 * controllers/resident.controller.js
 *
 * Multi-tenant resident management.
 *
 * SuperAdmin — can see/manage all residents across all societies
 * Admin      — can only see/manage residents within their own society
 *              can promote a Resident to Admin role within the same society
 * Resident   — can only read their own profile
 */
const Resident = require('../models/Resident.model');
const mongoose = require('mongoose');

// ─── POST /api/residents (Admin+) ────────────────────────────────────────────
/**
 * Admin adds a resident to their society.
 * SuperAdmin can pass an explicit societyId; Admin always uses their own.
 */
const addResident = async (req, res, next) => {
  try {
    const { name, phone, password, houseOrFlatNo, totalMembers, role, societyId } = req.body;

    // Determine which society to assign
    const targetSocietyId =
      req.user.role === 'SuperAdmin'
        ? societyId || null
        : req.user.societyId?._id || req.user.societyId;

    if (!targetSocietyId) {
      return res.status(400).json({ success: false, message: 'societyId is required.' });
    }

    // Admin can only assign Resident or Admin — not SuperAdmin
    const assignedRole = role && ['Admin', 'Resident'].includes(role) ? role : 'Resident';

    const existing = await Resident.findOne({ phone });
    if (existing) {
      return res.status(409).json({ success: false, message: 'A resident with this phone already exists.' });
    }

    const resident = await Resident.create({
      name,
      phone,
      password:      password || 'Member@123',
      houseOrFlatNo: houseOrFlatNo || null,
      totalMembers:  totalMembers  || 1,
      role:          assignedRole,
      societyId:     targetSocietyId,
    });

    res.status(201).json({
      success: true,
      message: 'Resident added successfully.',
      data: {
        _id:           resident._id,
        name:          resident.name,
        phone:         resident.phone,
        houseOrFlatNo: resident.houseOrFlatNo,
        totalMembers:  resident.totalMembers,
        role:          resident.role,
        societyId:     resident.societyId,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/residents ───────────────────────────────────────────────────────
/**
 * Returns residents scoped to the requester's society.
 * SuperAdmin: all residents (or filter by ?societyId=)
 * Admin/Resident: only their society
 */
const getAllResidents = async (req, res, next) => {
  try {
    let filter = {};

    if (req.user.role === 'SuperAdmin') {
      if (req.query.societyId) filter.societyId = req.query.societyId;
    } else {
      // Admin and Resident see only their society
      filter.societyId = req.user.societyId?._id || req.user.societyId;
    }

    const residents = await Resident.find(filter)
      .select('-password')
      .populate('societyId', 'name')
      .sort({ createdAt: -1 });

    // Society stats for the scoped set
    const matchStage = filter.societyId
      ? { societyId: new mongoose.Types.ObjectId(filter.societyId.toString()) }
      : {};

    const stats = await Resident.aggregate([
      { $match: matchStage },
      { $group: { _id: null, totalHouses: { $sum: 1 }, totalPopulation: { $sum: '$totalMembers' } } },
    ]);

    const { totalHouses = 0, totalPopulation = 0 } = stats[0] || {};

    res.json({
      success: true,
      data: {
        residents,
        societyStats: { totalHouses, totalPopulation },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/residents/me ────────────────────────────────────────────────────
const getMyProfile = async (req, res) => {
  res.json({ success: true, data: req.user });
};

// ─── PATCH /api/residents/:id (Admin+) ───────────────────────────────────────
/**
 * Update a resident. Admin can promote/demote Residents to Admin within
 * their own society. SuperAdmin can change anything.
 */
const updateResident = async (req, res, next) => {
  try {
    const { name, houseOrFlatNo, totalMembers, phone, role, password } = req.body;

    const resident = await Resident.findById(req.params.id);
    if (!resident) {
      return res.status(404).json({ success: false, message: 'Resident not found.' });
    }

    // Admin can only manage residents in their own society
    if (req.user.role === 'Admin') {
      const reqSociety = req.user.societyId?._id?.toString() || req.user.societyId?.toString();
      const resSociety = resident.societyId?.toString();
      if (reqSociety !== resSociety) {
        return res.status(403).json({ success: false, message: 'You can only manage residents in your own society.' });
      }
      // Admin cannot assign SuperAdmin role
      if (role === 'SuperAdmin') {
        return res.status(403).json({ success: false, message: 'Cannot assign SuperAdmin role.' });
      }
    }

    if (name         !== undefined) resident.name          = name;
    if (houseOrFlatNo!== undefined) resident.houseOrFlatNo = houseOrFlatNo || null;
    if (totalMembers !== undefined) resident.totalMembers  = totalMembers;
    if (phone        !== undefined) resident.phone         = phone;
    if (role         !== undefined) resident.role          = role;
    if (password     && password.trim().length >= 6) {
      resident.password = password;
    }

    await resident.save();

    const updated = await Resident.findById(resident._id)
      .select('-password')
      .populate('societyId', 'name');

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/residents/:id (Admin+) ──────────────────────────────────────
const deleteResident = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    }
    const resident = await Resident.findByIdAndDelete(req.params.id);
    if (!resident) {
      return res.status(404).json({ success: false, message: 'Resident not found.' });
    }
    res.json({ success: true, message: 'Resident removed.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { addResident, getAllResidents, getMyProfile, updateResident, deleteResident };
