#!/usr/bin/env node
/** Build a one-click dial sheet HTML from a queue JSON file. */
import fs from 'node:fs';

const inFile = process.argv[2];
const outFile = process.argv[3];
if (!inFile || !outFile) {
  console.error('Usage: node scripts/build-dial-sheet.mjs queues/dayN.json exports/dayN-dial-sheet.html');
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const day = data.day ?? '';
const leads = data.leads || [];

const SMS =
  "Hi — not a service request. I'm with Saratoga Mattresses (SLC showroom). Looking for the owner/office manager about a simple local referral partnership: your customers get a mattress discount code, you earn 10% when they buy. Who's best for that?";
const PHONE =
  "Hi, this is Elijah with Saratoga Mattresses on 300 West. Quick partnership ask — not a sales call for a job. We give local home-service partners a discount-code flyer. Their customers get 10% off a mattress in our showroom; the partner earns 10% of that discounted subtotal. No inventory on your side. Is the owner or office manager available for 2 minutes, or should I email a one-pager?";
const EMAIL_SUBJECT = 'Local referral partnership — Saratoga Mattresses (10% partner earn)';

function firstName(lead) {
  const n = (lead.name || '').trim();
  if (!n) return '';
  return n.split(/\s+/)[0];
}

function emailBody(lead) {
  const who = firstName(lead) || 'team';
  return `Hi ${who},

I'm Elijah with Saratoga Mattresses (showroom at 3510 S 300 W, Salt Lake City). We run a simple partner program for local home-service and design businesses whose teams are already in customers' homes.

How it works:
• You get a unique discount code + printable flyers
• Your customer gets 10% off a qualifying mattress in our showroom
• You earn 10% of the mattress subtotal after that discount (not tax/delivery)
• Track earnings at partner.saratogamattresses.com

Would you be open to a 10-minute call this week, or should I drop a sample flyer by your office?

Thanks,
Elijah Cannon
Saratoga Mattresses
801-643-1098 · contact@saratogamattresses.com
https://partner.saratogamattresses.com/`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function phoneHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const e164 = digits.length === 10 ? `+1${digits}` : digits.startsWith('1') ? `+${digits}` : `+${digits}`;
  return e164;
}

function timingClass(lead) {
  const t = (lead.timing || lead.when || '').toLowerCase();
  if (t.includes('tonight') || t.includes('now') || lead.channel === 'text' || lead.channel === 'sms') return 'tonight';
  if (t.includes('friday') || lead.channel === 'phone') return 'later';
  return 'tonight';
}

function actionButtons(lead) {
  const channel = (lead.channel || 'phone').toLowerCase();
  const tel = phoneHref(lead.phone);
  const bits = [];
  if (channel === 'text' || channel === 'sms') {
    if (tel) {
      const body = encodeURIComponent(lead.opener || SMS);
      bits.push(`<a class="btn" href="sms:${tel}?body=${body}">Open SMS draft</a>`);
    }
  } else if (channel === 'email') {
    if (lead.email) {
      const sub = encodeURIComponent(EMAIL_SUBJECT);
      const body = encodeURIComponent(lead.opener || emailBody(lead));
      bits.push(`<a class="btn" href="mailto:${encodeURIComponent(lead.email)}?subject=${sub}&body=${body}">Open email draft</a>`);
    }
    if (tel) bits.push(`<a class="btn secondary" href="tel:${tel}">Call backup</a>`);
  } else {
    if (tel) bits.push(`<a class="btn" href="tel:${tel}">Call</a>`);
    if (lead.email) {
      const sub = encodeURIComponent(EMAIL_SUBJECT);
      const body = encodeURIComponent(emailBody(lead));
      bits.push(`<a class="btn secondary" href="mailto:${encodeURIComponent(lead.email)}?subject=${sub}&body=${body}">Email backup</a>`);
    }
  }
  return bits.join(' ') || '<span class="meta">No contact link</span>';
}

function openerText(lead) {
  const channel = (lead.channel || 'phone').toLowerCase();
  if (lead.opener) return lead.opener;
  if (channel === 'text' || channel === 'sms') return SMS;
  if (channel === 'email') return emailBody(lead);
  const ask = lead.notes && /ask for/i.test(lead.notes) ? ` (${lead.notes.match(/Ask for[^.]*/i)?.[0] || lead.notes})` : '';
  return PHONE + ask;
}

const sorted = [...leads].sort((a, b) => {
  const rank = (l) => {
    const c = (l.channel || '').toLowerCase();
    if (c === 'text' || c === 'sms') return 0;
    if (c === 'email') return 1;
    return 2;
  };
  return rank(a) - rank(b);
});

const cards = sorted
  .map((lead) => {
    const cls = timingClass(lead);
    const channel = lead.channel || '';
    const status = lead.status || 'ready';
    return `<div class="card ${cls}"><h2>${esc(lead.company)}</h2>
<div class="meta">${esc(status)} · ${esc(channel)} · ${esc(lead.city || '')} · ${esc(lead.phone || '')} · ${esc(lead.email || '')}</div>
${lead.notes ? `<div class="meta">${esc(lead.notes)}</div>` : ''}
<p>${actionButtons(lead)}</p>
${channel === 'email' ? `<div class="meta">Subject: ${esc(EMAIL_SUBJECT)}</div>` : ''}
<pre>${esc(openerText(lead))}</pre></div>`;
  })
  .join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Day ${esc(day)} Partner Outreach — Saratoga Mattresses</title>
<style>
body{font-family:Georgia,"Iowan Old Style",serif;max-width:920px;margin:24px auto;padding:0 16px;line-height:1.45;color:#1a1a1a;background:linear-gradient(#f7f3ea,#efe8d8)}
h1{font-size:1.5rem;font-weight:700}h2{margin:0 0 6px;font-size:1.15rem}
.card{border:1px solid #cfc6b4;border-radius:4px;padding:14px 16px;margin:12px 0;background:#fffdf8}
.meta{color:#555;font-size:.9rem;font-family:system-ui,sans-serif} pre{white-space:pre-wrap;background:#f3eee3;padding:12px;border-radius:4px;font-size:.92rem;font-family:ui-monospace,monospace}
a.btn{display:inline-block;background:#0b3d4a;color:#fff;text-decoration:none;padding:8px 14px;border-radius:4px;margin:4px 8px 4px 0;font-family:system-ui,sans-serif}
a.btn.secondary{background:#5a6b70}
.tonight{border-left:4px solid #0a7} .later{border-left:4px solid #888}
.legend{font-family:system-ui,sans-serif;font-size:.9rem;color:#444}
</style></head><body>
<h1>Day ${esc(day)} Partner Outreach</h1>
<p class="legend">${sorted.length} Salt Lake Valley prospects · SMS warm-only · email when named inbox · phone default cold · Lead Source: Partner Outreach</p>
${cards}
</body></html>
`;

fs.mkdirSync(outFile.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(outFile, html);
console.log(`Wrote ${sorted.length} cards → ${outFile}`);
