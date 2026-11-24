'use strict';
/**
 * Read-only inbox access over IMAP. The mailbox is opened read-only (EXAMINE),
 * so nothing is marked as read, moved or deleted. Sending is NOT implemented.
 */
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const config = require('../config');

const configured = () => !!(config.imap.host && config.imap.user && config.imap.pass);

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function listInbox(limit = 10) {
  if (!configured()) {
    throw fail(501, 'Email is not configured. Add IMAP_HOST, IMAP_USER and IMAP_PASS to .env and restart the server.');
  }
  const { host, port, secure, user, pass } = config.imap;
  const client = new ImapFlow({ host, port, secure, auth: { user, pass }, logger: false });
  client.on('error', () => { /* surfaced through the rejected promise below */ });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const total = client.mailbox.exists;
      if (!total) return [];
      const out = [];
      for await (const msg of client.fetch(`${Math.max(1, total - limit + 1)}:*`, { uid: true, flags: true, source: true })) {
        const mail = await simpleParser(msg.source);
        const body = (mail.text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
        out.push({
          uid: msg.uid,
          from: mail.from?.text || 'Unknown sender',
          subject: mail.subject || '(no subject)',
          date: mail.date ? mail.date.toISOString() : null,
          unread: !msg.flags.has('\\Seen'),
          body: body.slice(0, 4000),
        });
      }
      return out.reverse(); // newest first
    } finally {
      lock.release();
    }
  } catch (e) {
    if (e.status) throw e;
    const auth = e.authenticationFailed || /auth|credential|login/i.test(e.responseText || e.message || '');
    throw fail(502, auth
      ? 'The mail server rejected the login. Gmail and Outlook need an app password, not your normal password.'
      : `Could not read the inbox: ${e.responseText || e.code || e.message}`);
  } finally {
    await client.logout().catch(() => {});
  }
}

module.exports = { configured, listInbox };
