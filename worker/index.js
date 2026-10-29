// MyEiruv Proxy Worker - FINAL
const ALLOWED = ['https://myeiruv.org','https://www.myeiruv.org'];

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin')||'';
    const allow = ALLOWED.includes(origin) ? origin : null;

    if (req.method === 'OPTIONS') return new Response(null, {status:204, headers:{
      'Access-Control-Allow-Origin': allow||ALLOWED[0],
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Action',
      'Vary':'Origin'
    }});

    if (req.method !== 'POST') return json({error:'method not allowed'},405,allow);
    if (!allow) return json({error:'forbidden'},403,ALLOWED[0]);

    let body; try{body=await req.json();}catch{return json({error:'bad json'},400,allow);}
    const action = req.headers.get('X-Action')||'anthropic';

    if (action === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST', headers:{'Content-Type':'application/json','x-api-key':env.ANTHROPIC_KEY,'anthropic-version':'2023-06-01'},
        body:JSON.stringify(body)
      });
      return cors(await res.text(), res.status, allow);
    }

    if (action === 'mapbox-directions') {
      const {pts} = body;
      const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${pts}?overview=full&geometries=geojson&steps=true&alternatives=true&access_token=${env.MAPBOX_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      // If only 1 route returned (waypoint suppresses alternatives), try without waypoint too
      return cors(JSON.stringify(data), res.status, allow);
    }

    if (action === 'kml-proxy') {
      // Fetch KML from Google My Maps — browser can't do this due to CORS.
      // Google often returns a KMZ (zip) even with forcekml=1, so unzip if needed.
      const { mid } = body;
      if (!mid) return json({error:'mid required'},400,allow);
      try {
        const kml = await fetchKmlByMid(mid);
        return cors(JSON.stringify({kml}), 200, allow);
      } catch(e) {
        return json({error:e.message},502,allow);
      }
    }

    if (action === 'places-shuls') {
      // Shul landmarks: try Google Places, then Foursquare, else error (client falls back to OSM)
      const { lat, lng, radius } = body;
      if (!lat || !lng) return json({error:'lat/lng required'},400,allow);
      const rad = Math.min(radius||4000,10000);

      // Foursquare (set FSQ_KEY in worker env; category 4bf58dd8d48988d139941735 = Synagogue)
      if (env.FSQ_KEY) {
        try {
          const fUrl = `https://api.foursquare.com/v3/places/search?ll=${lat},${lng}&radius=${rad}&categories=4bf58dd8d48988d139941735&limit=50`;
          const fRes = await fetch(fUrl, {headers:{'Authorization': env.FSQ_KEY, 'Accept':'application/json'}});
          const fData = await fRes.json();
          const shuls = (fData.results||[]).map(p => ({
            id: 'fsq-'+p.fsq_id, name: p.name,
            lat: p.geocodes?.main?.latitude, lng: p.geocodes?.main?.longitude,
            address: (p.location&&p.location.formatted_address)||''
          })).filter(s => s.lat && s.lng);
          if (shuls.length) return cors(JSON.stringify({shuls, src:'foursquare'}), 200, allow);
        } catch(e) {}
      }

      return json({error:'no landmark source available'},502,allow);
    }

    if (action === 'google-routes') {
      const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{
        method:'POST', headers:{
          'Content-Type':'application/json',
          'X-Goog-Api-Key': env.GOOGLE_ROUTES_KEY,
          'X-Goog-FieldMask': 'routes.polyline,routes.distanceMeters,routes.duration,routes.legs.steps,routes.routeLabels'
        },
        body:JSON.stringify(body)
      });
      return cors(await res.text(), res.status, allow);
    }

    if (action === 'brevo-send') {
      const {to,toName,eruvName,eruvCity,status,note,donateUrl,timestamp} = body;
      const sl = {up:'✅ Up & Kosher',review:'⚠️ Under Review',down:'❌ Down'};
      const sc = {up:'#16a05a',review:'#d97706',down:'#d03030'};
      const db = donateUrl?`<p><a href="${donateUrl}" style="background:#c8923a;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-weight:600">❤️ Support This Eruv</a></p>`:'';
      const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f6fb;margin:0"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden"><div style="background:linear-gradient(135deg,#0a1628,#1a3055);padding:28px 32px"><div style="color:#fff;font-size:22px;font-weight:700">MyEiruv</div><div style="color:rgba(255,255,255,.6);font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Eiruv Status Alert</div></div><div style="padding:28px 32px"><h2 style="color:#0f1f38;margin:0 0 4px">${eruvName}</h2><p style="color:#6b7a99;font-size:14px;margin:0 0 20px">${eruvCity||''}</p><div style="background:#f4f6fb;border-radius:10px;padding:18px 20px;border-left:4px solid ${sc[status]||'#666'}"><div style="font-size:18px;font-weight:700;color:${sc[status]||'#666'}">${sl[status]||status}</div>${note?`<p style="color:#444;font-size:14px;margin:8px 0 0;white-space:pre-line">${note}</p>`:''}</div>${timestamp?`<p style="color:#a8b4cc;font-size:12px;margin-top:12px">Updated: ${timestamp}</p>`:''}${db}<div style="margin-top:24px;padding-top:18px;border-top:1px solid #e2e7f0"><a href="https://myeiruv.org" style="color:#2563b0;font-size:13px;text-decoration:none">View on MyEiruv →</a></div></div></div></body></html>`;
      const res = await fetch('https://api.brevo.com/v3/smtp/email',{
        method:'POST', headers:{'Content-Type':'application/json','api-key':env.BREVO_KEY},
        body:JSON.stringify({sender:{name:'MyEiruv',email:'noreply@myeiruv.org'},to:[{email:to,name:toName||to}],subject:`${eruvName} — ${sl[status]||status}`,htmlContent:html})
      });
      return cors(await res.text(), res.status, allow);
    }

    if (action === 'user-message') {
      const {to, fromName, fromEmail, fromPhone, eruvName, message} = body;
      const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f6fb;margin:0">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden">
<div style="background:linear-gradient(135deg,#0a1628,#1a3055);padding:24px 32px">
  <div style="color:#fff;font-size:20px;font-weight:700">MyEiruv</div>
  <div style="color:rgba(255,255,255,.6);font-size:12px;letter-spacing:2px;margin-top:4px">NEW MESSAGE FROM USER</div>
</div>
<div style="padding:28px 32px">
  <div style="background:#e8f4fd;border-radius:10px;padding:16px 20px;margin-bottom:20px;border-left:4px solid #2563b0">
    <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">👤 Sender Details</div>
    <div style="font-size:14px;color:#1e3a5f;margin-bottom:4px;"><strong>Name:</strong> ${fromName}</div>
    <div style="font-size:14px;color:#1e3a5f;margin-bottom:4px;"><strong>Email:</strong> <a href="mailto:${fromEmail}" style="color:#2563b0;">${fromEmail}</a></div>
    ${fromPhone ? `<div style="font-size:14px;color:#1e3a5f;"><strong>Phone:</strong> ${fromPhone}</div>` : ''}
  </div>
  <div style="font-size:13px;color:#6b7a99;margin-bottom:8px;">Re: <strong>${eruvName}</strong></div>
  <div style="background:#f4f6fb;border-radius:10px;padding:16px 20px;">
    <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">💬 Message</div>
    <div style="font-size:14px;color:#333;line-height:1.6;">${message}</div>
  </div>
  <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e7f0">
    <a href="mailto:${fromEmail}?subject=Re: ${encodeURIComponent(eruvName)}" style="display:inline-block;background:#1a3055;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">↩ Reply to ${fromName}</a>
  </div>
</div></div></body></html>`;
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method:'POST', headers:{'Content-Type':'application/json','api-key':env.BREVO_KEY},
        body:JSON.stringify({
          sender:{name:'MyEiruv',email:'noreply@myeiruv.org'},
          to:[{email:to}],
          subject:`New message from ${fromName} re: ${eruvName}`,
          htmlContent:html
        })
      });
      return cors(await res.text(), res.status, allow);
    }

    if (action === 'twilio-sms') {
      const {to,message} = body;
      let phone = to.replace(/\D/g,'');
      if(phone.length===10) phone='+1'+phone;
      else if(!phone.startsWith('+')) phone='+'+phone;
      const creds = btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`);
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`,{
        method:'POST', headers:{'Authorization':`Basic ${creds}`,'Content-Type':'application/x-www-form-urlencoded'},
        body:`From=${encodeURIComponent(env.TWILIO_FROM)}&To=${encodeURIComponent(phone)}&Body=${encodeURIComponent(message)}`
      });
      return cors(await res.text(), res.status, allow);
    }

    if (action === 'brevo-sms') {
      // Uses the same BREVO_KEY as email — no separate account needed.
      // Requires: Brevo dashboard > Transactional > SMS > enabled + sender name registered.
      const {to,message} = body;
      let phone = to.replace(/\D/g,'');
      if(phone.length===10) phone='1'+phone; // Brevo wants no leading +, country code included
      const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms',{
        method:'POST',
        headers:{'Content-Type':'application/json','api-key':env.BREVO_KEY},
        body:JSON.stringify({
          sender: env.BREVO_SMS_SENDER || 'MyEiruv',
          recipient: phone,
          content: message,
          type: 'transactional'
        })
      });
      return cors(await res.text(), res.status, allow);
    }

    return json({error:'unknown action'},400,allow);
  },

  // Cloudflare only invokes `scheduled` when it is a method on the default
  // export. Route each cron expression to its job.
  async scheduled(event, env, ctx) {
    if (event.cron === BOUNDARY_WATCH_CRON) {
      ctx.waitUntil(runBoundaryWatch(env));
    } else {
      ctx.waitUntil(runFridayAlerts(event, env, ctx));
    }
  }
};

// Must match the boundary-watch entry in wrangler.toml
const BOUNDARY_WATCH_CRON = '0 22 * * 4';

function json(obj,status,origin){return cors(JSON.stringify(obj),status,origin);}
function cors(body,status,origin){
  return new Response(body,{status:status||200,headers:{
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':origin||'https://myeiruv.org',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,X-Action',
    'Vary':'Origin'
  }});
}

/* ══════════════════════════════════════════════════════════════════════════
   KML / KMZ fetching + boundary fingerprinting
   ══════════════════════════════════════════════════════════════════════════ */

/** Fetch a Google My Maps export by map id, transparently unzipping KMZ. */
async function fetchKmlByMid(mid) {
  const url = `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}&forcekml=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyEiruv/1.0)' } });
  if (!res.ok) throw new Error(`Google returned ${res.status}`);

  const buf = await res.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));

  // 'PK\x03\x04' = zip (KMZ). Otherwise assume plain text KML.
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  const kml = isZip ? await unzipFirstKml(buf) : new TextDecoder().decode(buf);

  if (!kml.includes('<kml')) throw new Error('Not a valid KML response');
  return kml;
}

