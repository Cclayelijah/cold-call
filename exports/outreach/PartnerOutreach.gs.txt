/**
 * Saratoga Mattresses — Partner Outreach Zoho lead upsert (Apps Script path).
 * Add as an ADDITIONAL file in the EXISTING Calendar -> Zoho Apps Script project.
 * Reuses Code.gs helpers: smZohoRequest_, smZohoFail_, smZohoToken_ (ZOHO_* Script Properties).
 *
 * Purpose: unblock CRM uploads when Hostinger /api/partner-outreach.php is unavailable
 * (e.g. missing .saratoga-outreach.php). CRM upload only — never sends prospect email.
 *
 * Auth: Script Property OUTREACH_SECRET must match JSON body field "secret".
 * Deploy: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * Callers must still know OUTREACH_SECRET; "Anyone" only means the URL is reachable.
 *
 * Public entry points: doPost (web app), upsertPartnerOutreachLeads (manual/test with secret).
 */
var SM_PARTNER_MAX_BATCH = 10;
var SM_PARTNER_MAX_BODY = 50000;
var SM_PARTNER_ALLOWED_CHANNELS = ['phone', 'email', 'text'];

/**
 * Web app POST handler. Body JSON:
 *   { "secret": "<OUTREACH_SECRET>", "leads": [ { company, name?, email?, phone?, ... } ] }
 * Returns ContentService JSON (ok / saved / total / results).
 */
function doPost(e) {
  try {
    var input = smPartnerParseInput_(e);
    if (input.error) {
      return smPartnerJsonResponse_({ok: false, error: input.error}, input.http || 422);
    }
    var result = smPartnerProcessUpsert_(input.body);
    return smPartnerJsonResponse_(result.body, result.http);
  } catch (err) {
    console.log('Partner outreach doPost failed: ' + String(err && err.message ? err.message : err).slice(0, 120));
    return smPartnerJsonResponse_({ok: false, error: 'Server error'}, 500);
  }
}

/**
 * Accepts JSON body {secret, leads} or form fields secret + payload
 * (payload = JSON string of {leads:[...]} or the leads array).
 * Form posts enable a browser dial-sheet upload page without CORS issues.
 */
function smPartnerParseInput_(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  if (params && params.payload) {
    var formSecret = params.secret;
    var parsedPayload;
    try {
      parsedPayload = JSON.parse(String(params.payload));
    } catch (_) {
      return {error: 'Invalid payload JSON', http: 422};
    }
    var formBody;
    if (Array.isArray(parsedPayload)) {
      formBody = {secret: formSecret, leads: parsedPayload};
    } else if (parsedPayload && typeof parsedPayload === 'object') {
      formBody = {
        secret: formSecret || parsedPayload.secret,
        leads: parsedPayload.leads
      };
    } else {
      return {error: 'Invalid payload JSON', http: 422};
    }
    return {body: formBody};
  }

  var raw = (e && e.postData && e.postData.contents) ? String(e.postData.contents) : '';
  if (!raw || raw.length > SM_PARTNER_MAX_BODY) {
    return {error: 'Invalid request size', http: 413};
  }
  var input;
  try {
    input = JSON.parse(raw);
  } catch (_) {
    return {error: 'Invalid JSON', http: 422};
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {error: 'Invalid JSON', http: 422};
  }
  return {body: input};
}

/**
 * Manual / Apps Script editor entry: same body shape as doPost.
 * Useful for a one-off dry smoke test after setting OUTREACH_SECRET.
 */
function upsertPartnerOutreachLeads(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Provide a JSON object with secret and leads.');
  }
  var result = smPartnerProcessUpsert_(body);
  if (!result.body.ok && result.http === 401) {
    throw new Error('Unauthorized: OUTREACH_SECRET mismatch or unset.');
  }
  return result.body;
}

function smPartnerProcessUpsert_(input) {
  if (!smPartnerAuthorize_(input.secret)) {
    return {http: 401, body: {ok: false, error: 'Unauthorized'}};
  }

  var leads = input.leads;
  if (!Array.isArray(leads) || leads.length === 0) {
    return {http: 422, body: {ok: false, error: 'Provide a non-empty leads array'}};
  }
  if (leads.length > SM_PARTNER_MAX_BATCH) {
    return {
      http: 422,
      body: {ok: false, error: 'Batch limit is ' + SM_PARTNER_MAX_BATCH + ' leads per request'}
    };
  }

  var results = [];
  var okCount = 0;
  for (var i = 0; i < leads.length; i++) {
    var item = leads[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      results.push({index: i, ok: false, error: 'Lead must be an object'});
      continue;
    }
    var validated = smPartnerValidateLead_(item);
    if (validated.error) {
      results.push({index: i, ok: false, error: validated.error});
      continue;
    }
    try {
      var payload = smPartnerLeadPayload_(validated.lead);
      var upserted = smPartnerUpsertLead_(payload);
      results.push({
        index: i,
        ok: true,
        action: upserted.action,
        zoho_id: upserted.zoho_id,
        company: validated.lead.company
      });
      okCount++;
    } catch (err) {
      console.log('Partner outreach Zoho upsert failed at index ' + i + ': ' +
        String(err && err.message ? err.message : err).slice(0, 80));
      results.push({index: i, ok: false, error: 'CRM upsert failed'});
    }
  }

  var allOk = okCount === leads.length;
  return {
    http: allOk ? 200 : 207,
    body: {
      ok: allOk,
      saved: okCount,
      total: leads.length,
      results: results
    }
  };
}

