const mongoose = require('mongoose');
const Plan = require('../models/Plan');

const DEFAULT_PLANS = [
  {
    planId: 'free',
    label: 'Free',
    price: '$0',
    priceNote: 'Free forever',
    memberLimit: 1,
    limits: { fetchesPerMonth: 10, storageItems: 100, tokenBudgetMonthly: 50000 },
    access: { canFetch: true, canCreateMembers: false, canUseBlogStudio: false, canUseSavedSearches: false, canUseScheduler: false }
  },
  {
    planId: 'growth',
    label: 'Growth',
    price: '$29',
    priceNote: 'per month',
    memberLimit: 3,
    limits: { fetchesPerMonth: 50, storageItems: 2000, tokenBudgetMonthly: 500000 },
    access: { canFetch: true, canCreateMembers: true, canUseBlogStudio: false, canUseSavedSearches: true, canUseScheduler: true }
  },
  {
    planId: 'scale',
    label: 'Scale',
    price: '$99',
    priceNote: 'per month',
    memberLimit: 10,
    limits: { fetchesPerMonth: 300, storageItems: 15000, tokenBudgetMonthly: 3500000 },
    access: { canFetch: true, canCreateMembers: true, canUseBlogStudio: true, canUseSavedSearches: true, canUseScheduler: true }
  },
  {
    planId: 'enterprise',
    label: 'Enterprise',
    price: '$299',
    priceNote: 'per month',
    memberLimit: 999,
    limits: { fetchesPerMonth: 1500, storageItems: 999999, tokenBudgetMonthly: 10000000 },
    access: { canFetch: true, canCreateMembers: true, canUseBlogStudio: true, canUseSavedSearches: true, canUseScheduler: true }
  }
];

async function seedDefaultPlans() {
  try {
    const count = await Plan.countDocuments();
    if (count === 0) {
      await Plan.insertMany(DEFAULT_PLANS);
      console.log('[db] Seeded default plan configurations');
    }
  } catch (err) {
    console.error('[db] Seeding default plans failed:', err.message);
  }
}

let isConnected = false;

async function connectDB() {
  if (isConnected) return mongoose.connection;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set. Copy backend/.env.example -> backend/.env and fill it in.');
  }

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      autoIndex: true
    });
    isConnected = true;
    console.log(`[db] Connected to MongoDB -> ${mongoose.connection.host}/${mongoose.connection.name}`);
    await seedDefaultPlans();
    return mongoose.connection;
  } catch (err) {
    console.error('[db] MongoDB connection failed:', err.message);
    throw err;
  }
}

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('[db] MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('[db] MongoDB error:', err.message);
});

module.exports = { connectDB, mongoose };
