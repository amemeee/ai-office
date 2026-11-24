'use strict';
const express = require('express');
const meeting = require('../services/meeting');

const router = express.Router();
router.get('/', (req, res) => res.json(meeting.get()));
router.get('/history', (req, res) => res.json(meeting.history()));
router.post('/stop', (req, res) => res.json(meeting.stop()));
router.get('/:id', (req, res) => res.json(meeting.getMeeting(Number(req.params.id))));
router.post('/', (req, res) => res.status(201).json(meeting.start(req.body?.kind, req.body?.topic)));
module.exports = router;
