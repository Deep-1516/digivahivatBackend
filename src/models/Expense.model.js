/**
 * models/Expense.model.js
 *
 * Tracks a single expense incurred during an event
 * (e.g., decoration purchase, prasad, sound system rental).
 * Optional receipt image stored via Cloudinary URL.
 */
const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    societyId: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   'Society',
      index: true,
    },
    eventId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Event',
      required: [true, 'Event ID is required'],
      index:    true,
    },
    title: {
      type: String,
      required: [true, 'Expense title is required'],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Expense amount is required'],
      min: [1, 'Amount must be greater than 0'],
    },
    category: {
      type: String,
      enum: [
        'Decoration',
        'Panditji/Pooja',
        'Mahaprasad/Food',
        'Sound/Lighting',
        'Miscellaneous',
      ],
      default: 'Miscellaneous',
    },
    /**
     * receiptImageUrl stores the Cloudinary secure_url of the uploaded
     * bill/receipt photo. Null if no receipt is attached.
     */
    receiptImageUrl: {
      type: String,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resident',
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resident',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', expenseSchema);
