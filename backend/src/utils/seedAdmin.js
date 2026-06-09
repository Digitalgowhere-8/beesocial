/**
 * Seed initial Super Admin from env vars.
 * Usage:  cd backend && npm run seed
 *
 * Re-running is safe: it won't overwrite an existing admin with the same email.
 */
require('dotenv').config();
const { connectDB, mongoose } = require('../config/db');
const User = require('../models/User');

async function seed() {
  await connectDB();

  const email = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    console.error('Missing SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD in .env');
    process.exit(1);
  }

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== 'super_admin') {
      existing.role = 'super_admin';
      existing.isActive = true;
      await existing.save();
      console.log(`[seed] Upgraded existing user ${email} to super_admin`);
    } else {
      if (!existing.isActive) {
        existing.isActive = true;
        await existing.save();
      }
      console.log(`[seed] Super admin already exists: ${email}`);
    }
  } else {
    const admin = await User.create({ name, email, password, role: 'super_admin', isActive: true });
    console.log(`[seed] Created super_admin -> ${admin.email}`);
    console.log('       You can now log in with the SEED_ADMIN_PASSWORD from .env');
  }

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
