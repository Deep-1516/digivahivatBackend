/**
 * models/EmergencyAlert.model.js
 *
 * Stores society SOS emergency alerts triggered by residents.
 */
const mongoose = require('mongoose');

const emergencyAlertSchema = new mongoose.Schema(
  {
    societyId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Society',
      required: true,
      index:    true,
    },
    residentId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Resident',
      required: true,
    },
    flatNo: {
      type:     String,
      trim:     true,
      required: true,
    },
    type: {
      type:    String,
      enum:    ['Medical', 'Fire', 'LiftStuck', 'Security', 'General'],
      default: 'General',
    },
    description: {
      type:    String,
      trim:    true,
      default: '',
    },
    status: {
      type:    String,
      enum:    ['Active', 'Responding', 'Resolved', 'Cancelled'],
      default: 'Active',
      index:   true,
    },
    acknowledgedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Resident',
      default: null,
    },
    acknowledgedAt: {
      type:    Date,
      default: null,
    },
    resolvedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Resident',
      default: null,
    },
    resolvedAt: {
      type:    Date,
      default: null,
    },
    resolutionNotes: {
      type:    String,
      trim:    true,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmergencyAlert', emergencyAlertSchema);
