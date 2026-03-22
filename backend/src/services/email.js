const nodemailer = require('nodemailer');
const { getDb } = require('../db');

function getEmailConfig() {
  const db = getDb();
  const get = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '';
  return {
    enabled:  get('email_enabled') === 'true',
    host:     get('email_host'),
    port:     parseInt(get('email_port') || '587'),
    secure:   get('email_secure') === 'true',
    user:     get('email_user'),
    pass:     get('email_pass'),
    from:     get('email_from'),
    fromName: get('email_from_name') || 'Singarr',
  };
}

function getSetting(key) {
  const db = getDb();
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}

function createTransport(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });
}

async function sendEmail({ to, subject, html, text }) {
  const config = getEmailConfig();
  if (!config.enabled || !config.host || !to) return false;

  try {
    const transport = createTransport(config);
    await transport.sendMail({
      from: `"${config.fromName}" <${config.from || config.user}>`,
      to, subject, html, text,
    });
    return true;
  } catch (e) {
    console.error('[Email] Failed to send:', e.message);
    return false;
  }
}

async function testEmailConfig(config) {
  try {
    const transport = createTransport(config);
    await transport.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Email templates ───────────────────────────────────────

function baseTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:'Segoe UI',Arial,sans-serif;color:#f0f0f2;">
  <div style="max-width:560px;margin:40px auto;padding:0 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:linear-gradient(135deg,#1a7a45,#2dbe6c);border-radius:12px;padding:12px 20px;">
        <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">♪ Singarr</span>
      </div>
    </div>
    <div style="background:#18181c;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;">
      ${content}
    </div>
    <div style="text-align:center;margin-top:20px;font-size:12px;color:#55555f;">
      Singarr — Music request manager for Plex
    </div>
  </div>
</body>
</html>`;
}

function btn(text, url) {
  return `<a href="${url}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:#1a7a45;color:#fff;font-weight:700;font-size:15px;text-decoration:none;border-radius:8px;">${text}</a>`;
}

function coverImg(url) {
  return url ? `<img src="${url}" alt="" style="width:72px;height:72px;border-radius:8px;object-fit:cover;float:left;margin:0 16px 8px 0;">` : '';
}

// Request fulfilled
async function notifyRequestFulfilled(request, userEmail, appUrl = '') {
  if (getSetting('notify_request_fulfilled') !== 'true') return;
  if (!userEmail) return;
  const subject = `✓ "${request.title}" is ready in Plex`;
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#2dbe6c;">Your music is ready! 🎵</h2>
    <p style="color:#9898a8;margin:0 0 20px;">Your request has been downloaded and is now available in Plex.</p>
    <div style="background:#222228;border-radius:10px;padding:16px;overflow:hidden;">
      ${coverImg(request.cover_url)}
      <div style="overflow:hidden;">
        <div style="font-size:16px;font-weight:700;color:#f0f0f2;">${request.title}</div>
        ${request.artist_name ? `<div style="font-size:13px;color:#9898a8;margin-top:4px;">${request.artist_name}</div>` : ''}
        <div style="font-size:12px;color:#1a7a45;font-weight:600;margin-top:6px;text-transform:uppercase;">${request.type}</div>
      </div>
    </div>
    ${appUrl ? btn('Open Singarr', appUrl) : ''}
  `);
  return sendEmail({ to: userEmail, subject, html });
}

// Request approved
async function notifyRequestApproved(request, userEmail, appUrl = '') {
  if (getSetting('notify_request_approved') !== 'true') return;
  if (!userEmail) return;
  const subject = `✓ Request approved: "${request.title}"`;
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#4f9cf9;">Request approved</h2>
    <p style="color:#9898a8;margin:0 0 20px;">Your request has been approved and is now queued for processing.</p>
    <div style="background:#222228;border-radius:10px;padding:16px;">
      <div style="font-size:16px;font-weight:700;color:#f0f0f2;">${request.title}</div>
      ${request.artist_name ? `<div style="font-size:13px;color:#9898a8;margin-top:4px;">${request.artist_name}</div>` : ''}
    </div>
    ${appUrl ? btn('View Request', appUrl + '/requests') : ''}
  `);
  return sendEmail({ to: userEmail, subject, html });
}

// Request rejected
async function notifyRequestRejected(request, userEmail, reason = '', appUrl = '') {
  if (getSetting('notify_request_rejected') !== 'true') return;
  if (!userEmail) return;
  const subject = `Request declined: "${request.title}"`;
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#ef4444;">Request declined</h2>
    <p style="color:#9898a8;margin:0 0 20px;">Unfortunately your request has been declined.</p>
    <div style="background:#222228;border-radius:10px;padding:16px;">
      <div style="font-size:16px;font-weight:700;color:#f0f0f2;">${request.title}</div>
      ${reason ? `<div style="font-size:13px;color:#9898a8;margin-top:8px;">Reason: ${reason}</div>` : ''}
    </div>
    ${appUrl ? btn('View Requests', appUrl + '/requests') : ''}
  `);
  return sendEmail({ to: userEmail, subject, html });
}

