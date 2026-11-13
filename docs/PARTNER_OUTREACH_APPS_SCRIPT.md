# Partner Outreach → Zoho via Apps Script

Unblocks Salt Lake City partner-program CRM uploads **without** Hostinger `.saratoga-outreach.php` or `/api/partner-outreach.php`. Reuses the **existing** Calendar → Zoho Apps Script project and its `ZOHO_*` Script Properties.

CRM upload only. Never sends prospect or customer email. Does not set Zoho workflow triggers (website-lead automations stay quiet).

## Prerequisites

1. The Calendar → Zoho Apps Script project already works (`Code.gs` + `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN`).
2. Zoho Lead Source picklist includes **`Partner Outreach`** (exact spelling) — same requirement as the Hostinger API path. See `docs/partner-outreach-zoho.md`.
3. OAuth scopes already include Leads WRITE (same as calendar sync). Upsert also needs create/update on Leads; if Zoho returns `INVALID_OAUTHSCOPE`, reauthorize with Leads WRITE.

## One-time setup (Elijah)

Do **not** create a new Apps Script project. Use the existing Calendar → Zoho project so OAuth stays shared.

### 1. Add the script file

1. Open the existing project at [script.google.com](https://script.google.com).
2. Add a new script file named **`PartnerOutreach`** (Apps Script adds `.gs`).
3. Paste the repository file `scripts/calendar-zoho-sync/PartnerOutreach.gs`.
4. Save. Leave `Code.gs`, calendar triggers, and existing Script Properties unchanged.

### 2. Set `OUTREACH_SECRET`

**Project Settings → Script Properties → Add script property:**

| Key | Value |
| --- | --- |
| `OUTREACH_SECRET` | A long random secret (generate locally; do not commit or paste into chat/GitHub) |

Keep this secret private. Callers put it in the JSON body field `secret` (not in the web app URL).

### 3. Deploy as a web app

1. **Deploy → New deployment**
2. Type: **Web app**
3. Description: e.g. `Partner outreach Zoho upsert`
4. **Execute as:** Me (your Google account that owns the Zoho OAuth)
5. **Who has access:** Anyone  
   (“Anyone” only makes the URL reachable; every request still requires a matching `OUTREACH_SECRET`. Do not use “Anyone” without a strong secret.)
6. Deploy and copy the **Web app URL** (ends with `/exec`).
7. Authorize when prompted (first deploy).

After code changes to `PartnerOutreach.gs`, create a **New version** of the same deployment (or a new deployment) so `/exec` picks up the update.

### 4. Smoke test with curl

Replace `WEB_APP_URL` and `YOUR_OUTREACH_SECRET` (never commit real values):

```bash
curl -sS -X POST 'WEB_APP_URL' \
  -H 'Content-Type: application/json' \
  -d '{
    "secret": "YOUR_OUTREACH_SECRET",
    "leads": [
      {
        "company": "Wasatch Water Softeners",
        "name": "Jordan Lee",
        "phone": "801-555-0142",
        "email": "jordan@wasatchwatersoft.test",
        "website": "https://wasatchwatersoft.test",
        "city": "West Jordan",
        "channel": "phone",
        "notes": "Offer mattress referral partnership for home remodel customers."
      }
    ]
  }'
```

Expected success shape (Apps Script also echoes `http_status` because ContentService cannot set real HTTP codes):

```json
{
  "http_status": 200,
  "ok": true,
  "saved": 1,
  "total": 1,
  "results": [
    {
      "index": 0,
      "ok": true,
      "action": "insert",
      "zoho_id": "7689498000000…",
      "company": "Wasatch Water Softeners"
    }
  ]
}
```

Unauthorized / missing secret → `http_status: 401`, `"error": "Unauthorized"`.

### 5. Optional editor test

In the Apps Script editor you can run `upsertPartnerOutreachLeads` from another scratch function that passes the same JSON object (including `secret`). Prefer curl against the deployed web app for a realistic check.

## API contract

| Item | Value |
| --- | --- |
| Entry (web app) | `doPost` |
| Entry (editor) | `upsertPartnerOutreachLeads` |
| Auth field | `secret` (JSON body) — must equal Script Property `OUTREACH_SECRET` |
| Batch max | 10 leads |
| Lead fields | Same spirit as Hostinger API: `company` (required), `email` **or** `phone`, optional `name`, `website`, `city`, `channel` (`phone`/`email`/`text`), `notes` |
| Zoho mapping | `Lead_Source = Partner Outreach`, `Lead_Status = Not Contacted`, Description notes; duplicate check Email then Phone |
| Email | Never sent |
| Workflows | No Zoho `trigger` key (website-lead workflows should not fire) |

## Relation to Hostinger API

| Path | When to use |
| --- | --- |
| Apps Script web app (this doc) | Production Hostinger endpoint still 404 / secret file hard to create |
| `POST /api/partner-outreach.php` | Preferred long-term once `.saratoga-outreach.php` exists above `public_html` |

Both paths share the same Zoho field mapping and safety rules. Either path still requires the **Partner Outreach** Lead Source picklist value in Zoho UI.

## Safety

- Do not put `OUTREACH_SECRET`, Zoho tokens, or web app URLs with embedded secrets in git.
- Do not wire this endpoint to SMTP or any outbound prospect messaging.
- Rotate `OUTREACH_SECRET` if it leaks; redeploy is not required for a property change.
- Keep daily volume ≤ 10 prospects unless Zoho and ops capacity are reviewed.

## Offline tests

```bash
node --test scripts/calendar-zoho-sync/tests/partner-outreach.test.cjs
```

These tests mock Zoho and Script Properties; they do not deploy or authorize the live web app.