function smPartnerAuthorize_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty('OUTREACH_SECRET');
  if (!expected || typeof provided !== 'string' || provided === '') return false;
  // Constant-time-ish compare for Apps Script (no native timingSafeEqual).
  if (expected.length !== provided.length) return false;
  var mismatch = 0;
  for (var i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

function smPartnerCleanLine_(value, max) {
  var s = String(value == null ? '' : value);
  s = s.replace(/[\r\n\t\x00-\x1F\x7F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
}

function smPartnerCleanNotes_(value, max) {
  var s = String(value == null ? '' : value);
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/g, '');
  s = s.trim();
  return s.length > max ? s.slice(0, max) : s;
}

function smPartnerValidEmail_(email) {
  // Practical check aligned with the Hostinger API path (not full RFC).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function smPartnerValidateLead_(item) {
  var company = smPartnerCleanLine_(item.company, 200);
  var name = smPartnerCleanLine_(item.name, 100);
  var phone = smPartnerCleanLine_(item.phone, 30);
  var email = smPartnerCleanLine_(item.email, 254);
  var website = smPartnerCleanLine_(item.website, 255);
  var city = smPartnerCleanLine_(item.city, 100);
  var channel = smPartnerCleanLine_(item.channel, 20).toLowerCase();
  var notes = smPartnerCleanNotes_(item.notes, 4000);

  var errors = [];
  if (company === '') errors.push('company is required');
  if (email === '' && phone === '') errors.push('email or phone is required');
  if (email !== '' && !smPartnerValidEmail_(email)) errors.push('email is invalid');
  if (phone !== '' && !/^[\d\s().+-]{7,30}$/.test(phone)) errors.push('phone is invalid');
  if (website !== '' && !/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(website)) {
    errors.push('website is invalid');
  }
  if (channel !== '' && SM_PARTNER_ALLOWED_CHANNELS.indexOf(channel) === -1) {
    errors.push('channel must be phone, email, or text');
  }
  if (errors.length) return {error: errors.join('; ')};

  return {
    lead: {
      company: company,
      name: name,
      phone: phone,
      email: email,
      website: website,
      city: city !== '' ? city : 'Salt Lake City area',
      channel: channel,
      notes: notes
    }
  };
}

/**
 * Mirrors public/api/zoho-leads.php sm_zoho_partner_lead_payload.
 * Omits Zoho "trigger" entirely so website-lead workflows do not fire.
 */
function smPartnerLeadPayload_(lead) {
  var company = lead.company;
  var name = lead.name;
  var phone = lead.phone;
  var email = lead.email;
  var website = lead.website;
  var city = lead.city;
  var channel = lead.channel;
  var notes = lead.notes;

  var lastName;
  var firstName = '';
  if (name !== '') {
    var parts = name.split(/\s+/);
    lastName = parts.pop() || company;
    firstName = parts.join(' ').trim();
  } else {
    lastName = company;
  }

  var details = [
    'Partner outreach prospect — Salt Lake City area',
    'Company: ' + company
  ];
  if (city !== '') details.push('City/area: ' + city);
  if (channel !== '') details.push('Recommended channel: ' + channel);
  if (website !== '') details.push('Website: ' + website);
  if (notes !== '') {
    details.push('');
    details.push('Outreach notes:');
    details.push(notes);
  }

  var description = details.join('\n');
  if (description.length > 32000) description = description.slice(0, 32000);

  var record = {
    Last_Name: lastName.length > 80 ? lastName.slice(0, 80) : lastName,
    Company: company.length > 200 ? company.slice(0, 200) : company,
    Lead_Source: 'Partner Outreach',
    Lead_Status: 'Not Contacted',
    Description: description
  };
  if (firstName !== '') {
    record.First_Name = firstName.length > 40 ? firstName.slice(0, 40) : firstName;
  }
  if (email !== '') record.Email = email;
  if (phone !== '') record.Phone = phone;
  if (website !== '') {
    record.Website = website.length > 255 ? website.slice(0, 255) : website;
  }
  if (city !== '') {
    record.City = city.length > 100 ? city.slice(0, 100) : city;
  }

  return {
    data: [record],
    duplicate_check_fields: email !== '' ? ['Email'] : ['Phone']
    // Intentionally no "trigger" key — do not fire website-lead workflows.
  };
}

function smPartnerUpsertLead_(apiPayload) {
  var result = smZohoRequest_('POST', '/crm/v8/Leads/upsert', apiPayload);
  if ([200, 201, 202, 207].indexOf(result.http) === -1 ||
      !result.body.data || !result.body.data[0] ||
      result.body.data[0].code !== 'SUCCESS') {
    smZohoFail_(result, 'partner-upsert');
  }
  var row = result.body.data[0];
  var details = row.details || {};
  return {
    action: String(row.action || 'upsert'),
    zoho_id: details.id ? String(details.id) : null
  };
}

/**
 * Apps Script web apps cannot set real HTTP status codes on ContentService
 * responses. We still track intended status for upsertPartnerOutreachLeads /
 * tests, and embed http_status in the JSON body for the caller.
 */
function smPartnerJsonResponse_(body, httpStatus) {
  var out = Object.assign({http_status: httpStatus || 200}, body);
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
