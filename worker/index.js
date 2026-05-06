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
          'X-Goog-FieldMask': 'routes.polyline,routes.distanceMeters,routes.duration,routes.legs.steps'
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
