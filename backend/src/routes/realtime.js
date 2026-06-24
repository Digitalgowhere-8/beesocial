const express = require('express');
const { protect } = require('../middleware/auth');
const { subscribeClient } = require('../utils/realtime');

const router = express.Router();

router.get('/stream', protect, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  subscribeClient({ req, res, user: req.user });
});

module.exports = router;
