/**
 * models/Society.model.js
 *
 * A Society is a top-level tenant. One SuperAdmin creates/manages societies.
 * Each society has its own Admin(s), Residents, Events, Contributions, Expenses.
 *
 * Roles hierarchy:
 *   SuperAdmin  — platform owner, manages societies, not tied to any one society
 *   Admin       — society organiser, manages residents/events/expenses for THEIR society
 *   Resident    — member of a society, read-only + can log own expenses
 */
const mongoose = require('mongoose');

const societySchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, 'Society name is required'],
      trim:     true,
    },
    address: {
      type:    String,
      trim:    true,
      default: '',
    },
    city: {
      type:    String,
      trim:    true,
      default: '',
    },
    /** The SuperAdmin-level user who created this society */
    createdBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Resident',
      required: true,
    },
    isActive: {
      type:    Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Society', societySchema);
