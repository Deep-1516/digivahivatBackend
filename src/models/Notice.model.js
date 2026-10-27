/**
 * models/Notice.model.js
 *
 * Notice Board announcements for the society.
 * Posted by Admin; visible to all members of that society.
 */
const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type:      String,
      required:  [true, 'Notice title is required'],
      trim:      true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    description: {
      type:     String,
      required: [true, 'Notice description is required'],
      trim:     true,
    },
    category: {
      type:    String,
      enum:    ['General', 'Maintenance', 'Meeting', 'Festival', 'Emergency', 'Rules'],
      default: 'General',
    },
    priority: {
      type:    String,
      enum:    ['Normal', 'High', 'Urgent'],
      default: 'Normal',
    },
    societyId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Society',
      required: [true, 'Society ID is required'],
      index:    true,
    },
    postedBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Resident',
      required: [true, 'Posted by admin reference is required'],
    },
    pinned: {
      type:    Boolean,
      default: false,
    },
    isActive: {
      type:    Boolean,
      default: true,
      index:   true,
    },
    expiresAt: {
      type:    Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notice', noticeSchema);
