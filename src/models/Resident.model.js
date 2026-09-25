/**
 * models/Resident.model.js
 *
 * Represents a society resident (user).
 *
 * Role hierarchy:
 *   SuperAdmin — platform owner; can create/manage societies; not bound to one society
 *   Admin      — society organiser; manages residents/events/expenses for their society
 *   Resident   — society member; can view dashboard and log own expenses
 */
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const residentSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, 'Name is required'],
      trim:     true,
    },
    phone: {
      type:     String,
      required: [true, 'Phone number is required'],
      unique:   true,
      trim:     true,
      match:    [/^\d{10}$/, 'Phone must be a valid 10-digit number'],
    },
    password: {
      type:      String,
      required:  [true, 'Password is required'],
      minlength: 6,
      select:    false,
    },
    houseOrFlatNo: {
      type:    String,
      trim:    true,
      default: null,
    },
    totalMembers: {
      type:     Number,
      required: [true, 'Total family members is required'],
      min:      [1, 'At least 1 member is required'],
      default:  1,
    },
    role: {
      type:    String,
      enum:    ['SuperAdmin', 'Admin', 'Resident'],
      default: 'Resident',
    },
    /**
     * societyId links a user to their society.
     * SuperAdmin has no societyId (manages all societies).
     * Admin and Resident must belong to exactly one society.
     */
    societyId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Society',
      default: null,
      index:   true,
    },
  },
  { timestamps: true }
);

// ─── Pre-save: hash password ───────────────────────────────────────────────
residentSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ─── Instance method: compare password ────────────────────────────────────
residentSchema.methods.matchPassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('Resident', residentSchema);
