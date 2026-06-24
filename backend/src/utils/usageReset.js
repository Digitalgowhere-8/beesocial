function startOfMonth(baseDate = new Date()) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
}

function latestUsageResetAt(users = []) {
  return users.reduce((latest, user) => {
    const value = user?.usageResetAt ? new Date(user.usageResetAt) : null;
    if (!value || Number.isNaN(value.getTime())) return latest;
    if (!latest || value > latest) return value;
    return latest;
  }, null);
}

function effectiveMonthlyStart(resetAt) {
  const monthFloor = startOfMonth();
  if (resetAt && resetAt > monthFloor) return resetAt;
  return monthFloor;
}

module.exports = {
  startOfMonth,
  latestUsageResetAt,
  effectiveMonthlyStart
};
