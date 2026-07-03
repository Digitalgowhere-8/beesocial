/**
 * Cron job runner.
 *
 * Default schedule: 7:00 AM India Standard Time, every day.
 * Configurable via CRON_SCHEDULE and CRON_TIMEZONE in .env.
 *
 * Set ENABLE_CRON=false to disable (useful in dev).
 */
const cron = require('node-cron');
const orchestrator = require('../services/orchestrator');
const { runDueSchedules } = require('./userSchedule');
const { runDuePlatformFetch } = require('../services/platformFetchService');
const { cleanupAnalyticsRetention } = require('../services/storageMaintenance');
const { cleanupDeletedUsers } = require('../services/userDeletionService');

let task = null;
let maintenanceTask = null;

async function runStorageMaintenance(reason = 'scheduled') {
  try {
    const [analyticsResult, deletionResult] = await Promise.all([
      cleanupAnalyticsRetention(),
      cleanupDeletedUsers()
    ]);
    const deletedBatches = Number(deletionResult.processedBatches || 0);
    if (analyticsResult.deleted) {
      console.log(`[maintenance] ${reason} analytics cleanup removed ${analyticsResult.deleted} events older than ${analyticsResult.cutoff.toISOString()}`);
    } else {
      console.log(`[maintenance] ${reason} analytics cleanup found nothing to remove`);
    }
    if (deletedBatches) {
      console.log(`[maintenance] ${reason} deleted ${deletedBatches} soft-delete batch${deletedBatches === 1 ? '' : 'es'} in background cleanup`);
    } else {
      console.log(`[maintenance] ${reason} soft-delete cleanup found nothing due`);
    }
  } catch (err) {
    console.error('[maintenance] cleanup failed', err);
  }
}

function startUserScheduleScan() {
  // Always scan every minute so the time saved from the UI is the source of truth.
  // This scan only checks whether a saved schedule is due; the actual time still
  // comes from each user's saved schedule and the platform fetch config.
  const userSchedule = '* * * * *';
  if (process.env.ENABLE_USER_SCHEDULES === 'false') {
    console.log('[schedule] disabled by ENABLE_USER_SCHEDULES=false');
    return;
  }
  if (!cron.validate(userSchedule)) {
    console.error(`[schedule] invalid USER_SCHEDULE_CRON: ${userSchedule}`);
    return;
  }

  cron.schedule(
    userSchedule,
    async () => {
      try {
        const result = await runDueSchedules();
        if (result.triggered) console.log('[schedule] triggered due profiles', result);
        const platformResult = await runDuePlatformFetch();
        if (platformResult.triggered) console.log('[schedule] triggered platform fetch', platformResult);
      } catch (err) {
        console.error('[schedule] scan failed', err);
      }
    },
    { timezone: 'UTC', scheduled: true }
  );
  console.log(`[schedule] user profile scan scheduled "${userSchedule}" (UTC)`);
}

function start() {
  startUserScheduleScan();
  runStorageMaintenance('startup');

  if (process.env.ENABLE_CRON === 'false') {
    console.log('[cron] disabled by ENABLE_CRON=false');
    return;
  }
  const schedule = process.env.CRON_SCHEDULE || '0 7 * * *';
  const timezone = process.env.CRON_TIMEZONE || 'Asia/Kolkata';
  const maintenanceSchedule = '15 0 * * *';

  if (!cron.validate(schedule)) {
    console.error(`[cron] invalid CRON_SCHEDULE: ${schedule}`);
    return;
  }

  task = cron.schedule(
    schedule,
    async () => {
      console.log(`[cron] tick @ ${new Date().toISOString()} — running orchestrator`);
      try {
        const r = await orchestrator.runAll({ triggeredBy: 'cron' });
        console.log('[cron] done', r);
      } catch (err) {
        console.error('[cron] FAILED', err);
      }
    },
    { timezone, scheduled: true }
  );

  console.log(`[cron] scheduled "${schedule}" (${timezone})`);

  maintenanceTask = cron.schedule(
    maintenanceSchedule,
    () => runStorageMaintenance('daily'),
    { timezone, scheduled: true }
  );

  console.log(`[maintenance] scheduled "${maintenanceSchedule}" (${timezone})`);
}

function stop() {
  if (task) {
    task.stop();
    task = null;
  }
  if (maintenanceTask) {
    maintenanceTask.stop();
    maintenanceTask = null;
  }
}

module.exports = { start, stop };
