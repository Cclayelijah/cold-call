# Saratoga Mattresses — Partner outreach (cold call)

Daily system to recruit Salt Lake Valley partner businesses for the Saratoga Mattresses referral program (customer 10% off via partner code; partner earns 10% of discounted mattress subtotal).

## Daily loop

1. **Find 10 ICP businesses** (water, plumbing, HVAC, cleaning, design, remodel) in Salt Lake County + north Utah County. Skip Day 1/2 companies already in `queues/`.
2. **Enrich** phone + email; prefer phone for cold B2B; email when named inbox exists; SMS only on warm threads.
3. **Save** the queue under `queues/dayN.json` (see Day 1/2 for shape).
4. **Export** Zoho CSV: `npm run csv:day1` (or `export-zoho-csv.mjs`).
5. **Upload to Zoho** one of:
   - Import CSV in Zoho CRM → Leads (Lead Source must include picklist value `Partner Outreach`)
   - `npm run upsert:day1` with `.env` Zoho OAuth filled in
   - Hostinger `POST /api/partner-outreach.php` or Apps Script web app from [saratogamattresses#19](https://github.com/Cclayelijah/saratogamattresses/pull/19)
6. **Start conversations** from `exports/dayN-dial-sheet.html` (mailto / sms / tel + scripts).
7. Log outcomes (replied / meeting / not interested) back into the queue JSON `status` field when you add one.

## Channel rules

| Channel | When |
| --- | --- |
| Phone | Default cold outreach |
| Email | Named inbox / design contacts |
| SMS | Warm threads only (e.g. business already texted you) |

## ICP

Techs or advisors already in homes: water treatment, plumbing, HVAC, cleaning, movers, realtors, interior designers, remodelers. Geography: Bluffdale, Herriman, Riverton, South Jordan, Draper, Sandy, West Jordan, Saratoga Springs, Lehi, Salt Lake City.

## Zoho upload via GitHub Actions

> **Note:** `workflow_dispatch` only appears after this PR is merged to `main`. Until then use CSV import, Apps Script, or local `npm run upsert:dayN` with `.env`.

1. In this repo: **Settings → Secrets and variables → Actions**
2. Add `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` (same Self Client as the website / Apps Script)
3. Ensure Zoho Lead Source picklist includes **Partner Outreach**
4. **Actions → Zoho Partner Outreach upsert → Run workflow → day 1**

This uploads CRM leads without Hostinger deploy or Cursor environment secrets.

## Zoho field mapping

- `Lead_Source` = `Partner Outreach` (add picklist value once)
- `Lead_Status` = `Not Contacted`
- Duplicate check: Email if present, else Phone
- No automated prospect emails from this repo

## Current queues

- Day 1–3 under `queues/` with matching `exports/*-dial-sheet.html` and Zoho CSVs
- Regenerate dial sheets: `npm run sheet:day1` (etc.)
- Apps Script CRM unblock (uses existing Calendar→Zoho OAuth): see `docs/PARTNER_OUTREACH_APPS_SCRIPT.md` and `docs/PartnerOutreach.gs`

## Related

- Partner portal: https://partner.saratogamattresses.com/
- Website + CRM: https://github.com/Cclayelijah/saratogamattresses
