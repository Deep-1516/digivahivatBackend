/**
 * scripts/seedAdmin.js
 *
 * One-time script to seed the first Admin account into the database.
 *
 * HOW TO RUN (from the backend/ folder):
 *   node scripts/seedAdmin.js
 *
 * Admin credentials are read from backend/.env:
 *   ADMIN_NAME     — display name  (default: "Super Admin")
 *   ADMIN_PHONE    — 10-digit phone (REQUIRED)
 *   ADMIN_PASS     — password, min 6 chars (default: "Admin@1234")
 *
 * If ADMIN_PHONE is not set in .env the script will exit with a clear message.
 * Safe to run multiple times — will promote an existing resident or skip if
 * Admin already exists.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const Resident  = require('../src/models/Resident.model');
const connectDB = require('../src/config/db');

// ── Read credentials from .env (with sensible defaults) ──────────────────────
const phone = process.env.ADMIN_PHONE;
const name  = process.env.ADMIN_NAME  || 'Super Admin';
const pass  = process.env.ADMIN_PASS  || 'Admin@1234';

(async () => {
  // ── Validate before even connecting ──────────────────────────────────────
  if (!phone) {
    console.error('\n❌  [Seed] ADMIN_PHONE is not set in your .env file.');
    console.error('     Add this line to backend/.env and retry:\n');
    console.error('     ADMIN_PHONE=9876543210\n');
    process.exit(1);
  }

  if (!/^\d{10}$/.test(phone)) {
    console.error(`\n❌  [Seed] ADMIN_PHONE "${phone}" is not a valid 10-digit number.\n`);
    process.exit(1);
  }

  if (pass.length < 6) {
    console.error('\n❌  [Seed] ADMIN_PASS must be at least 6 characters.\n');
    process.exit(1);
  }

  console.log('\n🌱  Falo — Seeding Admin Account');
  console.log('─'.repeat(40));

  // ── Connect to MongoDB ────────────────────────────────────────────────────
  await connectDB();

  // ── Guard: refuse if a SuperAdmin already exists (same logic as API endpoint) ──
  const existingSA = await Resident.findOne({ role: 'SuperAdmin' });
  if (existingSA) {
    console.log(`✅  SuperAdmin already exists: "${existingSA.name}" (${existingSA.phone}). Nothing to do.`);
    console.log(`    To reset, delete the existing SuperAdmin from MongoDB and run again.\n`);
    await mongoose.disconnect();
    return;
  }

  // ── Check if this phone already exists (promote them) ────────────────────
  const existing = await Resident.findOne({ phone });

  if (existing) {
    existing.role = 'SuperAdmin';
    await existing.save();
    console.log(`✅  Account "${existing.name}" (${phone}) promoted to SuperAdmin.\n`);
    await mongoose.disconnect();
    return;
  }

  // ── Create fresh SuperAdmin ───────────────────────────────────────────────
  const admin = await Resident.create({
    name,
    phone,
    password:     pass,
    totalMembers: 1,
    role:         'SuperAdmin',
    societyId:    null,
  });

  console.log(`✅  SuperAdmin account created successfully!`);
  console.log(`    Name  : ${admin.name}`);
  console.log(`    Phone : ${admin.phone}`);
  console.log(`    Role  : ${admin.role}`);
  console.log(`\n    Login at: http://localhost:3000/login`);
  console.log(`    Use phone "${phone}" and password "${pass}"\n`);

  await mongoose.disconnect();
})();
