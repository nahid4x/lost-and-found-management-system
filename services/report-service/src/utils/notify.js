const Notification = require('../models/Notification');

// Adapter: change the body if your notification service has a different API.
async function notify({ user, type = 'report_update', title, message, link }) {
  const url = process.env.NOTIFICATION_URL;
  if (url) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_KEY || '' },
        body: JSON.stringify({ user, type, title, message, link })
      });
      if (r.ok) return;
    } catch { /* fall back to local store */ }
  }
  await Notification.create({ user, type, title, message, link });
}

module.exports = { notify };
