/**
 * controllers/society.controller.js
 *
 * SuperAdmin manages societies.
 * GET  /api/societies        — list all
 * POST /api/societies        — create
 * PATCH /api/societies/:id   — update name/address
 * DELETE /api/societies/:id  — soft-deactivate
 */
const Society  = require('../models/Society.model');
const Resident = require('../models/Resident.model');

// ─── POST /api/societies ──────────────────────────────────────────────────────
const createSociety = async (req, res, next) => {
  try {
    const { name, address, city } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Society name is required.' });
    }
    const society = await Society.create({
      name:      name.trim(),
      address:   address?.trim() || '',
      city:      city?.trim()    || '',
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, message: 'Society created.', data: society });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/societies ───────────────────────────────────────────────────────
const getAllSocieties = async (req, res, next) => {
  try {
    const societies = await Society.find()
      .populate('createdBy', 'name phone')
      .sort({ createdAt: -1 });

    // Attach resident count per society
    const counts = await Resident.aggregate([
      { $match: { societyId: { $ne: null } } },
      { $group: { _id: '$societyId', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach((c) => { countMap[c._id.toString()] = c.count; });

    // Attach assigned admins per society
    const admins = await Resident.find({ role: 'Admin', societyId: { $ne: null } })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    const adminMap = {};
    admins.forEach((a) => {
      const sId = a.societyId.toString();
      if (!adminMap[sId]) adminMap[sId] = [];
      adminMap[sId].push(a);
    });

    const data = societies.map((s) => {
      const sAdmins = adminMap[s._id.toString()] || [];
      return {
        ...s.toObject(),
        residentCount: countMap[s._id.toString()] || 0,
        admins: sAdmins,
        admin: sAdmins[0] || null,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/societies/:id ─────────────────────────────────────────────────
const updateSociety = async (req, res, next) => {
  try {
    const { name, address, city, isActive } = req.body;
    const society = await Society.findByIdAndUpdate(
      req.params.id,
      { name, address, city, isActive },
      { new: true, runValidators: true }
    );
    if (!society) return res.status(404).json({ success: false, message: 'Society not found.' });
    res.json({ success: true, data: society });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/societies/:id ────────────────────────────────────────────────
const deleteSociety = async (req, res, next) => {
  try {
    const society = await Society.findByIdAndDelete(req.params.id);
    if (!society) return res.status(404).json({ success: false, message: 'Society not found.' });
    res.json({ success: true, message: 'Society deleted.' });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/societies/:id/admins ───────────────────────────────────────────
const getSocietyAdmins = async (req, res, next) => {
  try {
    const admins = await Resident.find({
      societyId: req.params.id,
      role: 'Admin',
    }).select('-password');
    res.json({ success: true, data: admins });
  } catch (err) {
    next(err);
  }
};

module.exports = { createSociety, getAllSocieties, updateSociety, deleteSociety, getSocietyAdmins };
