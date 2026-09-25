/**
 * controllers/expense.controller.js
 *
 * Handles expense logging (with optional Cloudinary bill image)
 * and expense listing for the transparency feed.
 */
const Expense = require('../models/Expense.model');
const Event   = require('../models/Event.model');

// ─── POST /api/expenses ───────────────────────────────────────────────────────
const logExpense = async (req, res, next) => {
  try {
    const { eventId, title, amount, category, notes, date } = req.body;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

    // req.file is set by Multer/Cloudinary middleware when a file is uploaded
    const receiptImageUrl = req.file?.path ?? null;

    // Admin created expenses default to Approved; Resident logged expenses default to Pending
    const status = (req.user.role === 'Admin' || req.user.role === 'SuperAdmin')
      ? (req.body.status || 'Approved')
      : 'Pending';

    let recordedBy = req.user._id;
    if ((req.user.role === 'Admin' || req.user.role === 'SuperAdmin') && req.body.residentId) {
      recordedBy = req.body.residentId;
    }

    const expense = await Expense.create({
      societyId:       event.societyId,
      eventId,
      title,
      amount,
      category:        category  || 'Miscellaneous',
      receiptImageUrl,
      notes:           notes     || '',
      status,
      recordedBy,
      approvedBy:      status === 'Approved' ? req.user._id : null,
      approvedAt:      status === 'Approved' ? Date.now() : null,
      date:            date      || Date.now(),
    });

    await expense.populate([
      { path: 'eventId',    select: 'title' },
      { path: 'recordedBy', select: 'name houseOrFlatNo phone' },
      { path: 'approvedBy', select: 'name' },
    ]);

    res.status(201).json({ success: true, message: 'Expense logged.', data: expense });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/expenses?eventId=:id ────────────────────────────────────────────
const getExpenses = async (req, res, next) => {
  try {
    const filter = {};

    // Scope to user's society if user belongs to one and is not SuperAdmin
    if (req.user && req.user.role !== 'SuperAdmin') {
      const sId = req.user.societyId?._id || req.user.societyId;
      if (sId) filter.societyId = sId;
    }

    if (req.query.eventId) {
      filter.eventId = req.query.eventId;
    }

    const expenses = await Expense.find(filter)
      .populate('eventId',    'title')
      .populate('recordedBy', 'name houseOrFlatNo phone')
      .populate('approvedBy', 'name')
      .sort({ date: -1 });

    // Category breakdown should sum ONLY Approved expenses for event metrics
    const matchQuery = { status: 'Approved' };
    if (req.query.eventId) {
      const mongoose = require('mongoose');
      matchQuery.eventId = new mongoose.Types.ObjectId(req.query.eventId);
    } else if (filter.societyId) {
      const mongoose = require('mongoose');
      matchQuery.societyId = new mongoose.Types.ObjectId(filter.societyId.toString());
    }

    const categoryBreakdown = await Expense.aggregate([
      { $match: matchQuery },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort:  { total: -1 } },
    ]);

    res.json({
      success: true,
      count:   expenses.length,
      data:    expenses,
      categoryBreakdown,
    });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/expenses/:id/status (Admin only) ──────────────────────────────
const updateExpenseStatus = async (req, res, next) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be Pending, Approved, or Rejected.' });
    }

    const updates = {
      status,
      approvedBy: req.user._id,
      approvedAt: status === 'Approved' ? Date.now() : null,
      rejectionReason: status === 'Rejected' ? (rejectionReason?.trim() || 'No specific reason provided') : '',
    };

    const expense = await Expense.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('eventId',    'title')
      .populate('recordedBy', 'name')
      .populate('approvedBy', 'name');

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found.' });
    }

    res.json({ success: true, message: `Expense status updated to ${status}.`, data: expense });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/expenses/:id (Resident/Admin edit) ─────────────────────────────
const updateExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found.' });
    }

    // Permission check: Residents can only edit their own expenses
    const isOwner = expense.recordedBy?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'Admin' || req.user.role === 'SuperAdmin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'You do not have permission to edit this expense.' });
    }

    // Restriction check: Approved expenses CANNOT be edited
    if (expense.status === 'Approved') {
      return res.status(403).json({
        success: false,
        message: 'This expense has been Approved by an Admin and cannot be edited.',
      });
    }

    const { title, amount, category, notes, date } = req.body;
    if (title) expense.title = title.trim();
    if (amount) expense.amount = Number(amount);
    if (category) expense.category = category;
    if (notes !== undefined) expense.notes = notes.trim();
    if (date) expense.date = date;
    if (req.file?.path) expense.receiptImageUrl = req.file.path;

    // Reset status to Pending when edited so admin can re-review
    expense.status = 'Pending';
    expense.rejectionReason = '';
    await expense.save();

    await expense.populate([
      { path: 'eventId', select: 'title' },
      { path: 'recordedBy', select: 'name' },
      { path: 'approvedBy', select: 'name' },
    ]);

    res.json({ success: true, message: 'Expense updated and submitted for approval.', data: expense });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/expenses/:id (Admin or Owner) ──────────────────────────────────
const deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found.' });
    }

    const isOwner = expense.recordedBy?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'Admin' || req.user.role === 'SuperAdmin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'You do not have permission to delete this expense.' });
    }

    if (expense.status === 'Approved' && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Approved expenses can only be deleted by an Admin.' });
    }

    await expense.deleteOne();
    res.json({ success: true, message: 'Expense deleted.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { logExpense, getExpenses, updateExpenseStatus, updateExpense, deleteExpense };
