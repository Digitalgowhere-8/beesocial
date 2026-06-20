const runs = new Map();
const MAX_RUNS = 200;

function trimRuns() {
  if (runs.size <= MAX_RUNS) return;
  const keys = Array.from(runs.keys());
  for (const key of keys.slice(0, runs.size - MAX_RUNS)) {
    runs.delete(key);
  }
}

function startRun(runId, message = 'Fetch queued') {
  const now = new Date().toISOString();
  runs.set(String(runId), {
    runId: String(runId),
    status: 'running',
    step: 'queued',
    percent: 5,
    startedAt: now,
    updatedAt: now,
    messages: [{ at: now, step: 'queued', message }]
  });
  trimRuns();
}

function updateRun(runId, update = {}) {
  const key = String(runId);
  const now = new Date().toISOString();
  const current = runs.get(key) || {
    runId: key,
    status: 'running',
    step: 'queued',
    percent: 5,
    startedAt: now,
    messages: []
  };
  const next = {
    ...current,
    ...update,
    updatedAt: now,
    messages: [
      ...(current.messages || []),
      update.message ? { at: now, step: update.step || current.step || 'running', message: update.message } : null
    ].filter(Boolean).slice(-80)
  };
  runs.set(key, next);
  return next;
}

function finishRun(runId, update = {}) {
  return updateRun(runId, {
    ...update,
    status: update.status || 'success',
    step: update.step || 'complete',
    percent: update.percent || 100,
    finishedAt: new Date().toISOString()
  });
}

function getRun(runId) {
  return runs.get(String(runId)) || null;
}

module.exports = {
  startRun,
  updateRun,
  finishRun,
  getRun
};