/** Minimal ZIP reader: pulls the first .kml entry out of a KMZ archive. */
async function unzipFirstKml(buf) {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let off = 0;

  while (off + 30 <= bytes.length) {
    if (view.getUint32(off, true) !== 0x04034b50) break;      // local file header sig
    const method   = view.getUint16(off + 8, true);
    const compSize = view.getUint32(off + 18, true);
    const nameLen  = view.getUint16(off + 26, true);
    const extraLen = view.getUint16(off + 28, true);
    const name     = new TextDecoder().decode(bytes.slice(off + 30, off + 30 + nameLen));
    const dataAt   = off + 30 + nameLen + extraLen;
    const data     = bytes.slice(dataAt, dataAt + compSize);

    if (name.toLowerCase().endsWith('.kml')) {
      if (method === 0) return new TextDecoder().decode(data);          // stored
      if (method === 8) {                                               // deflate
        const ds = new DecompressionStream('deflate-raw');
        const out = new Response(new Blob([data]).stream().pipeThrough(ds));
        return await out.text();
      }
      throw new Error(`Unsupported KMZ compression method ${method}`);
    }
    off = dataAt + compSize;
  }
  throw new Error('No .kml entry found inside KMZ');
}

/** Pull every coordinate pair out of a KML document. */
function kmlCoords(kml) {
  const pts = [];
  const re = /<coordinates>([\s\S]*?)<\/coordinates>/g;
  let m;
  while ((m = re.exec(kml)) !== null) {
    for (const tok of m[1].trim().split(/\s+/)) {
      const p = tok.split(',');
      if (p.length >= 2) {
        const lng = parseFloat(p[0]), lat = parseFloat(p[1]);
        if (!isNaN(lng) && !isNaN(lat)) pts.push([lng, lat]);
      }
    }
  }
  return pts;
}

