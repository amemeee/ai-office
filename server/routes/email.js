'use strict';
const express = require('express');
const email = require('../services/email');

const router = express.Router();

router.get('/inbox', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 25);
    res.json(await email.listInbox(limit));
  } catch (e) { next(e); }
});

module.exports = router;
