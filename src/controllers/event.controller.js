/**
 * controllers/event.controller.js
 *
 * Manages society events and provides the real-time financial dashboard
 * summary (Total Collection, Total Expenses, Net Balance).
 */
const Event        = require('../models/Event.model');
const Contribution = require('../models/Contribution.model');
const Expense      = require('../models/Expense.model');
const Resident     = require('../models/Resident.model');
const { sendPushNotification } = require('../config/firebase');

// ─── POST /api/events (Admin only) ───────────────────────────────────────────
const createEvent = async (req, res, next) => {
  try {
    const { title, description, targetBudget, perHouseAmount, startDate, endDate, excludedResidents } = req.body;

    const societyId = req.user.societyId?._id || req.user.societyId;
    if (!societyId) {
      return res.status(400).json({ success: false, message: 'You must belong to a society to create events.' });
    }

    const event = await Event.create({
      societyId,
      title,
      description,
      targetBudget,
      perHouseAmount: perHouseAmount || 0,
      startDate:  startDate  || Date.now(),
      endDate:    endDate    || null,
      excludedResidents: Array.isArray(excludedResidents) ? excludedResidents : [],
      createdBy:  req.user._id,
    });

    // Asynchronous Push Notification broadcast to all society members
    (async () => {
      try {
        const recipients = await Resident.find({
          societyId,
          _id: { $ne: req.user._id },
        }).select('fcmTokens name');

        const allTokens = [...new Set(recipients.flatMap((r) => r.fcmTokens || []).filter(Boolean))];
        if (allTokens.length > 0) {
          const pushTitle = `🎊 New Society Event: ${event.title}`;
          const pushBody = event.targetBudget > 0
            ? `${event.title} has been scheduled. Target budget: ₹${Number(event.targetBudget).toLocaleString('en-IN')}.`
            : `A new society event "${event.title}" has been announced.`;

          await sendPushNotification({
            tokens: allTokens,
            title: pushTitle,
            body: pushBody,
            data: {
              type: 'NEW_EVENT',
              eventId: event._id.toString(),
            },
            channelId: 'society_general',
          });
        }
      } catch (pushErr) {
        console.warn('⚠️ [Event Push Notification Error]:', pushErr.message);
      }
    })();

    res.status(201).json({ success: true, message: 'Event created.', data: event });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/events ──────────────────────────────────────────────────────────
const getAllEvents = async (req, res, next) => {
  try {
    // Auto-close events whose endDate is in the past (before start of today)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    await Event.updateMany(
      {
        isActive: true,
        endDate: { $ne: null, $lt: startOfToday },
      },
      { $set: { isActive: false } }
    );

    // Scope events to the requester's society (SuperAdmin sees all)
    const filter = {};
    if (req.user.role !== 'SuperAdmin') {
      filter.societyId = req.user.societyId?._id || req.user.societyId;
    } else if (req.query.societyId) {
      filter.societyId = req.query.societyId;
    }

    // Exclude events for residents who have been explicitly excluded
    if (req.user.role === 'Resident') {
      filter.excludedResidents = { $ne: req.user._id };
    }

    const events = await Event.find(filter)
      .populate('createdBy', 'name phone')
      .populate('societyId', 'name')
      .populate('excludedResidents', 'name houseOrFlatNo phone')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: events });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/events/:id/dashboard ───────────────────────────────────────────
/**
 * Real-time financial summary for a single event.
 * Uses MongoDB $group aggregations to compute sums in one round-trip each.
 */
const getEventDashboard = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('excludedResidents', 'name houseOrFlatNo phone');
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    // Parallel aggregations for performance (Only Approved expenses affect financial balance)
    const [collectionResult, expenseResult, paidResidents, totalContributionsCount, expensesCount, pendingExpensesCount] =
      await Promise.all([
        Contribution.aggregate([
          { $match: { eventId: event._id } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Expense.aggregate([
          { $match: { eventId: event._id, status: 'Approved' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Contribution.distinct('residentId', { eventId: event._id, paymentStatus: { $in: ['Paid', 'Partial'] } }),
        Contribution.countDocuments({ eventId: event._id }),
        Expense.countDocuments({ eventId: event._id, status: 'Approved' }),
        Expense.countDocuments({ eventId: event._id, status: 'Pending' }),
      ]);

    const totalCollection = collectionResult[0]?.total ?? 0;
    const totalExpenses   = expenseResult[0]?.total   ?? 0;
    const netBalance      = totalCollection - totalExpenses;
    const budgetProgress  = event.targetBudget > 0
      ? Math.min(Math.round((totalCollection / event.targetBudget) * 100), 100)
      : 0;

    const paidPersonsCount = paidResidents.length;

    res.json({
      success: true,
      data: {
        event,
        totalCollection,
        totalExpenses,
        netBalance,
        budgetProgress,
        paidPersonsCount,
        contributorsCount: paidPersonsCount || totalContributionsCount,
        totalContributionsCount,
        expensesCount,
        pendingExpensesCount,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/events/:id (Admin only) ──────────────────────────────────────
const updateEvent = async (req, res, next) => {
  try {
    const allowed = ['title', 'description', 'targetBudget', 'perHouseAmount', 'startDate', 'endDate', 'isActive', 'excludedResidents'];
    const updates = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const event = await Event.findByIdAndUpdate(req.params.id, updates, {
      new:           true,
      runValidators: true,
    }).populate('excludedResidents', 'name houseOrFlatNo phone');
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });
    res.json({ success: true, data: event });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/events/:id (Admin only) ─────────────────────────────────────
/**
 * Deletes an event and all its associated contributions and expenses.
 * This is a cascading hard-delete. Only use on test/cancelled events.
 */
const deleteEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

    // Cascade delete linked records
    await Promise.all([
      Contribution.deleteMany({ eventId: event._id }),
      Expense.deleteMany({ eventId: event._id }),
      event.deleteOne(),
    ]);

    res.json({ success: true, message: 'Event and all related data deleted.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { createEvent, getAllEvents, getEventDashboard, updateEvent, deleteEvent };
