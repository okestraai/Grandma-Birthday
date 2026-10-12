/**
 * Email templates. Table-based layout with inline styles so they render in Gmail,
 * Outlook, Apple Mail and mobile clients. Every dynamic value is HTML-escaped.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const NAVY = '#071A2B';
const EMERALD = '#0B3D35';
const GOLD = '#D6B36A';
const GOLD_RICH = '#B88A35';
const IVORY = '#FAF7F0';
const MUTED = '#6F6A61';

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 8px">
  <tr><td align="center" bgcolor="${GOLD}" style="border-radius:999px">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 32px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:${NAVY};text-decoration:none;border-radius:999px">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

function detailRows(rows: [string, string | null | undefined][]): string {
  return rows
    .filter(([, value]) => value)
    .map(
      ([label, value]) => `<tr>
      <td style="padding:8px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${GOLD_RICH};width:38%;vertical-align:top">${escapeHtml(label)}</td>
      <td style="padding:8px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:${NAVY};vertical-align:top">${escapeHtml(value)}</td>
    </tr>`,
    )
    .join('');
}

function layout(options: { preheader: string; heading: string; body: string; footer?: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escapeHtml(options.heading)}</title></head>
<body style="margin:0;padding:0;background:${IVORY}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(options.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${IVORY}">
<tr><td align="center" style="padding:32px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #E9DFC7;border-radius:16px;overflow:hidden">
    <tr><td align="center" bgcolor="${NAVY}" style="background:${NAVY};background-image:linear-gradient(135deg,${NAVY} 0%,${EMERALD} 100%);padding:36px 24px">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:56px;line-height:1;color:${GOLD};letter-spacing:2px">70</div>
      <div style="margin-top:10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#F1E3C0">A celebration of life, love &amp; legacy</div>
    </td></tr>
    <tr><td style="height:3px;background:${GOLD};line-height:3px;font-size:0">&nbsp;</td></tr>
    <tr><td style="padding:36px 36px 28px">
      <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:26px;line-height:1.3;color:${NAVY}">${escapeHtml(options.heading)}</h1>
      ${options.body}
    </td></tr>
    <tr><td style="padding:20px 36px 32px;border-top:1px solid #F1E9D6;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED}">
      ${options.footer ?? 'You are receiving this email because of a celebration you are part of. If this was not you, you can ignore it.'}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#1B1B1B">${text}</p>`;
}

/** One event in an invitation email. */
export interface EmailEvent {
  name: string;
  dateText: string;
  timeText: string;
  venue: string;
  address: string;
  dressCode: string | null;
  /** Guest plus the companions coming to this event. */
  partySize: number;
}

export interface InvitationEmailData {
  guestName: string;
  celebrantName: string;
  eventName: string;
  /** The guest's events. One event keeps the original layout; several get one block each. */
  events: EmailEvent[];
  partySize: number;
  code: string;
  invitationUrl: string;
  isRsvpConfirmation: boolean;
}

