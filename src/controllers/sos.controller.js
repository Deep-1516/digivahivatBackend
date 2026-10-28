/**
 * controllers/sos.controller.js
 *
 * Handles emergency SOS alert creation, real-time status tracking,
 * guard/admin response acknowledgement, and incident resolution.
 */
const EmergencyAlert = require('../models/EmergencyAlert.model');
const Resident       = require('../models/Resident.model');

// ─── POST /api/sos (Trigger SOS) ─────────────────────────────────────────────
const triggerAlert = async (req, res, next) => {
  try {
    const { type = 'General', description = '', flatNo: passedFlatNo } = req.body;
    const resident = await Resident.findById(req.user._id);
    if (!resident) {
      return res.status(404).json({ success: false, message: 'Resident not found.' });
    }

    const societyId = resident.societyId || req.user.societyId?._id || req.user.societyId;
    if (!societyId) {
      return res.status(400).json({ success: false, message: 'No society associated with user.' });
    }

    const flatNo = passedFlatNo || resident.houseOrFlatNo || 'General Area';

    // Guard against duplicate active alerts from the same resident
    const existing = await EmergencyAlert.findOne({
      societyId,
      residentId: resident._id,
      status:     { $in: ['Active', 'Responding'] },
    }).populate('residentId', 'name phone houseOrFlatNo');

    if (existing) {
      if (type && type !== existing.type) existing.type = type;
      if (description) existing.description = description;
      await existing.save();
      return res.status(200).json({
        success: true,
        message: 'Active emergency alert already exists and has been updated.',
        data:    existing,
      });
    }

    const alert = await EmergencyAlert.create({
      societyId,
      residentId: resident._id,
      flatNo,
      type,
      description: description.trim(),
      status:      'Active',
    });

    await alert.populate([
      { path: 'residentId', select: 'name phone houseOrFlatNo' },
    ]);

    res.status(201).json({
      success: true,
      message: '🚨 Emergency SOS broadcasted successfully to security and society admins.',
      data:    alert,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/sos/active ─────────────────────────────────────────────────────
const getActiveAlerts = async (req, res, next) => {
  try {
    const societyId = req.user.societyId?._id || req.user.societyId;
    if (!societyId) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    const alerts = await EmergencyAlert.find({
      societyId,
      status: { $in: ['Active', 'Responding'] },
    })
      .populate('residentId',     'name phone houseOrFlatNo')
      .populate('acknowledgedBy', 'name phone')
      .populate('resolvedBy',     'name phone')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: alerts.length, data: alerts });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/sos/history ────────────────────────────────────────────────────
const getAlertHistory = async (req, res, next) => {
  try {
    const societyId = req.user.societyId?._id || req.user.societyId;
    if (!societyId) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    const alerts = await EmergencyAlert.find({
      societyId,
      status: { $in: ['Resolved', 'Cancelled'] },
    })
      .populate('residentId',     'name phone houseOrFlatNo')
      .populate('acknowledgedBy', 'name phone')
      .populate('resolvedBy',     'name phone')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, count: alerts.length, data: alerts });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/sos/:id/acknowledge (Help is on the way) ───────────────────────
const acknowledgeAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    const alert = await EmergencyAlert.findById(id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Emergency alert not found.' });
    }

    alert.status         = 'Responding';
    alert.acknowledgedBy = req.user._id;
    alert.acknowledgedAt = new Date();
    await alert.save();

    await alert.populate([
      { path: 'residentId',     select: 'name phone houseOrFlatNo' },
      { path: 'acknowledgedBy', select: 'name phone' },
    ]);

    res.json({
      success: true,
      message: 'Alert acknowledged. Help is reported as responding.',
      data:    alert,
    });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/sos/:id/resolve (Incident handled) ─────────────────────────────
const resolveAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes = '' } = req.body;

    const alert = await EmergencyAlert.findById(id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Emergency alert not found.' });
    }

    alert.status          = 'Resolved';
    alert.resolvedBy      = req.user._id;
    alert.resolvedAt      = new Date();
    alert.resolutionNotes = notes.trim();
    await alert.save();

    await alert.populate([
      { path: 'residentId',     select: 'name phone houseOrFlatNo' },
      { path: 'acknowledgedBy', select: 'name phone' },
      { path: 'resolvedBy',     select: 'name phone' },
    ]);

    res.json({
      success: true,
      message: 'Emergency alert marked as resolved and safely closed.',
      data:    alert,
    });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/sos/:id/cancel (Cancel by sender or admin) ─────────────────────
const cancelAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason = 'Cancelled by resident' } = req.body;

    const alert = await EmergencyAlert.findById(id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Emergency alert not found.' });
    }

    const isOwner = alert.residentId.toString() === req.user._id.toString();
    const isAdmin = ['Admin', 'SuperAdmin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to cancel this alert.' });
    }

    alert.status          = 'Cancelled';
    alert.resolvedBy      = req.user._id;
    alert.resolvedAt      = new Date();
    alert.resolutionNotes = reason.trim();
    await alert.save();

    await alert.populate([
      { path: 'residentId', select: 'name phone houseOrFlatNo' },
      { path: 'resolvedBy', select: 'name phone' },
    ]);

    res.json({
      success: true,
      message: 'Emergency alert cancelled.',
      data:    alert,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  triggerAlert,
  getActiveAlerts,
  getAlertHistory,
  acknowledgeAlert,
  resolveAlert,
  cancelAlert,
};
