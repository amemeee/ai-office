'use strict';
const express = require('express');
const agents = require('../services/agents');

const router = express.Router();

router.get('/', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  res.json(agents.listTasks(null, limit));
});
router.get('/:id', (req, res) => res.json(agents.getTask(Number(req.params.id))));
router.post('/:id/approve', (req, res) => res.json(agents.decide(Number(req.params.id), true)));
router.post('/:id/reject', (req, res) => res.json(agents.decide(Number(req.params.id), false)));

module.exports = router;