/**
 * Boundary signature used to detect change.
 * Bounding box (4dp ≈ 11m) plus point count — both survive our stitching step,
 * so a signature taken from Google's raw KML is comparable to one taken from
 * the coordinates already stored in Firestore.
 */
function boundarySignature(pts) {
  if (!pts.length) return null;
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const r = n => Math.round(n * 1e4) / 1e4;
  return { n: pts.length, bbox: [r(minX), r(minY), r(maxX), r(maxY)] };
}

/** True when two signatures differ enough to be worth a human look. */
function signatureChanged(a, b) {
  if (!a || !b) return false;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(a.bbox[i] - b.bbox[i]) > 0.0002) return true;   // ~20m shift
  }
  const bigger = Math.max(a.n, b.n) || 1;
  return Math.abs(a.n - b.n) / bigger > 0.10;                    // >10% point change
}

/** Extract a Google My Maps id from any stored url field. */
function midFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/[?&]mid=([^&\s"'<>]+)/);
  return m ? m[1] : null;
}

// ── CRON: Friday eiruv status alerts ─────────────────────────────────────────
async function runFridayAlerts(event, env, ctx) {
  // Get current hour in ET (UTC-4 in summer, UTC-5 in winter)
  const now = new Date();
  const hour = now.getUTCHours() - 4; // rough EST
  
  // Load all active alerts from Firestore via REST API
  // Authenticate as the cron service account (Firebase Auth email/password)
  // Set CRON_EMAIL + CRON_PASS in worker env; the email must be listed in firestore.rules isAdmin()
  let idToken = '';
  try {
    const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_KEY}`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email: env.CRON_EMAIL, password: env.CRON_PASS, returnSecureToken: true})
    });
    const authData = await authRes.json();
    idToken = authData.idToken || '';
  } catch(e) { console.log('[Cron] auth failed:', e.message); }
  const authHdr = idToken ? {Authorization: `Bearer ${idToken}`} : {};

  const fsUrl = `https://firestore.googleapis.com/v1/projects/myer-b23f6/databases/(default)/documents/alerts?pageSize=200&key=${env.FIREBASE_KEY}`;
  const alertsRes = await fetch(fsUrl, {headers: authHdr});
  const alertsData = await alertsRes.json();
  const alerts = (alertsData.documents||[]).map(d => {
    const f = d.fields||{};
    return {
      userEmail: f.userEmail?.stringValue,
      userName: f.userName?.stringValue||'',
      userPhone: f.userPhone?.stringValue||'',
      eruvName: f.eruvName?.stringValue||f.eruv?.stringValue||'',
      city: f.city?.stringValue||'',
      fridayTime: f.fridayTime?.stringValue||'09:00',
      viaEmail: f.viaEmail?.booleanValue!==false,
      viaSms: f.viaSms?.booleanValue===true,
      active: f.active?.booleanValue!==false,
    };
  }).filter(a => a.active && a.userEmail);

  // Load zones to get current status
  const zonesRes = await fetch(`https://firestore.googleapis.com/v1/projects/myer-b23f6/databases/(default)/documents/zones?pageSize=100&key=${env.FIREBASE_KEY}`, {headers: authHdr});
  const zonesData = await zonesRes.json();
  const zones = {};
  (zonesData.documents||[]).forEach(d => {
    const f = d.fields||{};
    const id = d.name.split('/').pop();
    zones[id] = {
      name: f.name?.stringValue||id,
      status: f.status?.stringValue||'up',
      note: f.note?.stringValue||'',
      city: f.city?.stringValue||'',
    };
  });

  // Send to alerts where fridayTime matches current hour
  const currentHour = String(hour).padStart(2,'0')+':00';
  const toSend = alerts.filter(a => a.fridayTime === currentHour || (!a.fridayTime && currentHour === '09:00'));
  
  for (const alert of toSend) {
    const zone = Object.values(zones).find(z => z.name === alert.eruvName);
    if (!zone) continue;
    const sl = {up:'✅ Up & Kosher',review:'⚠️ Under Review',down:'❌ Down'};
    const sc = {up:'#16a05a',review:'#d97706',down:'#d03030'};
    if (alert.viaEmail && alert.userEmail) {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method:'POST', headers:{'Content-Type':'application/json','api-key':env.BREVO_KEY},
        body: JSON.stringify({
          sender:{name:'MyEiruv',email:'noreply@myeiruv.org'},
          to:[{email:alert.userEmail,name:alert.userName||alert.userEmail}],
          subject:`${alert.eruvName} — Shabbos Status Update`,
          htmlContent:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto"><div style="background:linear-gradient(135deg,#0a1628,#1a3055);padding:24px 32px"><h1 style="color:#fff;margin:0;font-size:20px">MyEiruv</h1><p style="color:rgba(255,255,255,.6);margin:4px 0 0;font-size:12px;letter-spacing:2px">SHABBOS STATUS UPDATE</p></div><div style="padding:28px 32px"><h2 style="margin:0 0 4px;color:#0f1f38">${alert.eruvName}</h2><p style="color:#6b7a99;margin:0 0 16px">${alert.city}</p><div style="border-left:4px solid ${sc[zone.status]||'#666'};padding:12px 16px;background:#f4f6fb;border-radius:0 8px 8px 0"><p style="margin:0;font-size:18px;font-weight:700;color:${sc[zone.status]||'#666'}">${sl[zone.status]||zone.status}</p>${zone.note?`<p style="margin:8px 0 0;color:#444;font-size:14px">${zone.note}</p>`:''}</div><p style="margin-top:16px"><a href="https://myeiruv.org" style="color:#2563b0">View on MyEiruv →</a></p><p style="font-size:11px;color:#999">Reply STOP to unsubscribe from Friday reminders.</p></div></div>`
        })
      });
    }
  }
  console.log(`[Cron] Sent ${toSend.length} Friday alerts for hour ${currentHour}`);
}


