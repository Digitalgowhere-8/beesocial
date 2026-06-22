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

let task = null;

function startUserScheduleScan() {
  const userSchedule = process.env.USER_SCHEDULE_CRON || '*/10 * * * *';
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

  if (process.env.ENABLE_CRON === 'false') {
    console.log('[cron] disabled by ENABLE_CRON=false');
    return;
  }
  const schedule = process.env.CRON_SCHEDULE || '0 7 * * *';
  const timezone = process.env.CRON_TIMEZONE || 'Asia/Kolkata';

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
}

function stop() {
  if (task) {
    task.stop();
    task = null;
  }
}

module.exports = { start, stop };
