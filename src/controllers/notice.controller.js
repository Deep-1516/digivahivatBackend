/**
 * controllers/notice.controller.js
 *
 * Notice Board management for societies.
 * Admins post notices; all society residents can read them.
 */
const Notice = require('../models/Notice.model');
const Resident = require('../models/Resident.model');
const { sendPushNotification } = require('../config/firebase');

// ─── POST /api/notices (Admin only) ──────────────────────────────────────────
const createNotice = async (req, res, next) => {
  try {
    const { title, description, category, priority, pinned, expiresAt } = req.body;

    const targetSocietyId =
      req.user.societyId?._id || req.user.societyId || req.body.societyId;

    if (!targetSocietyId) {
      return res.status(400).json({ success: false, message: 'Society ID is required.' });
    }

    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required.' });
    }

    const notice = await Notice.create({
      title:       title.trim(),
      description: description.trim(),
      category:    category || 'General',
      priority:    priority || 'Normal',
      pinned:      Boolean(pinned),
      expiresAt:   expiresAt || null,
      societyId:   targetSocietyId,
      postedBy:    req.user._id,
    });

    await notice.populate('postedBy', 'name role');

    // Asynchronous Push Notification broadcast to all society members
    (async () => {
      try {
        const recipients = await Resident.find({
          societyId: targetSocietyId,
          _id: { $ne: req.user._id },
        }).select('fcmTokens name');

        const allTokens = [...new Set(recipients.flatMap((r) => r.fcmTokens || []).filter(Boolean))];
        if (allTokens.length > 0) {
          const isUrgent = notice.priority === 'Urgent';
          const pushTitle = isUrgent
            ? `🚨 URGENT NOTICE: ${notice.title}`
            : `📢 Society Notice: ${notice.title}`;
          const pushBody =
            notice.description.length > 120
              ? `${notice.description.substring(0, 117)}...`
              : notice.description;

          await sendPushNotification({
            tokens: allTokens,
            title: pushTitle,
            body: pushBody,
            data: {
              type: 'NOTICE',
              noticeId: notice._id.toString(),
              category: notice.category || 'General',
              priority: notice.priority || 'Normal',
            },
            channelId: isUrgent ? 'emergency_sos_alarm' : 'society_general',
            priority: 'high',
          });
        }
      } catch (pushErr) {
        console.warn('⚠️ [Notice Notification Error]:', pushErr.message);
      }
    })();

    res.status(201).json({ success: true, message: 'Notice posted successfully.', data: notice });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/notices (Residents & Admins) ────────────────────────────────────
const getNotices = async (req, res, next) => {
  try {
    const targetSocietyId =
      req.user.societyId?._id || req.user.societyId || req.query.societyId;

    if (!targetSocietyId && req.user.role !== 'SuperAdmin') {
      return res.status(400).json({ success: false, message: 'Society ID could not be identified.' });
    }

    const filter = {};
    if (targetSocietyId) filter.societyId = targetSocietyId;

    // By default, members only see active notices
    if (req.query.includeInactive !== 'true') {
      filter.isActive = true;
    }

    if (req.query.category) {
      filter.category = req.query.category;
    }

    const notices = await Notice.find(filter)
      .populate('postedBy', 'name role')
      .sort({ pinned: -1, createdAt: -1 });

    res.json({ success: true, count: notices.length, data: notices });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/notices/:id (Residents & Admins) ────────────────────────────────
const getNoticeById = async (req, res, next) => {
  try {
    const notice = await Notice.findById(req.params.id).populate('postedBy', 'name role');
    if (!notice) {
      return res.status(404).json({ success: false, message: 'Notice not found.' });
    }

    const userSociety = req.user.societyId?._id?.toString() || req.user.societyId?.toString();
    if (req.user.role !== 'SuperAdmin' && userSociety && notice.societyId.toString() !== userSociety) {
      return res.status(403).json({ success: false, message: 'Access denied to notice of another society.' });
    }

    res.json({ success: true, data: notice });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/notices/:id (Admin only) ─────────────────────────────────────
const updateNotice = async (req, res, next) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ success: false, message: 'Notice not found.' });
    }

    const userSociety = req.user.societyId?._id?.toString() || req.user.societyId?.toString();
    if (req.user.role !== 'SuperAdmin' && userSociety && notice.societyId.toString() !== userSociety) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const { title, description, category, priority, pinned, isActive, expiresAt } = req.body;
    if (title !== undefined)       notice.title = title.trim();
    if (description !== undefined) notice.description = description.trim();
    if (category !== undefined)    notice.category = category;
    if (priority !== undefined)    notice.priority = priority;
    if (pinned !== undefined)      notice.pinned = Boolean(pinned);
    if (isActive !== undefined)    notice.isActive = Boolean(isActive);
    if (expiresAt !== undefined)   notice.expiresAt = expiresAt;

    await notice.save();
    await notice.populate('postedBy', 'name role');

    res.json({ success: true, message: 'Notice updated successfully.', data: notice });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/notices/:id (Admin only) ─────────────────────────────────────
const deleteNotice = async (req, res, next) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ success: false, message: 'Notice not found.' });
    }

    const userSociety = req.user.societyId?._id?.toString() || req.user.societyId?.toString();
    if (req.user.role !== 'SuperAdmin' && userSociety && notice.societyId.toString() !== userSociety) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    await Notice.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Notice deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createNotice,
  getNotices,
  getNoticeById,
  updateNotice,
  deleteNotice,
};