// ── CRON: weekly boundary watch — flags Google My Maps changes for review ────
async function runBoundaryWatch(env) {
  const zonesUrl = `https://firestore.googleapis.com/v1/projects/myer-b23f6/databases/(default)/documents/zones?pageSize=200&key=${env.FIREBASE_KEY}`;
  const res = await fetch(zonesUrl);                 // zones are public-read
  if (!res.ok) { console.log('[Watch] zones fetch failed', res.status); return; }
  const data = await res.json();

  const changes = [], errors = [];

  for (const doc of (data.documents || [])) {
    const f  = doc.fields || {};
    const id = doc.name.split('/').pop();
    const name = f.name?.stringValue || id;

    const mid = midFromUrl(f.embedUrl?.stringValue) || midFromUrl(f.mapsUrl?.stringValue);
    if (!mid) continue;                               // nothing to watch

    // Signature of what the site is currently showing
    const stored = (f.coords?.arrayValue?.values || []).map(v => {
      const mv = v.mapValue?.fields || {};
      return [Number(mv.g?.doubleValue ?? mv.g?.integerValue),
              Number(mv.a?.doubleValue ?? mv.a?.integerValue)];
    }).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
    if (stored.length < 3) continue;                  // embed-only zone, nothing to compare

    try {
      const live = boundarySignature(kmlCoords(await fetchKmlByMid(mid)));
      const mine = boundarySignature(stored);
      if (signatureChanged(live, mine)) {
        changes.push({ name, id, mid, mine, live });
        console.log(`[Watch] CHANGED ${name}: ${mine.n} -> ${live.n} pts`);
      }
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }

  if (!changes.length && !errors.length) { console.log('[Watch] all boundaries unchanged'); return; }

  // Flag for human review — never auto-updates a halachic boundary
  const rows = changes.map(c => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e7f0"><strong>${c.name}</strong></td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e7f0">${c.mine.n} → ${c.live.n} points</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e7f0">
        <a href="https://www.google.com/maps/d/viewer?mid=${c.mid}">View source map</a>
      </td>
    </tr>`).join('');

  const errHtml = errors.length
    ? `<p style="color:#9a6b1f;font-size:13px">Could not check: ${errors.join('; ')}</p>` : '';

  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
    <div style="background:linear-gradient(135deg,#0a1628,#1a3055);padding:24px 32px">
      <h1 style="color:#fff;margin:0;font-size:20px">MyEiruv</h1>
      <p style="color:rgba(255,255,255,.6);margin:4px 0 0;font-size:12px;letter-spacing:2px">BOUNDARY CHANGE DETECTED</p>
    </div>
    <div style="padding:24px 32px">
      ${changes.length ? `<p>The source map${changes.length > 1 ? 's' : ''} for the following eiruv${changes.length > 1 ? 'in have' : ' has'} changed since it was imported:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
      <p style="margin-top:20px;font-size:14px">Nothing was changed on the site. Review the source map, then re-import from
      <a href="https://myeiruv.org">myeiruv.org</a> if the update should go live.</p>` : '<p>No boundary changes detected.</p>'}
      ${errHtml}
    </div>
  </div>`;

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_KEY },
    body: JSON.stringify({
      sender: { name: 'MyEiruv', email: 'noreply@myeiruv.org' },
      to: [{ email: env.ADMIN_EMAIL || 'myeiruv@gmail.com' }],
      subject: changes.length
        ? `⚠️ ${changes.length} eiruv boundar${changes.length > 1 ? 'ies' : 'y'} changed — review needed`
        : 'MyEiruv boundary watch — check errors',
      htmlContent: html
    })
  });
  console.log(`[Watch] flagged ${changes.length} change(s), ${errors.length} error(s)`);
}
