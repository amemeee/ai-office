'use strict';
// Tiny in-process event bus: 'state' (agent snapshots), 'task' (one task), 'health'.
const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(50);
module.exports = bus;