// New request (admin alert)
async function notifyAdminNewRequest(request, requesterName, adminEmail, appUrl = '') {
  if (getSetting('notify_new_request_admin') !== 'true') return;
  if (!adminEmail) return;
  const subject = `New request: "${request.title}" by ${requesterName}`;
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#f0f0f2;">New music request</h2>
    <p style="color:#9898a8;margin:0 0 20px;"><strong style="color:#f0f0f2;">${requesterName}</strong> has requested new music.</p>
    <div style="background:#222228;border-radius:10px;padding:16px;overflow:hidden;">
      ${coverImg(request.cover_url)}
      <div style="overflow:hidden;">
        <div style="font-size:16px;font-weight:700;color:#f0f0f2;">${request.title}</div>
        ${request.artist_name ? `<div style="font-size:13px;color:#9898a8;margin-top:4px;">${request.artist_name}</div>` : ''}
        <div style="font-size:12px;color:#1a7a45;font-weight:600;margin-top:6px;text-transform:uppercase;">${request.type}</div>
      </div>
    </div>
    ${appUrl ? btn('Review Request', appUrl + '/admin?tab=requests') : ''}
  `);
  return sendEmail({ to: adminEmail, subject, html });
}

// New issue (admin alert)
async function notifyAdminNewIssue(issue, reporterName, adminEmail, appUrl = '') {
  if (getSetting('notify_new_issue_admin') !== 'true') return;
  if (!adminEmail) return;
  const typeLabels = { missing_tracks: 'Missing Tracks', poor_quality: 'Poor Audio Quality', other: 'Other' };
  const typeLabel = typeLabels[issue.type] || issue.type;
  const subject = `New issue reported: "${issue.title}" by ${reporterName}`;
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#f0f0f2;">New issue reported</h2>
    <p style="color:#9898a8;margin:0 0 20px;"><strong style="color:#f0f0f2;">${reporterName}</strong> has reported an issue.</p>
    <div style="background:#222228;border-radius:10px;padding:16px;">
      <div style="font-size:11px;font-weight:700;color:#e8a30f;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${typeLabel}</div>
      <div style="font-size:16px;font-weight:700;color:#f0f0f2;">${issue.title}</div>
      ${issue.description ? `<div style="font-size:13px;color:#9898a8;margin-top:8px;line-height:1.6;">${issue.description}</div>` : ''}
    </div>
    ${appUrl ? btn('View Issues', appUrl + '/issues') : ''}
  `);
  return sendEmail({ to: adminEmail, subject, html });
}

// Issue status updated (user notification)
async function notifyIssueStatusChanged(issue, userEmail, appUrl = '') {
  if (!userEmail) return;
  const statusLabels = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };
  const statusColors = { open: '#e8a30f', in_progress: '#4f9cf9', resolved: '#2dbe6c' };
  const statusLabel = statusLabels[issue.status] || issue.status;
  const color = statusColors[issue.status] || '#9898a8';
  const subject = `Issue update: "${issue.title}" is now ${statusLabel}`;
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${color};">Issue status updated</h2>
    <p style="color:#9898a8;margin:0 0 20px;">Your issue status has been changed.</p>
    <div style="background:#222228;border-radius:10px;padding:16px;">
      <div style="font-size:16px;font-weight:700;color:#f0f0f2;">${issue.title}</div>
      <div style="margin-top:10px;display:inline-block;padding:4px 12px;border-radius:999px;background:${statusColors[issue.status] ? statusColors[issue.status] + '22' : '#222'};color:${color};font-size:12px;font-weight:700;">${statusLabel}</div>
      ${issue.admin_note ? `<div style="margin-top:12px;padding:10px 14px;background:rgba(26,122,69,0.08);border:1px solid rgba(26,122,69,0.2);border-radius:8px;"><div style="font-size:11px;font-weight:700;color:#2dbe6c;margin-bottom:4px;">Admin note</div><div style="font-size:13px;color:#9898a8;">${issue.admin_note}</div></div>` : ''}
    </div>
    ${appUrl ? btn('View Issue', appUrl + '/issues') : ''}
  `);
  return sendEmail({ to: userEmail, subject, html });
}

// Admin note added (user notification)
async function notifyIssueNoteAdded(issue, userEmail, appUrl = '') {
  if (!userEmail || !issue.admin_note) return;
  const subject = `Admin replied to your issue: "${issue.title}"`;
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#2dbe6c;">Admin replied to your issue</h2>
    <p style="color:#9898a8;margin:0 0 20px;">An admin has added a note to your issue.</p>
    <div style="background:#222228;border-radius:10px;padding:16px;">
      <div style="font-size:16px;font-weight:700;color:#f0f0f2;margin-bottom:12px;">${issue.title}</div>
      <div style="padding:10px 14px;background:rgba(26,122,69,0.08);border:1px solid rgba(26,122,69,0.2);border-radius:8px;">
        <div style="font-size:11px;font-weight:700;color:#2dbe6c;margin-bottom:4px;">Admin note</div>
        <div style="font-size:13px;color:#9898a8;line-height:1.6;">${issue.admin_note}</div>
      </div>
    </div>
    ${appUrl ? btn('View Issue', appUrl + '/issues') : ''}
  `);
  return sendEmail({ to: userEmail, subject, html });
}

module.exports = {
  sendEmail,
  testEmailConfig,
  getEmailConfig,
  notifyRequestFulfilled,
  notifyRequestApproved,
  notifyRequestRejected,
  notifyAdminNewRequest,
  notifyAdminNewIssue,
  notifyIssueStatusChanged,
  notifyIssueNoteAdded,
};
