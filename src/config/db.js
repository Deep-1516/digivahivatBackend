/**
 * config/db.js — MongoDB connection via Mongoose.
 */
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`[MongoDB] Connected: ${conn.connection.host}`);

    // Drop legacy unique indexes (e.g. receiptNumber_1) if present on contributions collection
    try {
      const contribCollection = conn.connection.collection('contributions');
      const indexes = await contribCollection.indexes();
      const legacyIdx = indexes.find((idx) => idx.name === 'receiptNumber_1');
      if (legacyIdx) {
        await contribCollection.dropIndex('receiptNumber_1');
        console.log('[MongoDB] Cleared legacy receiptNumber_1 index');
      }
    } catch (_idxErr) {
      // Ignore index drop error if collection does not exist yet
    }
  } catch (err) {
    console.error(`[MongoDB] Connection error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
