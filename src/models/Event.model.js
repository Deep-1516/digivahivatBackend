/**
 * models/Event.model.js
 *
 * A society event (e.g., "Ganesh Utsav 2026").
 *
 * targetBudget   — total budget for the whole event
 * perHouseAmount — suggested contribution per house/flat.
 *                  When set, the Collect Falo form auto-fills this as the default amount.
 *                  This is just a suggestion; Admin can still edit before saving.
 */
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    /** Society this event belongs to */
    societyId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Society',
      required: [true, 'Society ID is required'],
      index:    true,
    },
    title: {
      type:     String,
      required: [true, 'Event title is required'],
      trim:     true,
    },
    description: {
      type:    String,
      trim:    true,
      default: '',
    },
    targetBudget: {
      type:     Number,
      required: [true, 'Target budget is required'],
      min:      [1, 'Budget must be a positive number'],
    },
    /**
     * Suggested per-house contribution amount.
     * Auto-filled in the Collect Falo form when a resident is selected.
     * 0 or null = no suggestion (admin enters manually).
     * Example: total budget ₹50,000 / 50 houses = ₹1,000 per house.
     */
    perHouseAmount: {
      type:    Number,
      default: 0,
      min:     [0, 'Per-house amount cannot be negative'],
    },
    startDate: {
      type:    Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    isActive: {
      type:    Boolean,
      default: true,
    },
    createdBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Resident',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Event', eventSchema);
