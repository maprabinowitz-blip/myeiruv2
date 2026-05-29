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

    return json({error:'unknown action'},400,allow);
  }
};

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

// ── CRON: Friday eiruv status alerts ─────────────────────────────────────────
// Runs every Friday - check wrangler.toml for schedule
export const scheduled = {
  async scheduled(event, env, ctx) {
    // Get current hour in ET (UTC-4 in summer, UTC-5 in winter)
    const now = new Date();
    const hour = now.getUTCHours() - 4; // rough EST
    
    // Load all active alerts from Firestore via REST API
    const fsUrl = `https://firestore.googleapis.com/v1/projects/myer-b23f6/databases/(default)/documents/alerts?pageSize=200&key=${env.FIREBASE_KEY}`;
    const alertsRes = await fetch(fsUrl);
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
    const zonesRes = await fetch(`https://firestore.googleapis.com/v1/projects/myer-b23f6/databases/(default)/documents/zones?pageSize=100&key=${env.FIREBASE_KEY}`);
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
};
