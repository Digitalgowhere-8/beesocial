const clients = new Set();
let keepAliveStarted = false;

function tenantKeyFor(user = {}) {
  if (!user?._id) return '';
  if (user.role === 'user') return String(user.tenantAdminId || user._id);
  return String(user._id);
}

function ensureKeepAlive() {
  if (keepAliveStarted) return;
  keepAliveStarted = true;
  setInterval(() => {
    for (const client of clients) {
      try {
        client.res.write(': keep-alive\n\n');
      } catch {
        clients.delete(client);
      }
    }
  }, 25000).unref();
}

function subscribeClient({ req, res, user }) {
  ensureKeepAlive();

  const client = {
    res,
    userId: String(user?._id || ''),
    tenantKey: tenantKeyFor(user),
    role: String(user?.role || '')
  };

  clients.add(client);
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  req.on('close', () => {
    clients.delete(client);
  });
}

function sendEvent(client, eventName, payload) {
  client.res.write(`event: ${eventName}\n`);
  client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function publishTenantEvent(tenantKey, eventName, payload = {}) {
  const key = String(tenantKey || '');
  if (!key) return;
  for (const client of clients) {
    if (client.tenantKey !== key) continue;
    try {
      sendEvent(client, eventName, payload);
    } catch {
      clients.delete(client);
    }
  }
}

function publishGlobalEvent(eventName, payload = {}) {
  for (const client of clients) {
    try {
      sendEvent(client, eventName, payload);
    } catch {
      clients.delete(client);
    }
  }
}

module.exports = {
  tenantKeyFor,
  subscribeClient,
  publishTenantEvent,
  publishGlobalEvent
};
