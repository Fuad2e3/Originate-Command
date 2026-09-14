/* =========================================================================
   emailService.js — Automated Email Dispatcher
   Sends automated invitation emails, token links, and system notifications.
   Supports Gmail SMTP and Resend API.
   ========================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const prodEnv = path.join(__dirname, '..', '.env.production');
const defaultEnv = path.join(__dirname, '..', '.env');
const envPath = (process.env.NODE_ENV === 'production' && fs.existsSync(prodEnv)) ? prodEnv : defaultEnv;
require('dotenv').config({ path: envPath });

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) { }

/**
 * Dispatches an email via Resend API
 */
function sendResendEmail({ from, to, subject, html, text }) {
  return new Promise((resolve) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || apiKey.trim() === '' || apiKey.startsWith('re_your_api_key')) {
      return resolve({
        success: false,
        simulated: true,
        message: 'RESEND_API_KEY not configured in .env.'
      });
    }

    const payload = JSON.stringify({
      from: from || process.env.FROM_EMAIL || 'Originate Command <onboarding@resend.dev>',
      to: Array.isArray(to) ? to : [to],
      subject: subject || 'Originate Command Notification',
      html: html,
      text: text || 'Originate Command notification.'
    });

    const options = {
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✅ [Email Dispatcher - Resend] Email sent to ${to} (ID: ${parsed.id})`);
            resolve({ success: true, id: parsed.id, data: parsed });
          } else {
            console.warn(`⚠️ [Email Dispatcher - Resend Error] Code ${res.statusCode}:`, parsed.message || data);
            resolve({ success: false, error: parsed.message || 'Resend error', statusCode: res.statusCode });
          }
        } catch (e) {
          resolve({ success: false, error: data, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ [Email Dispatcher] Resend network error:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ success: false, error: 'Request timed out after 10s' });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Universal Dispatcher: Supports Gmail SMTP, Custom SMTP, and Resend API
 */
async function dispatchOutboundEmail({ from, replyTo, to, cc, subject, html, text }) {
  const gmailUser = process.env.GMAIL_USER || process.env.SMTP_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;

  // 1. Send via Gmail SMTP if configured
  if (nodemailer && gmailUser && gmailPass) {
    try {
      const transporter = nodemailer.createTransport({
        service: process.env.SMTP_SERVICE || 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass
        }
      });

      const mailOptions = {
        from: from || `Originate Command <${gmailUser}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject: subject,
        html: html,
        text: text
      };
      if (cc) mailOptions.cc = Array.isArray(cc) ? cc.join(', ') : cc;
      if (replyTo) mailOptions.replyTo = replyTo;

      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ [Email Dispatcher - Gmail SMTP] Delivered TO: ${mailOptions.to} | CC: ${mailOptions.cc || 'none'} (ID: ${info.messageId})`);
      return { success: true, id: info.messageId, provider: 'smtp' };
    } catch (err) {
      console.error('❌ [Email Dispatcher - SMTP Error]:', err.message);
    }
  }

  // 2. Send via Resend API if key is present
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && resendKey.trim() && !resendKey.startsWith('re_your_api_key')) {
    return await sendResendEmail({ from, to, subject, html, text });
  }

  // 3. Simulated Notice
  console.log(`ℹ️ [Email Dispatcher] Direct email delivery requires RESEND_API_KEY or GMAIL_APP_PASSWORD in dev3/API/.env.`);
  return {
    success: false,
    simulated: true,
    message: 'Add RESEND_API_KEY or GMAIL_APP_PASSWORD in dev3/API/.env for automated inbox delivery.'
  };
}

function getAppBaseUrl(appUrl) {
  if (process.env.APP_URL && process.env.APP_URL.trim() && !process.env.APP_URL.includes('localhost')) {
    return process.env.APP_URL.trim();
  }
  if (appUrl && !appUrl.includes('localhost')) {
    return appUrl;
  }
  return appUrl || process.env.APP_URL || 'https://originateteam.com';
}

/**
 * Builds HTML template and sends workspace invite
 */
async function sendInviteEmail({ to, name, departmentName, levelName, token, passcode, appUrl }) {
  const base = getAppBaseUrl(appUrl);
  const claimUrl = `${base.replace(/\/$/, '')}/#claim=${token}`;
  const code = passcode || (token ? token.slice(4, 12).toUpperCase() : 'OC-72PASS');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to Originate Command</title>
</head>
<body style="margin:0;padding:0;background-color:#0F172A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#E2E8F0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0F172A;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#1E293B;border-radius:12px;border:1px solid #334155;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.3);">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px;background-color:#0F172A;border-bottom:1px solid #334155;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <div style="display:inline-block;background-color:#2563EB;color:#FFFFFF;font-weight:700;font-size:14px;padding:4px 10px;border-radius:6px;letter-spacing:1px;">OC</div>
                    <span style="font-size:18px;font-weight:700;color:#F8FAFC;margin-left:10px;vertical-align:middle;">Originate Command</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding:32px;">
              <h1 style="font-size:22px;font-weight:700;color:#F8FAFC;margin:0 0 16px 0;">You're Invited to Join the Team</h1>
              <p style="font-size:15px;line-height:1.6;color:#CBD5E1;margin:0 0 18px 0;">
                Hello <strong>${name || 'Team Member'}</strong>,
              </p>
              <p style="font-size:15px;line-height:1.6;color:#CBD5E1;margin:0 0 24px 0;">
                You have been invited to the <strong>Originate Command</strong> workspace for <strong>${departmentName || 'General Operations'}</strong> assigned as <strong>${levelName || 'Member'}</strong>.
              </p>

              <div style="background-color:#0F172A;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:24px;">
                <p style="margin:0 0 8px 0;font-size:13px;color:#94A3B8;"><strong>Gmail Address:</strong> <span style="color:#F8FAFC;font-family:monospace;">${to}</span></p>
                <p style="margin:0 0 8px 0;font-size:13px;color:#94A3B8;"><strong>Department:</strong> ${departmentName || 'Development Operations'}</p>
                <p style="margin:0 0 8px 0;font-size:13px;color:#94A3B8;"><strong>Role Level:</strong> ${levelName || 'Member'}</p>
                <p style="margin:0 0 8px 0;font-size:14px;color:#38BDF8;"><strong>72-Hour Passcode / Password:</strong> <code style="background:#1E293B;padding:4px 10px;border-radius:4px;color:#F8FAFC;font-family:monospace;font-size:15px;font-weight:700;border:1px solid #334155;">${code}</code></p>
                <p style="margin:10px 0 0 0;font-size:12px;color:#F59E0B;">⏳ <strong>Security Notice:</strong> Both the invite link and password remain valid for <strong>72 hours</strong>.</p>
              </div>

              <!-- Button CTA -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0;">
                <tr>
                  <td align="center" style="border-radius:8px;background-color:#2563EB;">
                    <a href="${claimUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">
                      Accept Invitation & Connect Account →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:12.5px;line-height:1.5;color:#64748B;margin:24px 0 0 0;">
                You can sign in using the button above, or by entering your Gmail and the 72-hour Passcode on the login page:<br>
                <a href="${claimUrl}" style="color:#38BDF8;word-break:break-all;font-size:12px;">${claimUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#0F172A;border-top:1px solid #334155;text-align:center;">
              <p style="font-size:12px;color:#64748B;margin:0;">
                Originate Command · Operations Command Center
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const text = `You're invited to Originate Command workspace for ${departmentName || 'Operations'} (${levelName || 'Member'}). Accept your invite here: ${claimUrl} (Link expires in 72 hours)`;

  return dispatchOutboundEmail({
    to,
    subject: `Invitation to join Originate Command — ${departmentName || 'Workspace'}`,
    html,
    text
  });
}

/**
 * Builds HTML template and sends automated operational alert/notification email
 */
async function sendNotificationEmail(opts) {
  const { from, fromEmail, to, cc, type, title, body, actorName, actorEmail, subject, appUrl, alertText, itemTitle, itemUrl, priority } = opts || {};

  const base = getAppBaseUrl(appUrl || itemUrl);
  const actionUrl = base.replace(/\/$/, '');
  const itemType = type || 'Notification';
  const displayTitle = title || itemTitle || 'Operational Notification';
  const displayBody = body || alertText || '';
  const assignerName = actorName || 'A team member';
  const assignerEmail = actorEmail || fromEmail || '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Originate Command — ${itemType}</title>
</head>
<body style="margin:0;padding:0;background-color:#0F172A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#E2E8F0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0F172A;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#1E293B;border-radius:12px;border:1px solid #334155;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.3);">
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;background-color:#0F172A;border-bottom:1px solid #334155;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <div style="display:inline-block;background-color:#2563EB;color:#FFFFFF;font-weight:700;font-size:13px;padding:4px 10px;border-radius:6px;letter-spacing:1px;">
                      ${itemType.toUpperCase()}
                    </div>
                    <span style="font-size:17px;font-weight:700;color:#F8FAFC;margin-left:10px;vertical-align:middle;">Originate Command</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="font-size:14px;color:#94A3B8;margin:0 0 12px 0;">
                <strong>Assigned / Posted by:</strong> ${assignerName} ${assignerEmail ? '&lt;' + assignerEmail + '&gt;' : ''}
              </p>
              <h2 style="font-size:20px;font-weight:700;color:#F8FAFC;margin:0 0 14px 0;">
                ${displayTitle}
              </h2>
              ${displayBody ? `
              <div style="background-color:#0F172A;border:1px solid #334155;border-radius:8px;padding:18px;margin-bottom:24px;">
                <p style="margin:0;font-size:14.5px;line-height:1.6;color:#F1F5F9;white-space:pre-wrap;">
                  ${displayBody}
                </p>
              </div>
              ` : ''}

              <!-- Button CTA -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td align="center" style="border-radius:8px;background-color:#2563EB;">
                    <a href="${actionUrl}" target="_blank" style="display:inline-block;padding:12px 26px;font-size:14.5px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">
                      Open Originate Command →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:12px;line-height:1.5;color:#64748B;margin:20px 0 0 0;">
                Direct link: <a href="${actionUrl}" style="color:#38BDF8;word-break:break-all;">${actionUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background-color:#0F172A;border-top:1px solid #334155;text-align:center;">
              <p style="font-size:12px;color:#64748B;margin:0;">
                Originate Command · Operations Command Center
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const mailSubject = subject || `[${itemType}] ${displayTitle} — ${assignerName}`;
  const text = `[${itemType}] ${displayTitle} — ${assignerName}. ${displayBody}\nOpen Workspace: ${actionUrl}`;

  const mailFrom = from || (assignerName && assignerEmail ? `"${assignerName}" <${process.env.GMAIL_USER || "fuadkalaroa2002@gmail.com"}>` : undefined);

  return dispatchOutboundEmail({
    from: mailFrom,
    replyTo: assignerEmail || undefined,
    to,
    cc,
    subject: mailSubject,
    html,
    text
  });
}

module.exports = {
  dispatchOutboundEmail,
  sendResendEmail,
  sendInviteEmail,
  sendNotificationEmail
};
