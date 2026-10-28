/**
 * controllers/visitor.controller.js
 *
 * Handles pre-approved visitor passes with QR code generation,
 * gate check-in verification, live active visitor list, and checkout.
 */
const crypto   = require('crypto');
const QRCode   = require('qrcode');
const Visitor  = require('../models/Visitor.model');
const Resident = require('../models/Resident.model');

// Helper: Generate unique 6-digit passcode
function generateNumericPasscode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── POST /api/visitors/pre-approve ──────────────────────────────────────────
// Resident pre-approves an upcoming guest, delivery, or cab
exports.preApproveVisitor = async (req, res, next) => {
  try {
    const {
      visitorName,
      visitorPhone,
      visitorType,
      companyName,
      vehicleNumber,
      numberOfMembers,
      validUntil,
      notes,
    } = req.body;

    if (!visitorName || !visitorName.trim()) {
      return res.status(400).json({ success: false, message: 'Visitor name is required.' });
    }

    const resident = await Resident.findById(req.user._id).populate('societyId', 'name');
    if (!resident) {
      return res.status(404).json({ success: false, message: 'Resident record not found.' });
    }

    const societyId = resident.societyId?._id || resident.societyId || req.user.societyId;
    if (!societyId) {
      return res.status(400).json({ success: false, message: 'Resident is not associated with any society.' });
    }

    const flatNo = resident.houseOrFlatNo || req.body.flatNo || 'Resident';

    // Generate unique 6-digit passcode and QR token
    let passcode = generateNumericPasscode();
    // Ensure uniqueness for this society among pre-approved passes
    let existing = await Visitor.findOne({ societyId, passcode, status: 'PreApproved' });
    while (existing) {
      passcode = generateNumericPasscode();
      existing = await Visitor.findOne({ societyId, passcode, status: 'PreApproved' });
    }

    const tokenEntropy = crypto.randomBytes(4).toString('hex').toUpperCase();
    const qrToken = `PASS-${Date.now().toString(36).toUpperCase()}-${tokenEntropy}`;

    // Validity period: default 24 hours from now if not specified
    let expiryDate = validUntil ? new Date(validUntil) : null;
    if (!expiryDate || isNaN(expiryDate.getTime())) {
      expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + 24);
    }

    // Payload encoded inside the QR Code
    const qrPayload = JSON.stringify({
      app:     'FALO_VMS',
      passId:  qrToken,
      code:    passcode,
      flat:    flatNo,
      name:    visitorName.trim(),
      members: Math.max(Number(numberOfMembers) || 1, 1),
    });

    // Generate high-resolution base64 PNG data URL
    const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      margin: 2,
      scale: 8,
      color: {
        dark:  '#0A192F',
        light: '#FFFFFF',
      },
    });

    const visitor = await Visitor.create({
      societyId,
      residentId: resident._id,
      flatNo,
      visitorName: visitorName.trim(),
      visitorPhone: visitorPhone ? visitorPhone.trim() : '',
      visitorType: visitorType || 'Guest',
      companyName: companyName ? companyName.trim() : '',
      vehicleNumber: vehicleNumber ? vehicleNumber.trim().toUpperCase() : '',
      numberOfMembers: Math.max(Number(numberOfMembers) || 1, 1),
      passcode,
      qrToken,
      qrCodeDataUrl,
      status: 'PreApproved',
      validFrom: new Date(),
      validUntil: expiryDate,
      notes: notes ? notes.trim() : '',
    });

    await visitor.populate([
      { path: 'residentId', select: 'name phone houseOrFlatNo' },
      { path: 'societyId',  select: 'name city address' },
    ]);

    res.status(201).json({
      success: true,
      message: 'Gate pass generated successfully.',
      data: visitor,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/visitors/verify ───────────────────────────────────────────────
// Guard / Admin verifies a pass by scanning QR (token or payload) or typing 6-digit passcode
exports.verifyPass = async (req, res, next) => {
  try {
    const { code, qrToken, rawScan } = req.body;

    let searchCode = code ? String(code).trim().toUpperCase() : '';
    let searchToken = qrToken ? String(qrToken).trim() : '';

    // If guard scanned the raw JSON string from the QR code
    if (rawScan) {
      try {
        const parsed = JSON.parse(rawScan);
        if (parsed.passId) searchToken = parsed.passId;
        if (parsed.code)   searchCode  = String(parsed.code).trim().toUpperCase();
      } catch (_) {
        // Raw string might be the token directly
        searchToken = String(rawScan).trim();
      }
    }

    if (!searchCode && !searchToken) {
      return res.status(400).json({ success: false, message: 'Please provide a passcode or scan QR code.' });
    }

    const societyId = req.user.societyId?._id || req.user.societyId;

    const query = { societyId };
    if (searchToken) {
      query.$or = [{ qrToken: searchToken }, { passcode: searchCode || searchToken }];
    } else {
      query.passcode = searchCode;
    }

    const visitor = await Visitor.findOne(query)
      .populate('residentId', 'name phone houseOrFlatNo')
      .populate('societyId',  'name city address');

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: 'No gate pass found matching this code or QR in your society.',
      });
    }

    const now = new Date();
    let canCheckIn = false;
    let canCheckOut = false;
    let message = 'Gate pass is valid.';

    if (visitor.status === 'Cancelled') {
      message = 'This pass was cancelled by the resident.';
    } else if (visitor.status === 'Exited') {
      message = `This visitor has already exited at ${new Date(visitor.exitTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}.`;
    } else if (visitor.status === 'Inside') {
      canCheckOut = true;
      message = `Visitor is currently inside since ${new Date(visitor.entryTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}. Ready for checkout.`;
    } else if (now > new Date(visitor.validUntil)) {
      message = 'This gate pass has expired.';
    } else if (visitor.status === 'PreApproved') {
      canCheckIn = true;
      message = 'Pre-approved pass verified. Ready for gate entry.';
    }

    res.json({
      success: true,
      canCheckIn,
      canCheckOut,
      message,
      data: visitor,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/visitors/checkin ──────────────────────────────────────────────
// Guard marks visitor as checked-in / entered
exports.checkInVisitor = async (req, res, next) => {
  try {
    const { visitorId, vehicleNumber, numberOfMembers } = req.body;

    if (!visitorId) {
      return res.status(400).json({ success: false, message: 'Visitor ID is required.' });
    }

    const visitor = await Visitor.findById(visitorId)
      .populate('residentId', 'name phone houseOrFlatNo')
      .populate('societyId',  'name');

    if (!visitor) {
      return res.status(404).json({ success: false, message: 'Visitor pass not found.' });
    }

    if (visitor.status === 'Inside') {
      return res.status(400).json({ success: false, message: 'Visitor is already marked inside.' });
    }

    visitor.status = 'Inside';
    visitor.entryTime = new Date();
    visitor.verifiedByGuardId = req.user._id;

    if (vehicleNumber !== undefined) {
      visitor.vehicleNumber = String(vehicleNumber).trim().toUpperCase();
    }
    if (numberOfMembers && Number(numberOfMembers) > 0) {
      visitor.numberOfMembers = Number(numberOfMembers);
    }

    await visitor.save();

    res.json({
      success: true,
      message: `Entry logged for ${visitor.visitorName} (${visitor.numberOfMembers} member${visitor.numberOfMembers > 1 ? 's' : ''}). Gate opened.`,
      data: visitor,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/visitors/:id/checkout ─────────────────────────────────────────
// Guard marks visitor as checked-out / exited
exports.checkOutVisitor = async (req, res, next) => {
  try {
    const visitor = await Visitor.findById(req.params.id)
      .populate('residentId', 'name phone houseOrFlatNo')
      .populate('societyId',  'name');

    if (!visitor) {
      return res.status(404).json({ success: false, message: 'Visitor record not found.' });
    }

    visitor.status = 'Exited';
    visitor.exitTime = new Date();
    await visitor.save();

    res.json({
      success: true,
      message: `Visitor ${visitor.visitorName} checked out successfully.`,
      data: visitor,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/visitors/society-register ──────────────────────────────────────
// Guard / Admin view of society visitor register (Active / History)
exports.getSocietyVisitors = async (req, res, next) => {
  try {
    const societyId = req.user.societyId?._id || req.user.societyId;
    const { status, search, date } = req.query;

    const query = { societyId };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      const rx = new RegExp(q, 'i');
      query.$or = [
        { visitorName:   rx },
        { visitorPhone:  rx },
        { flatNo:        rx },
        { vehicleNumber: rx },
        { passcode:      q.toUpperCase() },
      ];
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: startOfDay, $lte: endOfDay };
    }

    const visitors = await Visitor.find(query)
      .populate('residentId', 'name phone houseOrFlatNo')
      .populate('verifiedByGuardId', 'name')
      .sort({ updatedAt: -1, createdAt: -1 });

    const insideCount = await Visitor.countDocuments({ societyId, status: 'Inside' });
    const preApprovedCount = await Visitor.countDocuments({ societyId, status: 'PreApproved' });

    res.json({
      success: true,
      count: visitors.length,
      insideCount,
      preApprovedCount,
      data: visitors,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/visitors/my-visitors ───────────────────────────────────────────
// Resident view of their flat's visitors (pre-approved passes & recent visits)
exports.getMyVisitors = async (req, res, next) => {
  try {
    const query = { residentId: req.user._id };

    const visitors = await Visitor.find(query)
      .populate('societyId', 'name')
      .populate('verifiedByGuardId', 'name')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: visitors.length,
      data: visitors,
    });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/visitors/:id/cancel ──────────────────────────────────────────
// Resident cancels an unused pre-approved pass
exports.cancelPreApproval = async (req, res, next) => {
  try {
    const visitor = await Visitor.findOne({ _id: req.params.id, residentId: req.user._id });

    if (!visitor) {
      return res.status(404).json({ success: false, message: 'Gate pass not found.' });
    }

    if (visitor.status !== 'PreApproved') {
      return res.status(400).json({ success: false, message: `Cannot cancel a pass with status: ${visitor.status}.` });
    }

    visitor.status = 'Cancelled';
    await visitor.save();

    res.json({
      success: true,
      message: 'Gate pass cancelled successfully.',
      data: visitor,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/visitors/pass/:id (Public Web Pass for WhatsApp / SMS) ─────────
exports.getPublicGatePass = async (req, res, next) => {
  try {
    const mongoose = require('mongoose');
    const isId = mongoose.Types.ObjectId.isValid(req.params.id);

    const query = isId
      ? { $or: [{ _id: req.params.id }, { qrToken: req.params.id }] }
      : { qrToken: req.params.id };

    const visitor = await Visitor.findOne(query)
      .populate('residentId', 'name phone houseOrFlatNo')
      .populate('societyId', 'name address city');

    if (!visitor) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invalid Gate Pass</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0F172A; color: #FFF; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
            .card { background: #1E293B; border-radius: 20px; padding: 32px; text-align: center; max-width: 380px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
            h2 { color: #EF4444; margin: 0 0 10px; }
            p { color: #94A3B8; font-size: 14px; margin: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>⚠️ Invalid Pass</h2>
            <p>This gate pass does not exist or has expired. Please contact your host resident.</p>
          </div>
        </body>
        </html>
      `);
    }

    const societyName = (visitor.societyId?.name || 'Society Gate Pass').toUpperCase();
    const flatNo = visitor.flatNo || visitor.residentId?.houseOrFlatNo || 'Resident';
    const hostName = visitor.residentId?.name || 'Resident Host';
    const validUntilStr = new Date(visitor.validUntil).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
    });

    const isExpired = new Date() > new Date(visitor.validUntil);
    const isInside = visitor.status === 'Inside';
    const isUsed = visitor.status === 'Completed';
    const isCancelled = visitor.status === 'Cancelled';

    let statusBadgeColor = '#10B981';
    let statusLabel = 'VALID GATE PASS';
    if (isExpired) {
      statusBadgeColor = '#EF4444';
      statusLabel = 'PASS EXPIRED';
    } else if (isInside) {
      statusBadgeColor = '#3B82F6';
      statusLabel = 'CURRENTLY INSIDE';
    } else if (isUsed) {
      statusBadgeColor = '#6B7280';
      statusLabel = 'PASS COMPLETED';
    } else if (isCancelled) {
      statusBadgeColor = '#EF4444';
      statusLabel = 'PASS CANCELLED';
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Gate Pass - ${visitor.visitorName}</title>
        <style>
          * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #0B0F19;
            color: #0F172A;
            margin: 0;
            padding: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .pass-card {
            background: #FFFFFF;
            border-radius: 24px;
            max-width: 390px;
            width: 100%;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
            border: 2px solid #E2E8F0;
          }
          .header {
            background: linear-gradient(135deg, #4F46E5, #3730A3);
            color: #FFFFFF;
            padding: 24px 20px;
            text-align: center;
          }
          .society-name {
            font-size: 15px;
            font-weight: 800;
            letter-spacing: 0.5px;
            margin: 0 0 4px;
          }
          .pass-sub {
            font-size: 11px;
            color: #C7D2FE;
            font-weight: 600;
            letter-spacing: 1px;
            text-transform: uppercase;
            margin: 0;
          }
          .status-badge {
            display: inline-block;
            background: ${statusBadgeColor};
            color: #FFFFFF;
            font-size: 11px;
            font-weight: 800;
            padding: 4px 12px;
            border-radius: 9999px;
            margin-top: 10px;
            letter-spacing: 0.5px;
          }
          .qr-wrapper {
            padding: 24px 20px 16px;
            text-align: center;
            background: #F8FAFC;
            border-bottom: 2px dashed #CBD5E1;
            position: relative;
          }
          .qr-img {
            width: 220px;
            height: 220px;
            background: #FFFFFF;
            padding: 10px;
            border-radius: 16px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            border: 1px solid #E2E8F0;
          }
          .passcode-box {
            margin-top: 14px;
            background: #FFFFFF;
            border: 2px solid #4F46E5;
            border-radius: 12px;
            padding: 8px 16px;
            display: inline-block;
          }
          .passcode-label {
            font-size: 10px;
            font-weight: 700;
            color: #64748B;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .passcode-val {
            font-size: 24px;
            font-weight: 900;
            color: #4F46E5;
            letter-spacing: 4px;
            margin: 2px 0 0;
          }
          .details-box {
            padding: 20px;
          }
          .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #F1F5F9;
            font-size: 13px;
          }
          .detail-row:last-child {
            border-bottom: none;
          }
          .detail-key {
            color: #64748B;
            font-weight: 600;
          }
          .detail-val {
            color: #0F172A;
            font-weight: 700;
            text-align: right;
          }
          .footer-note {
            background: #F1F5F9;
            padding: 12px 16px;
            text-align: center;
            font-size: 11.5px;
            color: #475569;
            border-top: 1px solid #E2E8F0;
            line-height: 1.4;
          }
        </style>
      </head>
      <body>
        <div class="pass-card">
          <div class="header">
            <h1 class="society-name">${societyName}</h1>
            <p class="pass-sub">Pre-Approved Visitor Entry Pass</p>
            <div class="status-badge">${statusLabel}</div>
          </div>

          <div class="qr-wrapper">
            <img class="qr-img" src="${visitor.qrCodeDataUrl}" alt="Gate Pass QR" />
            <div class="passcode-box">
              <div class="passcode-label">Gate Passcode / OTP</div>
              <div class="passcode-val">${visitor.passcode}</div>
            </div>
          </div>

          <div class="details-box">
            <div class="detail-row">
              <span class="detail-key">Visitor Name</span>
              <span class="detail-val">${visitor.visitorName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-key">Visiting Flat</span>
              <span class="detail-val">Flat ${flatNo}</span>
            </div>
            <div class="detail-row">
              <span class="detail-key">Host Resident</span>
              <span class="detail-val">${hostName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-key">Category</span>
              <span class="detail-val">${visitor.visitorType || 'Guest'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-key">Persons Allowed</span>
              <span class="detail-val">${visitor.numberOfMembers || 1} Person(s)</span>
            </div>
            ${visitor.vehicleNumber ? `
            <div class="detail-row">
              <span class="detail-key">Vehicle Number</span>
              <span class="detail-val">${visitor.vehicleNumber}</span>
            </div>` : ''}
            <div class="detail-row">
              <span class="detail-key">Valid Until</span>
              <span class="detail-val">${validUntilStr}</span>
            </div>
          </div>

          <div class="footer-note">
            🛡️ Please show this QR code or 6-digit passcode to the security guard at the gate for fast entry.
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    next(err);
  }
};
