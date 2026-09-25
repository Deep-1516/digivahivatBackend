/**
 * models/Contribution.model.js
 *
 * Records a single "Falo" payment from a resident toward an event.
 * Supports full, partial, or pending payment states.
 *
 * contributionType:
 *   'Event'  — linked to a specific event (Ganesh Utsav, Navratri, etc.)
 *   'Annual' — yearly society maintenance fund, not tied to any event
 *              (used by societies that collect a lump-sum fund once a year)
 */
const mongoose = require('mongoose');

const contributionSchema = new mongoose.Schema(
  {
    /**
     * contributionType distinguishes between event-specific collections
     * and annual/maintenance fund collections.
     */
    contributionType: {
      type: String,
      enum: ['Event', 'Annual'],
      default: 'Event',
      index: true,
    },
    societyId: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   'Society',
      index: true,
    },
    eventId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Event',
      default: null,
      index:   true,
    },
    /**
     * annualYear is used when contributionType === 'Annual'.
     * Stored as a 4-digit number e.g. 2026.
     */
    annualYear: {
      type: Number,
      default: null,
    },
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resident',
      required: [true, 'Resident ID is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Contribution amount is required'],
      min: [1, 'Amount must be greater than 0'],
    },
    paymentMode: {
      type: String,
      enum: ['Cash', 'UPI'],
      default: 'Cash',
    },
    paymentStatus: {
      type: String,
      enum: ['Paid', 'Pending', 'Partial'],
      default: 'Paid',
    },
    /**
     * transactionId is only relevant for UPI payments.
     * Stored for audit/reconciliation purposes.
     */
    transactionId: {
      type: String,
      trim: true,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resident', // The Admin who recorded the payment
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// ─── Compound index: one document per resident per event (optional enforcement)
// Remove this if partial/multiple payments per resident are allowed.
// contributionSchema.index({ eventId: 1, residentId: 1 }, { unique: true });

module.exports = mongoose.model('Contribution', contributionSchema);
