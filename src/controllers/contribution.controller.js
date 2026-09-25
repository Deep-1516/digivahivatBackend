/**
 * controllers/contribution.controller.js
 *
 * Handles recording, listing, and PDF receipt generation for Falo payments.
 */
const PDFDocument  = require('pdfkit');
const Contribution = require('../models/Contribution.model');
const Event        = require('../models/Event.model');
const Resident     = require('../models/Resident.model');

// ─── POST /api/contributions (Admin only) ────────────────────────────────────
const recordContribution = async (req, res, next) => {
  try {
    const {
      contributionType = 'Event',
      eventId,
      annualYear,
      residentId,
      amount,
      paymentMode,
      paymentStatus,
      transactionId,
      notes,
      date,
    } = req.body;

    // ── Validate resident always ──────────────────────────────────────────
    const resident = await Resident.findById(residentId);
    if (!resident) return res.status(404).json({ success: false, message: 'Resident not found.' });

    // ── For Event type: validate event exists ─────────────────────────────
    let event = null;
    if (contributionType === 'Event') {
      if (!eventId) {
        return res.status(400).json({ success: false, message: 'eventId is required for Event contributions.' });
      }
      event = await Event.findById(eventId);
      if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    // ── For Annual type: validate year ────────────────────────────────────
    if (contributionType === 'Annual') {
      const yr = Number(annualYear);
      if (!annualYear || isNaN(yr) || yr < 2000 || yr > 2100) {
        return res.status(400).json({ success: false, message: 'A valid annualYear (e.g. 2026) is required for Annual contributions.' });
      }
    }

    // ── Duplicate payment guard ───────────────────────────────────────────
    // Only block if the NEW payment status is 'Paid' AND an existing 'Paid'
    // record already exists for this resident + event/year.
    // Partial/Pending records are allowed to co-exist (instalment pattern).
    const incomingStatus = paymentStatus || 'Paid';
    if (incomingStatus === 'Paid') {
      const dupFilter = { residentId, paymentStatus: 'Paid' };
      if (contributionType === 'Event')  dupFilter.eventId    = eventId;
      if (contributionType === 'Annual') dupFilter.annualYear = Number(annualYear);

      const existing = await Contribution.findOne(dupFilter)
        .populate('eventId', 'title');

      if (existing) {
        const where = contributionType === 'Annual'
          ? `Annual Fund ${existing.annualYear}`
          : (existing.eventId?.title ?? 'this event');
        return res.status(409).json({
          success: false,
          message: `${resident.name} has already made a full payment of ₹${existing.amount} for ${where} on ${new Date(existing.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}. Mark as "Partial" or "Pending" if you need to record an additional instalment.`,
          data: { existingContributionId: existing._id },
        });
      }
    }

    const contribution = await Contribution.create({
      contributionType,
      eventId:        contributionType === 'Event'  ? eventId    : null,
      annualYear:     contributionType === 'Annual' ? Number(annualYear) : null,
      residentId,
      amount,
      paymentMode:    paymentMode    || 'Cash',
      paymentStatus:  paymentStatus  || 'Paid',
      transactionId:  transactionId  || null,
      notes:          notes          || '',
      recordedBy:     req.user._id,
      date:           date           || Date.now(),
    });

    // Populate for the response
    await contribution.populate([
      { path: 'residentId', select: 'name phone houseOrFlatNo' },
      { path: 'eventId',    select: 'title' },
    ]);

    res.status(201).json({ success: true, message: 'Contribution recorded.', data: contribution });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/contributions ───────────────────────────────────────────────────
// Query params: eventId, residentId, contributionType, annualYear
const getContributions = async (req, res, next) => {
  try {
    const { eventId, residentId, contributionType, annualYear } = req.query;

    const filter = {};
    if (eventId)           filter.eventId          = eventId;
    if (residentId)        filter.residentId        = residentId;
    if (contributionType)  filter.contributionType  = contributionType;
    if (annualYear)        filter.annualYear        = Number(annualYear);

    const contributions = await Contribution.find(filter)
      .populate('residentId', 'name phone houseOrFlatNo')
      .populate('eventId',    'title')
      .populate('recordedBy', 'name')
      .sort({ date: -1 });

    res.json({ success: true, count: contributions.length, data: contributions });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/contributions/:id/pdf-receipt ───────────────────────────────────
/**
 * Generates and streams a well-designed PDF receipt.
 *
 * Layout (A5 portrait):
 *   ┌─────────────────────────────────────────┐
 *   │  [ORANGE HEADER BAND]  FALO             │
 *   │  Payment Receipt  |  Society Mgmt       │
 *   ├─────────────────────────────────────────┤
 *   │  [AMOUNT HIGHLIGHT BOX]  Rs. 1,000      │
 *   │  Status badge  |  Mode badge            │
 *   ├─────────────────────────────────────────┤
 *   │  TABLE ROWS (alternating grey/white)    │
 *   │  Receipt No  |  Date                    │
 *   │  Event/Fund  |  Type                    │
 *   │  Resident    |  Phone                   │
 *   │  Flat        |  Recorded By             │
 *   │  TxnID (if UPI)                         │
 *   │  Notes (if any)                         │
 *   ├─────────────────────────────────────────┤
 *   │  [FOOTER]  system-generated             │
 *   └─────────────────────────────────────────┘
 *
 * All fonts use Helvetica (built-in) — no emoji, no Unicode currency symbol.
 * "Rs." is used instead of "₹" (not supported in standard PDF fonts).
 */
const generatePdfReceipt = async (req, res, next) => {
  try {
    const contribution = await Contribution.findById(req.params.id)
      .populate('residentId', 'name phone houseOrFlatNo')
      .populate('eventId',    'title')
      .populate('recordedBy', 'name')
      .populate('societyId',  'name city');

    if (!contribution) {
      return res.status(404).json({ success: false, message: 'Contribution record not found.' });
    }

    // ── Page setup ───────────────────────────────────────────────────────────
    const doc = new PDFDocument({ size: 'A5', margin: 0, info: { Title: 'Falo Payment Receipt' } });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Falo_Receipt_${contribution._id.toString().slice(-8).toUpperCase()}.pdf"`);
    doc.pipe(res);

    // ── Constants ────────────────────────────────────────────────────────────
    const W        = doc.page.width;          // A5 = 419.53 pt
    const MARGIN   = 30;
    const CONTENT  = W - MARGIN * 2;
    const ORANGE   = '#E85C0D';
    const ORANGE_L = '#FFF4EE';
    const DARK     = '#1A1A2E';
    const GRAY     = '#6B7280';
    const LGRAY    = '#F3F4F6';
    const WHITE    = '#FFFFFF';
    const GREEN    = '#15803D';
    const GREEN_L  = '#DCFCE7';

    const fmtAmt  = (n) => `Rs. ${Number(n).toLocaleString('en-IN')}`;
    const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    // ── 1. ORANGE HEADER BAND ────────────────────────────────────────────────
    doc.rect(0, 0, W, 80).fill(ORANGE);

    // App name
    doc
      .fillColor(WHITE)
      .font('Helvetica-Bold')
      .fontSize(22)
      .text('FALO', MARGIN, 18, { width: CONTENT, align: 'left' });

    // Subtitle on right
    doc
      .fillColor('#FFDABC')
      .font('Helvetica')
      .fontSize(9)
      .text('Society Event & Contribution Manager', MARGIN, 23, { width: CONTENT, align: 'right' });

    // "Payment Receipt" below
    doc
      .fillColor(WHITE)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('PAYMENT RECEIPT', MARGIN, 48, { width: CONTENT, align: 'left' });

    // Receipt number on right side of header
    const receiptNo = `#${contribution._id.toString().slice(-8).toUpperCase()}`;
    doc
      .fillColor('#FFDABC')
      .font('Helvetica')
      .fontSize(9)
      .text(receiptNo, MARGIN, 52, { width: CONTENT, align: 'right' });

    // ── 2. AMOUNT HIGHLIGHT BOX ──────────────────────────────────────────────
    const boxY = 90;
    doc.rect(MARGIN, boxY, CONTENT, 56).fill(ORANGE_L);
    // left border accent
    doc.rect(MARGIN, boxY, 4, 56).fill(ORANGE);

    doc
      .fillColor(ORANGE)
      .font('Helvetica-Bold')
      .fontSize(26)
      .text(fmtAmt(contribution.amount), MARGIN + 16, boxY + 8, { width: CONTENT - 120, align: 'left' });

    doc
      .fillColor(GRAY)
      .font('Helvetica')
      .fontSize(8)
      .text('Amount Paid', MARGIN + 16, boxY + 40);

    // Status badge (right side of amount box)
    const statusColors = {
      Paid:    { bg: GREEN_L,   text: GREEN   },
      Partial: { bg: '#FEF9C3', text: '#854D0E' },
      Pending: { bg: '#FEE2E2', text: '#991B1B' },
    };
    const sc = statusColors[contribution.paymentStatus] || statusColors.Paid;
    const badgeX = W - MARGIN - 90;
    const badgeY = boxY + 8;
    doc.roundedRect(badgeX, badgeY, 86, 18, 4).fill(sc.bg);
    doc.fillColor(sc.text).font('Helvetica-Bold').fontSize(9)
       .text(contribution.paymentStatus.toUpperCase(), badgeX, badgeY + 4, { width: 86, align: 'center' });

    // Payment mode badge below
    doc.roundedRect(badgeX, badgeY + 24, 86, 18, 4).fill('#EFF6FF');
    doc.fillColor('#1D4ED8').font('Helvetica-Bold').fontSize(9)
       .text(contribution.paymentMode.toUpperCase(), badgeX, badgeY + 28, { width: 86, align: 'center' });

    // ── 3. DETAILS TABLE ─────────────────────────────────────────────────────
    const tableTop    = boxY + 66;
    const COL_W       = CONTENT / 2;
    const ROW_H       = 26;

    // Build rows: [ [label, value], [label, value] ] — pairs per row
    const eventLabel = contribution.contributionType === 'Annual'
      ? 'Annual Fund Year'
      : 'Event';
    const eventValue = contribution.contributionType === 'Annual'
      ? String(contribution.annualYear)
      : (contribution.eventId?.title || '—');
    const typeLabel  = contribution.contributionType === 'Annual' ? 'Annual Fund' : 'Event Collection';

    const tableRows = [
      [
        { label: 'Receipt No',    value: receiptNo },
        { label: 'Date',          value: fmtDate(contribution.date) },
      ],
      [
        { label: eventLabel,      value: eventValue },
        { label: 'Type',          value: typeLabel },
      ],
      [
        { label: 'Resident Name', value: contribution.residentId?.name || '—' },
        { label: 'Phone',         value: contribution.residentId?.phone || '—' },
      ],
      [
        { label: 'Flat / House',  value: contribution.residentId?.houseOrFlatNo || 'N/A' },
        { label: 'Recorded By',   value: contribution.recordedBy?.name || 'Admin' },
      ],
    ];

    // Add UPI transaction row if applicable
    if (contribution.transactionId) {
      tableRows.push([
        { label: 'UPI Transaction ID', value: contribution.transactionId },
        { label: '', value: '' },
      ]);
    }

    // Add notes row if present
    if (contribution.notes) {
      tableRows.push([
        { label: 'Notes', value: contribution.notes },
        { label: '', value: '' },
      ]);
    }

    // Section label
    doc
      .fillColor(GRAY)
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text('PAYMENT DETAILS', MARGIN, tableTop - 14, { characterSpacing: 0.8 });

    // Draw rows
    tableRows.forEach((cols, rowIdx) => {
      const y      = tableTop + rowIdx * ROW_H;
      const isEven = rowIdx % 2 === 0;

      // Row background
      doc.rect(MARGIN, y, CONTENT, ROW_H).fill(isEven ? LGRAY : WHITE);

      cols.forEach((cell, colIdx) => {
        if (!cell.label) return;
        const x = MARGIN + colIdx * COL_W + 8;

        doc
          .fillColor(GRAY)
          .font('Helvetica')
          .fontSize(7)
          .text(cell.label.toUpperCase(), x, y + 4, { width: COL_W - 12 });

        doc
          .fillColor(DARK)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(String(cell.value || '—'), x, y + 13, { width: COL_W - 12, ellipsis: true });
      });
    });

    // Table border
    const tableBottom = tableTop + tableRows.length * ROW_H;
    doc.rect(MARGIN, tableTop, CONTENT, tableRows.length * ROW_H)
       .strokeColor('#E5E7EB').lineWidth(0.5).stroke();

    // Vertical divider
    doc
      .moveTo(MARGIN + COL_W, tableTop)
      .lineTo(MARGIN + COL_W, tableBottom)
      .strokeColor('#E5E7EB').lineWidth(0.5).stroke();

    // ── 4. FOOTER ────────────────────────────────────────────────────────────
    const footerY = tableBottom + 16;

    // Thin top border line for footer
    doc
      .moveTo(MARGIN, footerY)
      .lineTo(W - MARGIN, footerY)
      .strokeColor('#E5E7EB').lineWidth(0.5).stroke();

    doc
      .fillColor(GRAY)
      .font('Helvetica-Oblique')
      .fontSize(7.5)
      .text(
        'This is a system-generated receipt. No signature required.',
        MARGIN, footerY + 8, { width: CONTENT, align: 'center' }
      );

    doc
      .fillColor('#9CA3AF')
      .font('Helvetica')
      .fontSize(7)
      .text(
        `Generated by Falo App  |  ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
        MARGIN, footerY + 20, { width: CONTENT, align: 'center' }
      );

    doc.end();
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/contributions/:id (Admin only) ───────────────────────────────
const deleteContribution = async (req, res, next) => {
  try {
    const contribution = await Contribution.findByIdAndDelete(req.params.id);
    if (!contribution) {
      return res.status(404).json({ success: false, message: 'Contribution not found.' });
    }
    res.json({ success: true, message: 'Contribution deleted.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { recordContribution, getContributions, generatePdfReceipt, deleteContribution };
