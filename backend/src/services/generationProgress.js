/**
 * generationProgress.js
 * ---------------------
 * Tracks active blog / LinkedIn generation jobs per tenant.
 * Same in-memory pattern as profileRunProgress.js.
 */

const jobs = new Map();

/**
 * Start tracking a generation job for a tenant.
 * @param {string} tenantId
 * @param {'blog'|'linkedin'} type
 */
function startGeneration(tenantId, type) {
  jobs.set(String(tenantId), {
    tenantId: String(tenantId),
    type,
    status: 'running',
    startedAt: new Date().toISOString(),
    cancelled: false
  });
}

/**
 * Mark a generation job as successfully completed.
 * @param {string} tenantId
 * @param {string} resultId
 * @param {any} data
 */
function completeGeneration(tenantId, resultId, data = null) {
  const key = String(tenantId);
  const existing = jobs.get(key);
  if (existing) {
    jobs.set(key, {
      ...existing,
      status: 'completed',
      resultId,
      data,
      finishedAt: new Date().toISOString()
    });
  }
}

/**
 * Mark a generation job as failed.
 * @param {string} tenantId
 * @param {string} error
 */
function failGeneration(tenantId, error) {
  const key = String(tenantId);
  const existing = jobs.get(key);
  if (existing) {
    jobs.set(key, {
      ...existing,
      status: 'failed',
      error: String(error || 'Generation failed'),
      finishedAt: new Date().toISOString()
    });
  }
}

/**
 * Remove the generation job from tracking.
 * @param {string} tenantId
 */
function finishGeneration(tenantId) {
  jobs.delete(String(tenantId));
}

/**
 * Mark a generation job as cancelled. The generator should call isCancelled()
 * periodically and abort if true.
 * @param {string} tenantId
 */
function cancelGeneration(tenantId) {
  const key = String(tenantId);
  const existing = jobs.get(key);
  if (existing) {
    jobs.set(key, { ...existing, cancelled: true, status: 'cancelled' });
  }
}

/**
 * Check whether a generation job has been cancelled.
 * @param {string} tenantId
 * @returns {boolean}
 */
function isCancelled(tenantId) {
  return jobs.get(String(tenantId))?.cancelled === true;
}

/**
 * Get the current generation state for a tenant, or null if idle.
 * @param {string} tenantId
 * @returns {{ tenantId, type, status, startedAt, cancelled } | null}
 */
function getGeneration(tenantId) {
  return jobs.get(String(tenantId)) || null;
}

module.exports = {
  startGeneration,
  completeGeneration,
  failGeneration,
  finishGeneration,
  cancelGeneration,
  isCancelled,
  getGeneration
};