export function invitationEmail(data: InvitationEmailData): RenderedEmail {
  const subject = data.isRsvpConfirmation
    ? `You're on the guest list — ${data.eventName}`
    : `You're invited: ${data.eventName}`;
  const intro = data.isRsvpConfirmation
    ? `Dear ${escapeHtml(data.guestName)}, thank you for your RSVP. We are delighted you will join us to celebrate <strong>${escapeHtml(data.celebrantName)}</strong>.`
    : `Dear ${escapeHtml(data.guestName)}, you are warmly invited to celebrate <strong>${escapeHtml(data.celebrantName)}</strong>.`;
  const admits = (n: number) => `${n} ${n === 1 ? 'guest' : 'guests'}`;
  const single = data.events.length <= 1;
  const [only] = data.events;
  const details = single
    ? detailRows([
        ['Date', only?.dateText],
        ['Time', only?.timeText],
        ['Venue', only?.venue],
        ['Address', only?.address],
        ['Dress code', only?.dressCode],
        ['Admits', admits(data.partySize)],
        ['Invitation', data.code],
      ])
    : data.events
        .map(
          (e) => `<tr><td colspan="2" style="padding:16px 0 2px;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:${NAVY}">${escapeHtml(e.name)}</td></tr>
    ${detailRows([
      ['When', `${e.dateText}, ${e.timeText}`],
      ['Venue', `${e.venue}, ${e.address}`],
      ['Dress code', e.dressCode],
      ['Admits', admits(e.partySize)],
    ])}`,
        )
        .join('') + detailRows([['Invitation', data.code]]);
  const body = `${paragraph(intro)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px;border-top:1px solid #F1E9D6;border-bottom:1px solid #F1E9D6">
    ${details}
  </table>
  ${button(data.invitationUrl, data.isRsvpConfirmation ? 'View your digital invitation' : 'Open your invitation & RSVP')}
  ${paragraph(`<span style="color:${MUTED};font-size:13px">Your digital invitation holds a personal QR code${single ? '' : ' that works at every event'}. Please have it ready on your phone, or printed, when you arrive.</span>`)}`;
  const eventText = single
    ? [
        `Date: ${only?.dateText ?? ''}`,
        `Time: ${only?.timeText ?? ''}`,
        `Venue: ${only?.venue ?? ''}, ${only?.address ?? ''}`,
        only?.dressCode ? `Dress code: ${only.dressCode}` : '',
        `Admits: ${data.partySize}`,
      ]
    : data.events.map((e) => `${e.name}: ${e.dateText}, ${e.timeText}. ${e.venue}, ${e.address}.${e.dressCode ? ` Dress code: ${e.dressCode}.` : ''} Admits ${e.partySize}.`);
  const text = [
    data.isRsvpConfirmation ? `Dear ${data.guestName}, thank you for your RSVP.` : `Dear ${data.guestName}, you are invited.`,
    `${data.eventName} — celebrating ${data.celebrantName}`,
    ...eventText,
    `Invitation: ${data.code}`,
    `Your invitation: ${data.invitationUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
  return { subject, text, html: layout({ preheader: `${data.eventName} · ${only?.dateText ?? ''}`, heading: data.isRsvpConfirmation ? "You're on the guest list." : "You're invited.", body }) };
}

export function rsvpDeclinedEmail(data: { guestName: string; celebrantName: string; eventName: string }): RenderedEmail {
  const body = paragraph(
    `Dear ${escapeHtml(data.guestName)}, thank you for letting us know. You will be missed at the celebration for <strong>${escapeHtml(data.celebrantName)}</strong>. If your plans change, you can RSVP again from the website.`,
  );
  return {
    subject: `Thank you for your reply — ${data.eventName}`,
    text: `Dear ${data.guestName}, thank you for letting us know. You will be missed. If your plans change, you can RSVP again from the website.`,
    html: layout({ preheader: 'Thank you for your reply', heading: 'Thank you for letting us know.', body }),
  };
}

export function passwordResetEmail(data: { name: string; resetUrl: string; minutes: number }): RenderedEmail {
  const body = `${paragraph(`Hello ${escapeHtml(data.name)}, we received a request to reset the password for your admin account.`)}
  ${button(data.resetUrl, 'Choose a new password')}
  ${paragraph(`<span style="color:${MUTED};font-size:13px">This link works once and expires in ${data.minutes} minutes. If you did not ask for this, ignore this email; your password stays the same.</span>`)}`;
  return {
    subject: 'Reset your admin password',
    text: `Hello ${data.name}, reset your password here (valid ${data.minutes} minutes, one use): ${data.resetUrl}\nIf you did not ask for this, ignore this email.`,
    html: layout({ preheader: 'Reset your admin password', heading: 'Reset your password', body, footer: 'Sent because a password reset was requested for this admin account.' }),
  };
}

export function testimonialReceivedEmail(data: { authorName: string; celebrantName: string }): RenderedEmail {
  const body = paragraph(
    `Dear ${escapeHtml(data.authorName)}, thank you for your beautiful message for <strong>${escapeHtml(data.celebrantName)}</strong>. The family reviews every message before it appears on the website.`,
  );
  return {
    subject: 'Thank you for your birthday message',
    text: `Dear ${data.authorName}, thank you for your message for ${data.celebrantName}. The family reviews every message before it appears on the website.`,
    html: layout({ preheader: 'We received your message', heading: 'Thank you for your message.', body }),
  };
}

export function adminNotificationEmail(data: { title: string; lines: string[]; url: string }): RenderedEmail {
  const body = `${data.lines.map((line) => paragraph(escapeHtml(line))).join('')}${button(data.url, 'Open the dashboard')}`;
  return {
    subject: data.title,
    text: `${data.lines.join('\n')}\n${data.url}`,
    html: layout({ preheader: data.title, heading: data.title, body, footer: 'Admin notification from the celebration website.' }),
  };
}
