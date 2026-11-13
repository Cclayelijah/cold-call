#!/usr/bin/env node
/**
 * Upsert Partner Outreach leads to Zoho CRM using env:
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
 *   optional ZOHO_ACCOUNTS_URL (default https://accounts.zoho.com)
 * Usage: node scripts/zoho-partner-upsert.mjs /path/to/payload.json
 */
import fs from 'node:fs';

const accounts = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
const clientId = process.env.ZOHO_CLIENT_ID;
const clientSecret = process.env.ZOHO_CLIENT_SECRET;
const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
const file = process.argv[2];

if (!clientId || !clientSecret || !refreshToken) {
  console.error('Missing ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN');
  process.exit(2);
}
if (!file) {
  console.error('Usage: node scripts/zoho-partner-upsert.mjs payload.json');
  process.exit(2);
}

const input = JSON.parse(fs.readFileSync(file, 'utf8'));
const leads = input.leads;
if (!Array.isArray(leads) || leads.length === 0 || leads.length > 10) {
  console.error('payload.leads must be 1–10 items');
  process.exit(2);
}

function cut(s, n) {
  return String(s || '').slice(0, n);
}

function partnerPayload(lead) {
  const company = cut(lead.company, 200).trim();
  const name = cut(lead.name, 100).trim();
  const phone = cut(lead.phone, 30).trim();
  const email = cut(lead.email, 254).trim();
  const website = cut(lead.website, 255).trim();
  const city = cut(lead.city || 'Salt Lake City area', 100).trim();
  const channel = cut(lead.channel, 20).trim().toLowerCase();
  const notes = cut(lead.notes, 4000).trim();
  if (!company) throw new Error('company required');
  if (!email && !phone) throw new Error('email or phone required');

  let lastName = company;
  let firstName = '';
  if (name) {
    const parts = name.split(/\s+/);
    lastName = parts.pop() || company;
    firstName = parts.join(' ').trim();
  }
  const details = [
    'Partner outreach prospect — Salt Lake City area',
    `Company: ${company}`,
  ];
  if (city) details.push(`City/area: ${city}`);
  if (channel) details.push(`Recommended channel: ${channel}`);
  if (website) details.push(`Website: ${website}`);
  if (notes) details.push('', 'Outreach notes:', notes);

  const record = {
    Last_Name: cut(lastName, 80),
    Company: company,
    Lead_Source: 'Partner Outreach',
    Lead_Status: 'Not Contacted',
    Description: cut(details.join('\n'), 32000),
  };
  if (firstName) record.First_Name = cut(firstName, 40);
  if (email) record.Email = email;
  if (phone) record.Phone = phone;
  if (website) record.Website = website;
  if (city) record.City = city;

  return {
    data: [record],
    duplicate_check_fields: email ? ['Email'] : ['Phone'],
  };
}

const tokenRes = await fetch(`${accounts}/oauth/v2/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  }),
});
const tokenBody = await tokenRes.json();
if (!tokenRes.ok || !tokenBody.access_token) {
  console.error('OAuth refresh failed', tokenRes.status, tokenBody);
  process.exit(1);
}
const apiDomain = tokenBody.api_domain;
const results = [];
for (const [index, lead] of leads.entries()) {
  try {
    const payload = partnerPayload(lead);
    const res = await fetch(`${apiDomain}/crm/v8/Leads/upsert`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${tokenBody.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    const row = body?.data?.[0];
    const ok = [200, 201, 202, 207].includes(res.status) && row?.code === 'SUCCESS';
    results.push({
      index,
      ok,
      company: lead.company,
      action: row?.action,
      zoho_id: row?.details?.id,
      error: ok ? undefined : row?.code || `HTTP ${res.status}`,
    });
  } catch (e) {
    results.push({ index, ok: false, company: lead.company, error: String(e.message || e) });
  }
}
const saved = results.filter((r) => r.ok).length;
console.log(JSON.stringify({ ok: saved === leads.length, saved, total: leads.length, results }, null, 2));
process.exit(saved === leads.length ? 0 : 1);
