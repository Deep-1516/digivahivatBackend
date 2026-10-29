/**
 * controllers/contribution.controller.js
 *
 * Handles recording, listing, and PDF receipt generation for Falo payments.
 */
const PDFDocument  = require('pdfkit');
const Contribution = require('../models/Contribution.model');
const Event        = require('../models/Event.model');
const Resident     = require('../models/Resident.model');
const Society      = require('../models/Society.model');
const { sendPushNotification } = require('../config/firebase');

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

    // ── For Event type: validate event exists & resident not excluded ─────
    let event = null;
    if (contributionType === 'Event') {
      if (!eventId) {
        return res.status(400).json({ success: false, message: 'eventId is required for Event contributions.' });
      }
      event = await Event.findById(eventId);
      if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

      const isExcluded = event.excludedResidents?.some(
        (id) => (id._id ? id._id.toString() : id.toString()) === residentId.toString()
      );
      if (isExcluded) {
        return res.status(400).json({
          success: false,
          message: `${resident.name} is excluded from "${event.title}" and cannot make payments for this event.`,
        });
      }
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

    const targetSocietyId = req.user.societyId?._id || req.user.societyId || resident.societyId;

    const contribution = await Contribution.create({
      contributionType,
      societyId:      targetSocietyId,
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

    // Asynchronous Push Notification to the Resident
    (async () => {
      try {
        const payer = await Resident.findById(residentId).select('fcmTokens name houseOrFlatNo');
        if (payer && payer.fcmTokens?.length) {
          const isAnnual = contributionType === 'Annual';
          const pushTitle = isAnnual
            ? `✅ Maintenance Paid — Flat ${payer.houseOrFlatNo || ''}`
            : `🎉 Payment Confirmed — ${contribution.eventId?.title || 'Society Event'}`;
          const pushBody = isAnnual
            ? `Maintenance payment of ₹${amount} for year ${annualYear} has been recorded. Tap to view your PDF receipt.`
            : `Your contribution of ₹${amount} for ${contribution.eventId?.title || 'the event'} has been recorded. Tap to view receipt.`;

          await sendPushNotification({
            tokens: payer.fcmTokens,
            title: pushTitle,
            body: pushBody,
            data: {
              type: isAnnual ? 'MAINTENANCE_PAID' : 'CONTRIBUTION_RECORDED',
              contributionId: contribution._id.toString(),
              annualYear: String(annualYear || ''),
            },
            channelId: 'society_general',
          });
        }
      } catch (pushErr) {
        console.warn('⚠️ [Payment Push Notification Error]:', pushErr.message);
      }
    })();

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

    // Privacy Guard: Regular residents can only view their own contributions.
    // They are never allowed to inspect other society members' payments or pending dues.
    if (req.user && req.user.role === 'Resident') {
      filter.residentId = req.user._id;
    }

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

// ─── Indian Currency Number-to-Words Helper ─────────────────────────────────
function numberToWordsINR(num) {
  const n = Math.floor(Number(num) || 0);
  if (n === 0) return 'Zero Rupees Only';

  const singleDigits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const twoDigits = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertLessThanOneThousand(val) {
    let str = '';
    if (val >= 100) {
      str += singleDigits[Math.floor(val / 100)] + ' Hundred ';
      val %= 100;
    }
    if (val >= 10 && val <= 19) {
      str += twoDigits[val - 10] + ' ';
    } else if (val >= 20) {
      str += tens[Math.floor(val / 10)] + ' ';
      val %= 10;
      if (val > 0) str += singleDigits[val] + ' ';
    } else if (val > 0) {
      str += singleDigits[val] + ' ';
    }
    return str.trim();
  }

  let words = '';
  const crore = Math.floor(n / 10000000);
  let rem = n % 10000000;
  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  const thousand = Math.floor(rem / 1000);
  rem = rem % 1000;
  const hundredAndBelow = rem;

  if (crore > 0) words += convertLessThanOneThousand(crore) + ' Crore ';
  if (lakh > 0) words += convertLessThanOneThousand(lakh) + ' Lakh ';
  if (thousand > 0) words += convertLessThanOneThousand(thousand) + ' Thousand ';
  if (hundredAndBelow > 0) words += convertLessThanOneThousand(hundredAndBelow) + ' ';

  return words.trim() + ' Rupees Only';
}

// ─── GET /api/contributions/:id/pdf-receipt ───────────────────────────────────
/**
 * Generates and streams an executive-grade, official A5 payment receipt voucher.
 * Includes society branding, voucher numbering, amount in figures & words,
 * structured details grid, authenticated digital verification seal, and signature block.
 */
const generatePdfReceipt = async (req, res, next) => {
  try {
    const contribution = await Contribution.findById(req.params.id)
      .populate('residentId', 'name phone houseOrFlatNo societyId')
      .populate('eventId',    'title societyId')
      .populate('recordedBy', 'name role')
      .populate('societyId',  'name address city');

    if (!contribution) {
      return res.status(404).json({ success: false, message: 'Contribution record not found.' });
    }

    // Resolve society: from contribution -> resident -> event -> requesting user
    let society = contribution.societyId;
    if (!society && contribution.residentId?.societyId) {
      society = await Society.findById(contribution.residentId.societyId);
    }
    if (!society && contribution.eventId?.societyId) {
      society = await Society.findById(contribution.eventId.societyId);
    }
    if (!society && req.user?.societyId) {
      society = await Society.findById(req.user.societyId?._id || req.user.societyId);
    }

    const societyName = (society?.name || 'SKY SOCIETY RESIDENTIAL COMMUNITY').toUpperCase();
    const addressParts = [society?.address, society?.city].filter(Boolean);
    const societyAddress = addressParts.length > 0 ? addressParts.join(', ') : 'Registered Society Office';

    const receiptShort = contribution._id.toString().slice(-8).toUpperCase();
    const receiptNo = `REC-${new Date(contribution.date).getFullYear()}-${receiptShort}`;

    const dateObj = new Date(contribution.date);
    const dateFormatted =
      dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ', ' +
      dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    const isAnnual = contribution.contributionType === 'Annual';
    const eventName = isAnnual
      ? `Annual Society Maintenance Fund (${contribution.annualYear || ''})`
      : (contribution.eventId?.title || 'Society Event Collection');
    const category = isAnnual ? 'Annual Society Fund' : 'Society Event Collection';
    const categoryShort = isAnnual ? 'Annual Fund' : 'Event Fund';

    const residentName = contribution.residentId?.name || 'Resident';
    const flatNo = contribution.residentId?.houseOrFlatNo ? `Flat ${contribution.residentId.houseOrFlatNo}` : 'N/A';
    const phone = contribution.residentId?.phone || 'N/A';
    const recordedBy = contribution.recordedBy?.name || 'Society Admin';
    const paymentMode = contribution.paymentMode || 'Cash';
    const paymentStatus = contribution.paymentStatus || 'Paid';
    const transactionId = contribution.transactionId || null;
    const notes = contribution.notes ? String(contribution.notes).trim() : '';

    // ── Page setup ───────────────────────────────────────────────────────────
    const doc = new PDFDocument({
      size: 'A5',
      margin: 0,
      info: {
        Title: `Payment Receipt - ${receiptNo}`,
        Author: 'Sky Society App',
        Subject: `Payment Receipt for ${residentName}`,
      },
    });

    const isInline = req.query.view === '1' || req.query.view === 'true' || req.query.inline === '1' || req.query.inline === 'true';
    const disposition = isInline ? 'inline' : 'attachment';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="SkySociety_Receipt_${receiptShort}.pdf"`);
    doc.pipe(res);

    // ── Coordinates & Sizing ─────────────────────────────────────────────────
    const W  = doc.page.width;   // 419.53 pt
    const H  = doc.page.height;  // 595.28 pt
    const M  = 22;               // margin
    const CW = W - M * 2;       // 375.53 pt

    const C = {
      navyDark:    '#0A192F',
      navyMid:     '#1E293B',
      saffron:     '#E85C0D',
      saffronL:    '#FFF8F5',
      saffronB:    '#FDBA74',
      textMain:    '#0F172A',
      textMuted:   '#64748B',
      bgLight:     '#F8FAFC',
      borderLight: '#E2E8F0',
      borderDark:  '#94A3B8',
      white:       '#FFFFFF',
      green:       '#16A34A',
      greenBg:     '#DCFCE7',
      greenBorder: '#86EFAC',
      blue:        '#2563EB',
      blueBg:      '#EFF6FF',
      blueBorder:  '#BFDBFE',
      amber:       '#D97706',
      amberBg:     '#FEF3C7',
      amberBorder: '#FDE68A',
      red:         '#DC2626',
      redBg:       '#FEE2E2',
      redBorder:   '#FCA5A5',
    };

    const statusConfigs = {
      Paid:    { label: 'PAID & SETTLED', color: C.green, bg: C.greenBg, border: C.greenBorder },
      Partial: { label: 'PARTIAL PAYMENT', color: C.amber, bg: C.amberBg, border: C.amberBorder },
      Pending: { label: 'PAYMENT PENDING', color: C.red,   bg: C.redBg,   border: C.redBorder },
    };
    const sc = statusConfigs[paymentStatus] || statusConfigs.Paid;

    const modeConfigs = {
      UPI:  { label: 'UPI ONLINE', color: C.blue,  bg: C.blueBg,  border: C.blueBorder },
      Cash: { label: 'CASH PAYMENT', color: C.green, bg: '#ECFDF5', border: '#A7F3D0' },
    };
    const mc = modeConfigs[paymentMode] || modeConfigs.Cash;

    // 1. OUTER DECORATIVE BORDER (Certificate / Voucher style)
    doc.roundedRect(7, 7, W - 14, H - 14, 8).lineWidth(1.5).strokeColor(C.navyDark).stroke();
    doc.roundedRect(10, 10, W - 20, H - 20, 6).lineWidth(0.6).strokeColor(C.saffron).stroke();

    // 2. HEADER CONTAINER
    doc.rect(11, 11, W - 22, 78).fill(C.navyDark);

    // App & Tagline
    doc.fillColor('#FDBA74').font('Helvetica-Bold').fontSize(8)
       .text('SKY SOCIETY MANAGEMENT PLATFORM', M, 20, { width: CW, align: 'center', characterSpacing: 1 });

    // Society Name
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(11.5)
       .text(societyName, M, 32, { width: CW, align: 'center', height: 16, ellipsis: true });

    // Society Address
    doc.fillColor('#94A3B8').font('Helvetica').fontSize(7.5)
       .text(societyAddress, M, 48, { width: CW, align: 'center', height: 14, ellipsis: true });

    // Sub-header Banner bar
    doc.rect(11, 74, W - 22, 22).fill(C.saffron);
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(8.5)
       .text('OFFICIAL PAYMENT RECEIPT / VOUCHER', M + 6, 81, { width: CW * 0.65, align: 'left' });
    doc.fillColor('#FFF7ED').font('Helvetica-Bold').fontSize(7.5)
       .text('ORIGINAL ACKNOWLEDGEMENT', M + CW * 0.65, 82, { width: CW * 0.35 - 6, align: 'right' });

    // 3. VOUCHER SUMMARY STRIP
    const stripY = 104;
    const stripH = 28;
    doc.rect(M, stripY, CW, stripH).fill(C.bgLight).strokeColor(C.borderLight).lineWidth(0.5).stroke();

    doc.fillColor(C.textMuted).font('Helvetica-Bold').fontSize(6.5).text('RECEIPT NO:', M + 10, stripY + 5);
    doc.fillColor(C.navyDark).font('Helvetica-Bold').fontSize(9).text(receiptNo, M + 10, stripY + 14);

    doc.fillColor(C.textMuted).font('Helvetica-Bold').fontSize(6.5).text('DATE & TIME:', M + 140, stripY + 5);
    doc.fillColor(C.navyDark).font('Helvetica-Bold').fontSize(8.5).text(dateFormatted, M + 140, stripY + 14);

    doc.fillColor(C.textMuted).font('Helvetica-Bold').fontSize(6.5).text('COLLECTION HEAD:', M + 265, stripY + 5);
    doc.fillColor(C.navyDark).font('Helvetica-Bold').fontSize(8.5).text(categoryShort, M + 265, stripY + 14, { width: CW - 275, ellipsis: true });

    // 4. AMOUNT HIGHLIGHT BOX
    const amtY = 140;
    const amtH = 70;
    doc.roundedRect(M, amtY, CW, amtH, 6).fill(C.saffronL).strokeColor(C.saffronB).lineWidth(1).stroke();
    doc.roundedRect(M, amtY, 6, amtH, 3).fill(C.saffron);

    doc.fillColor(C.saffron).font('Helvetica-Bold').fontSize(8)
       .text('TOTAL AMOUNT RECEIVED', M + 16, amtY + 10, { characterSpacing: 0.5 });
    doc.fillColor(C.navyDark).font('Helvetica-Bold').fontSize(24)
       .text(`Rs. ${Number(contribution.amount).toLocaleString('en-IN')}/-`, M + 16, amtY + 22);

    const words = numberToWordsINR(contribution.amount);
    doc.fillColor(C.textMuted).font('Helvetica-Oblique').fontSize(8.5)
       .text(`Amount in words: ${words}`, M + 16, amtY + 51, { width: CW - 135, height: 14, ellipsis: true });

    // Status & Mode Badges
    const badgeRight = W - M - 98;
    doc.roundedRect(badgeRight, amtY + 10, 92, 21, 4).fill(sc.bg).strokeColor(sc.border).lineWidth(0.8).stroke();
    doc.fillColor(sc.color).font('Helvetica-Bold').fontSize(8)
       .text(sc.label, badgeRight, amtY + 16, { width: 92, align: 'center' });

    doc.roundedRect(badgeRight, amtY + 36, 92, 21, 4).fill(mc.bg).strokeColor(mc.border).lineWidth(0.8).stroke();
    doc.fillColor(mc.color).font('Helvetica-Bold').fontSize(8.5)
       .text(mc.label, badgeRight, amtY + 42, { width: 92, align: 'center' });

    // 5. STRUCTURED DETAILS TABLE
    const tableY = 232;
    const rowH = 27;
    const colW = CW / 2;

    const rows = [
      [
        { label: 'RECEIVED FROM (MEMBER)', value: residentName },
        { label: 'FLAT / HOUSE NO', value: flatNo },
      ],
      [
        { label: 'CONTACT NUMBER', value: phone },
        { label: 'CONTRIBUTION FOR', value: eventName },
      ],
      [
        { label: 'PAYMENT METHOD', value: paymentMode },
        { label: paymentMode === 'UPI' ? 'UPI TXN / UTR ID' : 'PAYMENT CHANNEL', value: transactionId || 'Cash Handover' },
      ],
      [
        { label: 'RECORDED / RECEIVED BY', value: recordedBy },
        { label: 'CATEGORY', value: category },
      ],
    ];

    if (notes) {
      rows.push([
        { label: 'REMARKS / PURPOSE', value: notes, fullSpan: true },
        null,
      ]);
    }

    doc.fillColor(C.textMuted).font('Helvetica-Bold').fontSize(8)
       .text('PAYMENT PARTICULARS & RECEIVER DETAILS', M, tableY - 12, { characterSpacing: 0.5 });

    let curY = tableY;
    rows.forEach((r, idx) => {
      const isEven = idx % 2 === 0;
      const isFullSpan = r[0].fullSpan;
      const rHeight = isFullSpan ? 32 : rowH;

      doc.rect(M, curY, CW, rHeight).fill(isEven ? C.bgLight : C.white);

      if (isFullSpan) {
        doc.fillColor(C.textMuted).font('Helvetica').fontSize(6.5).text(r[0].label, M + 8, curY + 4);
        doc.fillColor(C.navyDark).font('Helvetica-Bold').fontSize(8.5).text(r[0].value, M + 8, curY + 14, { width: CW - 16, height: 16, ellipsis: true });
      } else {
        doc.fillColor(C.textMuted).font('Helvetica').fontSize(6.5).text(r[0].label, M + 8, curY + 4);
        doc.fillColor(C.navyDark).font('Helvetica-Bold').fontSize(8.5).text(r[0].value, M + 8, curY + 14, { width: colW - 16, ellipsis: true });

        if (r[1]) {
          doc.fillColor(C.textMuted).font('Helvetica').fontSize(6.5).text(r[1].label, M + colW + 8, curY + 4);
          doc.fillColor(C.navyDark).font('Helvetica-Bold').fontSize(8.5).text(r[1].value, M + colW + 8, curY + 14, { width: colW - 16, ellipsis: true });
        }
      }

      curY += rHeight;
    });

    const totalTableH = curY - tableY;
    doc.rect(M, tableY, CW, totalTableH).strokeColor(C.borderLight).lineWidth(0.5).stroke();
    doc.moveTo(M + colW, tableY).lineTo(M + colW, tableY + (rows.length - (notes ? 1 : 0)) * rowH).strokeColor(C.borderLight).lineWidth(0.5).stroke();

    // 6. VERIFICATION STAMP & AUTHORIZATION SIGNATURE
    const authY = curY + 14;

    const stampW = CW * 0.55;
    const stampH = 74;
    doc.roundedRect(M, authY, stampW, stampH, 5).fill('#F0FDF4').strokeColor('#86EFAC').lineWidth(1).stroke();

    doc.fillColor(C.green).font('Helvetica-Bold').fontSize(8.5).text('AUTHENTICATED DIGITAL VOUCHER', M + 10, authY + 8);
    doc.fillColor(C.textMuted).font('Helvetica').fontSize(7.5).text('Status: Payment Verified & Credited to Society Account', M + 10, authY + 21, { width: stampW - 20 });
    doc.fillColor(C.textMuted).font('Helvetica').fontSize(7.5).text(`Verification Ref: SKY-${receiptShort.slice(-6)}-LEDGER-OK`, M + 10, authY + 34);
    doc.fillColor(C.textMuted).font('Helvetica-Oblique').fontSize(7).text('System generated e-receipt. Valid without physical signature.', M + 10, authY + 50, { width: stampW - 20 });

    const sigX = M + stampW + 12;
    const sigW = CW - stampW - 12;
    doc.roundedRect(sigX, authY, sigW, stampH, 5).fill(C.white).strokeColor(C.borderDark).lineWidth(0.7).stroke();

    doc.fillColor(C.textMuted).font('Helvetica-Bold').fontSize(7).text('FOR SOCIETY ADMINISTRATION', sigX + 6, authY + 8, { width: sigW - 12, align: 'center' });
    doc.moveTo(sigX + 16, authY + 52).lineTo(sigX + sigW - 16, authY + 52).strokeColor(C.borderDark).lineWidth(0.5).stroke();
    doc.fillColor(C.navyDark).font('Helvetica-Bold').fontSize(8).text(recordedBy.split('(')[0].trim(), sigX + 6, authY + 55, { width: sigW - 12, align: 'center' });
    doc.fillColor(C.textMuted).font('Helvetica').fontSize(6.5).text('Authorized Representative / Signatory', sigX + 6, authY + 64, { width: sigW - 12, align: 'center' });

    // 7. FOOTER TERMS & CONDITIONS
    const footY = authY + stampH + 14;
    doc.moveTo(M, footY).lineTo(W - M, footY).strokeColor(C.borderLight).lineWidth(0.5).stroke();

    doc.fillColor(C.textMuted).font('Helvetica').fontSize(7).text(
      'Notes: 1. This electronic receipt serves as official proof of payment. 2. Please preserve this receipt for your records and society audits. 3. In case of discrepancies, notify the society committee within 7 days.',
      M, footY + 6, { width: CW, align: 'left', lineGap: 1.5 }
    );

    doc.fillColor('#94A3B8').font('Helvetica').fontSize(7).text(
      `Sky Society Management Ledger  |  Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}  |  Page 1 of 1`,
      M, footY + 28, { width: CW, align: 'center' }
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
