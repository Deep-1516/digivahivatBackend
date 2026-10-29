/**
 * controllers/complaint.controller.js
 *
 * Member Requests & Complaints (Helpdesk).
 *
 * PRIVACY SPECIFICATION:
 * - A member/resident can submit requests/complaints.
 * - In getComplaints, a Resident will ONLY receive their OWN requests/complaints.
 *   Under NO circumstances can Resident A view Resident B's complaints.
 * - Society Admins can view and manage all complaints from members of their society.
 */
const Complaint = require('../models/Complaint.model');
const Resident = require('../models/Resident.model');
const { sendPushNotification } = require('../config/firebase');

// ─── POST /api/complaints (Residents & Admins) ────────────────────────────────
const createComplaint = async (req, res, next) => {
  try {
    const { title, description, type, category, priority, unitOrFlat } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required.' });
    }

    const targetSocietyId =
      req.user.societyId?._id || req.user.societyId || req.body.societyId;

    if (!targetSocietyId) {
      return res.status(400).json({ success: false, message: 'Society ID could not be identified.' });
    }

    const complaint = await Complaint.create({
      title:       title.trim(),
      description: description.trim(),
      type:        type === 'Request' ? 'Request' : 'Complaint',
      category:    category || 'Other',
      priority:    priority || 'Medium',
      unitOrFlat:  unitOrFlat?.trim() || req.user.houseOrFlatNo || '',
      societyId:   targetSocietyId,
      residentId:  req.user._id,
      status:      'Pending',
    });

    await complaint.populate([
      { path: 'residentId', select: 'name phone houseOrFlatNo' },
    ]);

    // Asynchronous Push Notification to Society Admins
    (async () => {
      try {
        const admins = await Resident.find({
          societyId: targetSocietyId,
          role: { $in: ['Admin', 'SuperAdmin'] },
          _id: { $ne: req.user._id },
        }).select('fcmTokens name');

        const adminTokens = [...new Set(admins.flatMap((a) => a.fcmTokens || []).filter(Boolean))];
        if (adminTokens.length > 0) {
          const flatLabel = complaint.unitOrFlat
            ? `Flat ${complaint.unitOrFlat}`
            : (req.user.houseOrFlatNo ? `Flat ${req.user.houseOrFlatNo}` : 'Resident');
          await sendPushNotification({
            tokens: adminTokens,
            title: `📝 New ${complaint.type}: ${flatLabel}`,
            body: `${req.user.name} submitted a ${complaint.category} ${complaint.type.toLowerCase()}: "${complaint.title}"`,
            data: {
              type: 'NEW_COMPLAINT',
              complaintId: complaint._id.toString(),
            },
            channelId: 'society_general',
          });
        }
      } catch (pushErr) {
        console.warn('⚠️ [Admin Complaint Notification Error]:', pushErr.message);
      }
    })();

    res.status(201).json({
      success: true,
      message: `${complaint.type} submitted successfully. Society Admins have been notified.`,
      data: complaint,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/complaints (Protected) ──────────────────────────────────────────
const getComplaints = async (req, res, next) => {
  try {
    const filter = {};

    // ── PRIVACY ENFORCEMENT ──────────────────────────────────────────────────
    if (req.user.role === 'Resident') {
      // Residents can ONLY view their OWN requests & complaints.
      // Other members cannot see this.
      filter.residentId = req.user._id;
      const userSociety = req.user.societyId?._id || req.user.societyId;
      if (userSociety) filter.societyId = userSociety;
    } else if (req.user.role === 'Admin') {
      // Admins see all requests & complaints from their society members
      const adminSociety = req.user.societyId?._id || req.user.societyId;
      if (!adminSociety) {
        return res.status(400).json({ success: false, message: 'Admin society not found.' });
      }
      filter.societyId = adminSociety;
    } else if (req.user.role === 'SuperAdmin') {
      if (req.query.societyId) filter.societyId = req.query.societyId;
    }

    // Optional query filters
    if (req.query.type)     filter.type     = req.query.type;
    if (req.query.status)   filter.status   = req.query.status;
    if (req.query.category) filter.category = req.query.category;

    const complaints = await Complaint.find(filter)
      .populate('residentId', 'name phone houseOrFlatNo')
      .populate('resolvedBy', 'name role')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: complaints.length, data: complaints });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/complaints/:id (Protected) ──────────────────────────────────────
const getComplaintById = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate('residentId', 'name phone houseOrFlatNo')
      .populate('resolvedBy', 'name role');

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Request / Complaint not found.' });
    }

    // ── PRIVACY VERIFICATION ──────────────────────────────────────────────────
    if (req.user.role === 'Resident') {
      // Must be the owner of the complaint
      if (complaint.residentId._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own complaints.',
        });
      }
    } else if (req.user.role === 'Admin') {
      const adminSociety = req.user.societyId?._id?.toString() || req.user.societyId?.toString();
      if (complaint.societyId.toString() !== adminSociety) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    res.json({ success: true, data: complaint });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/complaints/:id/status (Admin only) ───────────────────────────
const updateComplaintStatus = async (req, res, next) => {
  try {
    const { status, adminResponse } = req.body;

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Request / Complaint not found.' });
    }

    const adminSociety = req.user.societyId?._id?.toString() || req.user.societyId?.toString();
    if (req.user.role !== 'SuperAdmin' && complaint.societyId.toString() !== adminSociety) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (status) {
      complaint.status = status;
      if (['Resolved', 'Rejected'].includes(status)) {
        complaint.resolvedBy = req.user._id;
        complaint.resolvedAt = new Date();
      }
    }

    if (adminResponse !== undefined) {
      complaint.adminResponse = String(adminResponse).trim();
    }

    await complaint.save();
    await complaint.populate([
      { path: 'residentId', select: 'name phone houseOrFlatNo' },
      { path: 'resolvedBy', select: 'name role' },
    ]);

    // Asynchronous Push Notification to Creator Resident
    (async () => {
      try {
        const creator = await Resident.findById(complaint.residentId).select('fcmTokens name');
        if (creator && creator.fcmTokens?.length) {
          const statusIcon = complaint.status === 'Resolved' ? '✅' : complaint.status === 'Rejected' ? '❌' : '🔄';
          const pushTitle = `${statusIcon} Complaint ${complaint.status}: ${complaint.title}`;
          const pushBody = complaint.adminResponse
            ? `Admin response: "${complaint.adminResponse}"`
            : `Your ${complaint.type.toLowerCase()} has been marked as "${complaint.status}".`;

          await sendPushNotification({
            tokens: creator.fcmTokens,
            title: pushTitle,
            body: pushBody,
            data: {
              type: 'COMPLAINT_UPDATED',
              complaintId: complaint._id.toString(),
              status: complaint.status,
            },
            channelId: 'society_general',
          });
        }
      } catch (pushErr) {
        console.warn('⚠️ [Complaint Status Push Notification Error]:', pushErr.message);
      }
    })();

    res.json({
      success: true,
      message: `Status updated to "${complaint.status}".`,
      data: complaint,
    });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/complaints/:id ───────────────────────────────────────────────
const deleteComplaint = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Request / Complaint not found.' });
    }

    if (req.user.role === 'Resident') {
      // Resident can only delete their own if still Pending
      if (complaint.residentId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      if (complaint.status !== 'Pending') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete a request/complaint that is already in progress or resolved.',
        });
      }
    } else if (req.user.role === 'Admin') {
      const adminSociety = req.user.societyId?._id?.toString() || req.user.societyId?.toString();
      if (complaint.societyId.toString() !== adminSociety) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    await Complaint.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Record deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createComplaint,
  getComplaints,
  getComplaintById,
  updateComplaintStatus,
  deleteComplaint,
};
