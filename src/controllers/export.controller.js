/**
 * controllers/export.controller.js
 *
 * Generates a comprehensive Excel financial audit report for an event.
 * Covers: event summary, all contributions, all expenses, and category totals.
 * Download triggers directly from the mobile app; can be shared via WhatsApp.
 */
const ExcelJS      = require('exceljs');
const Event        = require('../models/Event.model');
const Contribution = require('../models/Contribution.model');
const Expense      = require('../models/Expense.model');

// ─── GET /api/events/:id/export/excel ────────────────────────────────────────
const exportEventExcel = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

    const [contributions, expenses] = await Promise.all([
      Contribution.find({ eventId: event._id })
        .populate('residentId', 'name phone houseOrFlatNo')
        .populate('recordedBy', 'name')
        .sort({ date: 1 }),
      Expense.find({ eventId: event._id })
        .populate('recordedBy', 'name')
        .sort({ date: 1 }),
    ]);

    const totalCollection = contributions.reduce((s, c) => s + c.amount, 0);
    const totalExpenses   = expenses.reduce((s, e) => s + e.amount, 0);

    // ── Create Workbook ─────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator      = 'Falo App';
    wb.created      = new Date();
    wb.lastModified = new Date();

    // ── Styles helper ────────────────────────────────────────────────────────
    const headerFill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    const subHeaderFill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    };
    const bold        = { bold: true };
    const boldWhite   = { bold: true, color: { argb: 'FFFFFFFF' } };
    const currency    = { numFmt: '₹#,##0.00' };
    const border      = {
      top:    { style: 'thin' }, bottom: { style: 'thin' },
      left:   { style: 'thin' }, right:  { style: 'thin' },
    };

    const styleHeaderRow = (ws, rowNum, colCount) => {
      const row = ws.getRow(rowNum);
      for (let c = 1; c <= colCount; c++) {
        const cell = row.getCell(c);
        cell.fill = headerFill;
        cell.font = boldWhite;
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      row.height = 20;
    };

    const applyBorderToRow = (ws, rowNum, colCount) => {
      for (let c = 1; c <= colCount; c++) {
        ws.getRow(rowNum).getCell(c).border = border;
      }
    };

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 1: Summary
    // ════════════════════════════════════════════════════════════════════════
    const summaryWs = wb.addWorksheet('📊 Summary');
    summaryWs.columns = [
      { header: 'Field',  key: 'field', width: 30 },
      { header: 'Value',  key: 'value', width: 30 },
    ];

    const summaryData = [
      ['Event Title',       event.title],
      ['Target Budget',     event.targetBudget],
      ['Start Date',        event.startDate?.toLocaleDateString('en-IN') || '—'],
      ['End Date',          event.endDate?.toLocaleDateString('en-IN')   || 'Ongoing'],
      ['Status',            event.isActive ? 'Active' : 'Closed'],
      ['Total Collection',  totalCollection],
      ['Total Expenses',    totalExpenses],
      ['Net Balance',       totalCollection - totalExpenses],
      ['Total Contributors', contributions.length],
      ['Total Expenses Entries', expenses.length],
    ];

    styleHeaderRow(summaryWs, 1, 2);
    summaryData.forEach(([field, value], i) => {
      const row = summaryWs.addRow({ field, value });
      if (['Total Collection', 'Total Expenses', 'Net Balance', 'Target Budget']
          .includes(field)) {
        row.getCell('value').numFmt = '₹#,##0.00';
        row.getCell('value').font  = bold;
      }
      applyBorderToRow(summaryWs, i + 2, 2);
    });

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 2: Contributions
    // ════════════════════════════════════════════════════════════════════════
    const contribWs = wb.addWorksheet('💰 Contributions');
    contribWs.columns = [
      { header: '#',             key: 'no',            width: 6  },
      { header: 'Resident Name', key: 'name',          width: 22 },
      { header: 'Phone',         key: 'phone',         width: 15 },
      { header: 'Flat/House',    key: 'house',         width: 15 },
      { header: 'Amount (₹)',    key: 'amount',        width: 14 },
      { header: 'Mode',          key: 'mode',          width: 10 },
      { header: 'Status',        key: 'status',        width: 12 },
      { header: 'Transaction ID',key: 'txn',           width: 20 },
      { header: 'Date',          key: 'date',          width: 14 },
      { header: 'Recorded By',   key: 'recordedBy',    width: 18 },
    ];

    styleHeaderRow(contribWs, 1, 10);
    contributions.forEach((c, idx) => {
      const row = contribWs.addRow({
        no:         idx + 1,
        name:       c.residentId?.name          || '—',
        phone:      c.residentId?.phone         || '—',
        house:      c.residentId?.houseOrFlatNo || '—',
        amount:     c.amount,
        mode:       c.paymentMode,
        status:     c.paymentStatus,
        txn:        c.transactionId             || '—',
        date:       new Date(c.date).toLocaleDateString('en-IN'),
        recordedBy: c.recordedBy?.name          || '—',
      });
      row.getCell('amount').numFmt = '₹#,##0.00';
      applyBorderToRow(contribWs, idx + 2, 10);
    });

    // Total row
    const cTotalRow = contribWs.addRow({
      no: '', name: 'TOTAL', phone: '', house: '',
      amount: totalCollection,
      mode: '', status: '', txn: '', date: '', recordedBy: '',
    });
    cTotalRow.getCell('name').font   = bold;
    cTotalRow.getCell('amount').numFmt = '₹#,##0.00';
    cTotalRow.getCell('amount').font = bold;
    cTotalRow.fill = subHeaderFill;
    applyBorderToRow(contribWs, contributions.length + 2, 10);

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 3: Expenses
    // ════════════════════════════════════════════════════════════════════════
    const expWs = wb.addWorksheet('🧾 Expenses');
    expWs.columns = [
      { header: '#',           key: 'no',          width: 6  },
      { header: 'Title',       key: 'title',       width: 28 },
      { header: 'Category',    key: 'category',    width: 20 },
      { header: 'Amount (₹)',  key: 'amount',      width: 14 },
      { header: 'Notes',       key: 'notes',       width: 28 },
      { header: 'Date',        key: 'date',        width: 14 },
      { header: 'Recorded By', key: 'recordedBy',  width: 18 },
      { header: 'Receipt',     key: 'receipt',     width: 35 },
    ];

    styleHeaderRow(expWs, 1, 8);
    expenses.forEach((e, idx) => {
      const row = expWs.addRow({
        no:         idx + 1,
        title:      e.title,
        category:   e.category,
        amount:     e.amount,
        notes:      e.notes        || '—',
        date:       new Date(e.date).toLocaleDateString('en-IN'),
        recordedBy: e.recordedBy?.name || '—',
        receipt:    e.receiptImageUrl  || '—',
      });
      row.getCell('amount').numFmt = '₹#,##0.00';
      applyBorderToRow(expWs, idx + 2, 8);
    });

    // Total row
    const eTotalRow = expWs.addRow({
      no: '', title: 'TOTAL', category: '', amount: totalExpenses,
      notes: '', date: '', recordedBy: '', receipt: '',
    });
    eTotalRow.getCell('title').font  = bold;
    eTotalRow.getCell('amount').numFmt = '₹#,##0.00';
    eTotalRow.getCell('amount').font = bold;
    eTotalRow.fill = subHeaderFill;
    applyBorderToRow(expWs, expenses.length + 2, 8);

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 4: Category Breakdown
    // ════════════════════════════════════════════════════════════════════════
    const catWs = wb.addWorksheet('📂 By Category');
    catWs.columns = [
      { header: 'Category', key: 'category', width: 25 },
      { header: 'Total (₹)', key: 'total',   width: 15 },
      { header: '% of Spend', key: 'pct',    width: 15 },
    ];
    styleHeaderRow(catWs, 1, 3);

    const catMap = {};
    expenses.forEach((e) => {
      catMap[e.category] = (catMap[e.category] || 0) + e.amount;
    });

    Object.entries(catMap)
      .sort(([, a], [, b]) => b - a)
      .forEach(([cat, total], i) => {
        const row = catWs.addRow({
          category: cat,
          total,
          pct: totalExpenses > 0 ? `${((total / totalExpenses) * 100).toFixed(1)}%` : '0%',
        });
        row.getCell('total').numFmt = '₹#,##0.00';
        applyBorderToRow(catWs, i + 2, 3);
      });

    // ── Stream workbook to response ──────────────────────────────────────────
    const safeTitle = event.title.replace(/[^a-zA-Z0-9]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Falo_${safeTitle}_Audit.xlsx"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};

module.exports = { exportEventExcel };
