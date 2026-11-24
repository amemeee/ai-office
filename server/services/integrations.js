'use strict';
/**
 * Phase 4 extension points. Nothing here is connected yet; each integration
 * reports its real status so the UI never pretends otherwise.
 * To add one: implement `run()` and set `status` to 'connected' once configured.
 */
const notConnected = (name) => async () => {
  const e = new Error(`${name} integration is not connected yet.`);
  e.status = 501;
  throw e;
};

const integrations = [
  { id: 'pdf', name: 'PDF / document processing', status: 'planned', agent: 'documents',
    description: 'Local text extraction for uploaded PDFs (no cloud).', run: notConnected('PDF') },
  { id: 'email', name: 'Email (IMAP/SMTP)', status: 'planned', agent: 'email',
    description: 'Read inbox and send approved drafts. Sending will always require approval.', run: notConnected('Email') },
  { id: 'n8n', name: 'n8n workflows', status: 'planned', agent: 'automation',
    description: 'Trigger approved workflows through the n8n webhook API.', run: notConnected('n8n') },
];

const list = () => integrations.map(({ run, ...info }) => info);
module.exports = { list, integrations };
