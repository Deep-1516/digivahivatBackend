/**
 * scripts/resetAndSeed.js
 *
 * Clears all collections from MongoDB (Contribution, Event, Expense, Resident, Society)
 * and creates a fresh SuperAdmin account using the configuration in backend/.env.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose     = require('mongoose');
const connectDB    = require('../src/config/db');
const Resident     = require('../src/models/Resident.model');
const Event        = require('../src/models/Event.model');
const Contribution = require('../src/models/Contribution.model');
const Expense      = require('../src/models/Expense.model');
const Society      = require('../src/models/Society.model');

const name  = process.env.ADMIN_NAME  || 'Super Admin';
const phone = process.env.ADMIN_PHONE || '6354331278';
const pass  = process.env.ADMIN_PASS  || 'Admin@1234';

(async () => {
  try {
    console.log('\n🧹  Clearing entire MongoDB database...');
    await connectDB();

    // Delete all records from all collections
    await Contribution.deleteMany({});
    await Event.deleteMany({});
    await Expense.deleteMany({});
    await Resident.deleteMany({});
    await Society.deleteMany({});

    console.log('✅  Database cleared completely.');

    // Create SuperAdmin account
    const superAdmin = await Resident.create({
      name,
      phone,
      password:     pass,
      totalMembers: 1,
      role:         'SuperAdmin',
      societyId:    null,
    });

    console.log('\n👑  SuperAdmin created:');
    console.log(`    Name     : ${superAdmin.name}`);
    console.log(`    Phone    : ${superAdmin.phone}`);
    console.log(`    Password : ${pass}`);
    console.log(`    Role     : ${superAdmin.role}`);
    console.log('\n✨  Database reset and fresh SuperAdmin seeding completed successfully!\n');

  } catch (error) {
    console.error('❌  Error during reset and seed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
