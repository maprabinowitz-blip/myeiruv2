// MyEiruv — Secure API Proxy Worker
const ALLOWED_ORIGINS = ['https://myeiruv.org', 'https://www.myeiruv.org'];

function cors(body, status, origin) {
  return new Response(body, {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin || 'https://myeiruv.org',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Action',
      'Vary': 'Origin',
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': allowedOrigin || 'https://myeiruv.org',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Action',
        'Vary': 'Origin',
      }});
    }

    if (request.method !== 'POST') return cors('{"error":"Method not allowed"}', 405, allowedOrigin);
    if (!allowedOrigin) return cors('{"error":"Forbidden"}', 403, 'https://myeiruv.org');

    const action = request.headers.get('X-Action') || 'anthropic';
    let body;
    try { body = await request.json(); } catch { return cors('{"error":"Invalid JSON"}', 400, allowedOrigin); }

    if (action === 'anthropic') {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
      });
      return cors(await resp.text(), resp.status, allowedOrigin);
    }

    if (action === 'brevo-send') {
      const { to, toName, eruvName, eruvCity, status, note, donateUrl, timestamp } = body;
      if (!to || !eruvName || !status) return cors('{"error":"Missing fields"}', 400, allowedOrigin);
      const statusLabel = { up: '✅ Up & Kosher', review: '⚠️ Under Review', down: '❌ Down' }[status] || status;
      const statusColor = { up: '#16a05a', review: '#d97706', down: '#d03030' }[status] || '#666';
      const donateBtn = donateUrl ? `<p style="margin-top:18px"><a href="${donateUrl}" style="background:#c8923a;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-weight:600;">❤️ Support This Eruv</a></p>` : '';
      const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f6fb;margin:0;padding:0;"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;"><div style="background:linear-gradient(135deg,#0a1628,#1a3055);padding:28px 32px;"><div style="color:#fff;font-size:22px;font-weight:700;">MyEiruv</div><div style="color:rgba(255,255,255,.6);font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Eruv Status Alert</div></div><div style="padding:28px 32px;"><h2 style="color:#0f1f38;font-size:20px;margin:0 0 4px;">${eruvName}</h2><p style="color:#6b7a99;font-size:14px;margin:0 0 20px;">${eruvCity||''}</p><div style="background:#f4f6fb;border-radius:10px;padding:18px 20px;border-left:4px solid ${statusColor};"><div style="font-size:18px;font-weight:700;color:${statusColor};">${statusLabel}</div>${note?`<p style="color:#444;font-size:14px;margin:8px 0 0;">${note}</p>`:''}</div>${timestamp?`<p style="color:#a8b4cc;font-size:12px;margin-top:12px;">Updated: ${timestamp}</p>`:''}${donateBtn}<div style="margin-top:24px;padding-top:18px;border-top:1px solid #e2e7f0;"><a href="https://myeiruv.org" style="color:#2563b0;font-size:13px;text-decoration:none;">View on MyEiruv →</a></div></div></div></body></html>`;
      const brevoResp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_KEY },
        body: JSON.stringify({ sender: { name: 'MyEiruv', email: 'alerts@myeiruv.org' }, to: [{ email: to, name: toName || to }], subject: `${eruvName} — ${statusLabel}`, htmlContent: html }),
      });
      return cors(await brevoResp.text(), brevoResp.status, allowedOrigin);
    }

    if (action === 'twilio-sms') {
      const { to, message } = body;
      if (!to || !message) return cors('{"error":"Missing fields"}', 400, allowedOrigin);
      let phone = to.replace(/\D/g, '');
      if (phone.length === 10) phone = '+1' + phone;
      else if (!phone.startsWith('+')) phone = '+' + phone;
      const creds = btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`);
      const twilioResp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `From=${encodeURIComponent(env.TWILIO_FROM)}&To=${encodeURIComponent(phone)}&Body=${encodeURIComponent(message)}`,
      });
      return cors(await twilioResp.text(), twilioResp.status, allowedOrigin);
    }

    if (action === 'google-routes') {
      const resp = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_ROUTES_KEY, 'X-Goog-FieldMask': 'routes.polyline,routes.distanceMeters,routes.duration,routes.legs.steps' },
        body: JSON.stringify(body),
      });
      return cors(await resp.text(), resp.status, allowedOrigin);
    }

    if (action === 'google-places') {
      const { lat, lng, radius, keyword, pagetoken } = body;
      const url = pagetoken
        ? `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${pagetoken}&key=${env.GOOGLE_ROUTES_KEY}`
        : `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius||2000}&keyword=${encodeURIComponent(keyword||'synagogue shul')}&type=place_of_worship&key=${env.GOOGLE_ROUTES_KEY}`;
      const resp = await fetch(url);
      return cors(await resp.text(), resp.status, allowedOrigin);
    }

    return cors('{"error":"Unknown action"}', 400, allowedOrigin);
  }
};
