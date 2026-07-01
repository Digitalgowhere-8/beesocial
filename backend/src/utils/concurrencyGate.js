const activeJobs = new Map();

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const limits = {
  fetch: {
    global: toPositiveInt(process.env.MAX_ACTIVE_FETCH_JOBS, 6),
    perKey: toPositiveInt(process.env.MAX_ACTIVE_FETCH_JOBS_PER_TENANT, 1)
  },
  blog: {
    global: toPositiveInt(process.env.MAX_ACTIVE_BLOG_JOBS, 8),
    perKey: toPositiveInt(process.env.MAX_ACTIVE_BLOG_JOBS_PER_TENANT, 2)
  },
  social: {
    global: toPositiveInt(process.env.MAX_ACTIVE_SOCIAL_JOBS, 8),
    perKey: toPositiveInt(process.env.MAX_ACTIVE_SOCIAL_JOBS_PER_TENANT, 2)
  }
};

function bucket(type, scopeKey) {
  return `${String(type || 'job')}:${String(scopeKey || 'global')}`;
}

function totalActiveForType(type) {
  let total = 0;
  const prefix = `${String(type || 'job')}:`;
  for (const [key, count] of activeJobs.entries()) {
    if (key.startsWith(prefix)) total += count;
  }
  return total;
}

function activeForBucket(type, scopeKey) {
  return activeJobs.get(bucket(type, scopeKey)) || 0;
}

function acquire(type, scopeKey) {
  const config = limits[type] || { global: 4, perKey: 1 };
  const key = bucket(type, scopeKey);
  const globalActive = totalActiveForType(type);
  if (globalActive >= config.global) {
    const err = new Error(`Too many ${type} jobs are running right now. Please retry in a moment.`);
    err.status = 429;
    err.code = 'JOB_CONCURRENCY_LIMIT';
    throw err;
  }

  const scopedActive = activeForBucket(type, scopeKey);
  if (scopedActive >= config.perKey) {
    const err = new Error(`A ${type} job is already running for this workspace. Please wait for it to finish.`);
    err.status = 409;
    err.code = 'JOB_ALREADY_RUNNING';
    throw err;
  }

  activeJobs.set(key, scopedActive + 1);

  return () => {
    const current = activeJobs.get(key) || 0;
    if (current <= 1) activeJobs.delete(key);
    else activeJobs.set(key, current - 1);
  };
}

module.exports = {
  acquire
};
