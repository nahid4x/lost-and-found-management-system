import nodemailer from 'nodemailer';
import { escapeHtml } from '@findit/shared/sanitize';

/** SMTP transport from env; without SMTP_URL a no-op "json" transport is used (nothing leaves the machine). */
export function createMailer(env, logger) {
  const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : nodemailer.createTransport({ jsonTransport: true });
  return {
    async send({ to, subject, text, html }) {
      const info = await transport.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
      logger.info('email sent', { kind: subject.slice(0, 40) });
      return info;
    },
  };
}

/** Every user-controlled value is HTML-escaped before it enters a template. */
export function renderEmail({ heading, lines = [], cta }) {
  const body = lines.map((l) => `<p style="margin:0 0 12px;color:#334155">${escapeHtml(l)}</p>`).join('');
  const button = cta ? `<p><a href="${escapeHtml(cta.url)}" style="background:#14b8a6;color:#04201d;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>` : '';
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;padding:24px"><h2 style="color:#0f172a">${escapeHtml(heading)}</h2>${body}${button}<p style="color:#94a3b8;font-size:12px">FindIt - lost and found, together.</p></div>`;
  const text = [heading, ...lines, cta ? `${cta.label}: ${cta.url}` : ''].filter(Boolean).join('\n\n');
  return { html, text };
}
