/**
 * models/Visitor.model.js
 *
 * Pre-approved gate pass and visitor management model.
 * Supports QR code tokens, 6-digit backup passcode, member count,
 * destination flat, check-in, and check-out timestamps.
 */
const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema(
  {
    societyId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Society',
      required: [true, 'Society ID is required'],
      index:    true,
    },
    residentId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Resident',
      required: [true, 'Resident ID is required'],
      index:    true,
    },
    flatNo: {
      type:     String,
      required: [true, 'Flat or house number is required'],
      trim:     true,
    },
    visitorName: {
      type:     String,
      required: [true, 'Visitor name is required'],
      trim:     true,
    },
    visitorPhone: {
      type: String,
      trim: true,
      default: '',
    },
    visitorType: {
      type:    String,
      enum:    ['Guest', 'Delivery', 'Cab', 'Service', 'Other'],
      default: 'Guest',
    },
    companyName: {
      type: String,
      trim: true,
      default: '',
    },
    vehicleNumber: {
      type: String,
      trim: true,
      default: '',
    },
    numberOfMembers: {
      type:    Number,
      default: 1,
      min:     [1, 'Number of members must be at least 1'],
    },
    passcode: {
      type:     String,
      required: true,
      index:    true,
      uppercase: true,
      trim:     true,
    },
    qrToken: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
    },
    qrCodeDataUrl: {
      type:    String,
      default: '',
    },
    status: {
      type:    String,
      enum:    ['PreApproved', 'Inside', 'Exited', 'Cancelled', 'Expired'],
      default: 'PreApproved',
      index:   true,
    },
    validFrom: {
      type:    Date,
      default: Date.now,
    },
    validUntil: {
      type:    Date,
      required: true,
    },
    entryTime: {
      type: Date,
      default: null,
    },
    exitTime: {
      type: Date,
      default: null,
    },
    verifiedByGuardId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Resident',
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast query lookup
visitorSchema.index({ societyId: 1, status: 1, createdAt: -1 });
visitorSchema.index({ societyId: 1, flatNo: 1 });
visitorSchema.index({ societyId: 1, passcode: 1 });

module.exports = mongoose.model('Visitor', visitorSchema);
