/**
 * models/Complaint.model.js
 *
 * Member Requests & Complaints (Helpdesk).
 *
 * PRIVACY SPECIFICATION:
 * Submitted by individual society residents.
 * Visible ONLY to the creator resident and Society Admins.
 * Other society residents CANNOT view another member's complaints or requests.
 */
const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    title: {
      type:      String,
      required:  [true, 'Title is required'],
      trim:      true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    description: {
      type:     String,
      required: [true, 'Description is required'],
      trim:     true,
    },
    type: {
      type:    String,
      enum:    ['Complaint', 'Request'],
      default: 'Complaint',
      index:   true,
    },
    category: {
      type:    String,
      enum:    [
        'Plumbing',
        'Electrical',
        'Cleanliness',
        'Noise',
        'Parking',
        'Security',
        'Maintenance',
        'Billing',
        'Other',
      ],
      default: 'Other',
    },
    priority: {
      type:    String,
      enum:    ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    status: {
      type:    String,
      enum:    ['Pending', 'In Progress', 'Resolved', 'Rejected'],
      default: 'Pending',
      index:   true,
    },
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
    unitOrFlat: {
      type:    String,
      trim:    true,
      default: '',
    },
    adminResponse: {
      type:    String,
      trim:    true,
      default: '',
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Complaint', complaintSchema);
