#!/usr/bin/env node
/** Build Zoho Leads CSV from a queue JSON file. */
import fs from 'node:fs';

const inFile = process.argv[2];
const outFile = process.argv[3] || 'exports/zoho-leads.csv';
if (!inFile) {
  console.error('Usage: node scripts/export-zoho-csv.mjs queues/dayN.json [out.csv]');
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const leads = data.leads || data;
const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const rows = [['Company','First Name','Last Name','Email','Phone','Website','City','Lead Source','Lead Status','Description']];
for (const lead of leads) {
  const name = (lead.name || '').trim();
  const parts = name ? name.split(/\s+/) : [];
  let first = '', last = lead.company;
  if (parts.length >= 2) { first = parts.slice(0, -1).join(' '); last = parts.at(-1); }
  else if (parts.length === 1) { first = parts[0]; last = lead.company; }
  const desc = [
    'Partner outreach prospect — Salt Lake City area',
    `Company: ${lead.company}`,
    `City/area: ${lead.city || ''}`,
    `Recommended channel: ${lead.channel || ''}`,
    `Website: ${lead.website || ''}`,
    '', 'Outreach notes:', lead.notes || '',
  ].join('\n');
  rows.push([lead.company, first, last, lead.email || '', lead.phone || '', lead.website || '', lead.city || '', 'Partner Outreach', 'Not Contacted', desc].map(esc));
}
fs.mkdirSync(outFile.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(outFile, rows.map((r) => r.join(',')).join('\n') + '\n');
console.log(`Wrote ${leads.length} leads → ${outFile}`);
