// MyEiruv Proxy Worker v3
const ORIGINS = ['https://myeiruv.org','https://www.myeiruv.org'];

function r(body,status,origin){
  return new Response(body,{status:status||200,headers:{
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':origin||'https://myeiruv.org',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,X-Action',
    'Vary':'Origin'
  }});
}

export default {
  async fetch(req,env){
    const origin=req.headers.get('Origin')||'';
    const ok=ORIGINS.includes(origin)?origin:null;
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
      'Access-Control-Allow-Origin':ok||'https://myeiruv.org',
      'Access-Control-Allow-Methods':'POST,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type,X-Action','Vary':'Origin'
    }});
    if(req.method!=='POST')return r('{"error":"method"}',405,ok);
    if(!ok)return r('{"error":"forbidden"}',403,'https://myeiruv.org');
    const action=req.headers.get('X-Action')||'anthropic';
    let body;try{body=await req.json();}catch{return r('{"error":"json"}',400,ok);}

    if(action==='anthropic'){
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':env.ANTHROPIC_KEY,'anthropic-version':'2023-06-01'},
        body:JSON.stringify(body)
      });
      return r(await res.text(),res.status,ok);
    }
    if(action==='brevo-send'){
      const{to,toName,eruvName,eruvCity,status,note,donateUrl,timestamp}=body;
      if(!to||!eruvName||!status)return r('{"error":"missing"}',400,ok);
      const sl={'up':'✅ Up & Kosher','review':'⚠️ Under Review','down':'❌ Down'};
      const sc={'up':'#16a05a','review':'#d97706','down':'#d03030'};
      const db=donateUrl?`<p><a href="${donateUrl}" style="background:#c8923a;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-weight:600">❤️ Support This Eruv</a></p>`:'';
      const html=`<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f6fb;margin:0"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden"><div style="background:linear-gradient(135deg,#0a1628,#1a3055);padding:28px 32px"><div style="color:#fff;font-size:22px;font-weight:700">MyEiruv</div></div><div style="padding:28px 32px"><h2 style="color:#0f1f38;margin:0 0 4px">${eruvName}</h2><p style="color:#6b7a99;font-size:14px;margin:0 0 20px">${eruvCity||''}</p><div style="background:#f4f6fb;border-radius:10px;padding:18px 20px;border-left:4px solid ${sc[status]||'#666'}"><div style="font-size:18px;font-weight:700;color:${sc[status]||'#666'}">${sl[status]||status}</div>${note?`<p style="color:#444;font-size:14px;margin:8px 0 0">${note}</p>`:''}</div>${timestamp?`<p style="color:#a8b4cc;font-size:12px;margin-top:12px">Updated: ${timestamp}</p>`:''}${db}<div style="margin-top:24px;padding-top:18px;border-top:1px solid #e2e7f0"><a href="https://myeiruv.org" style="color:#2563b0;font-size:13px;text-decoration:none">View on MyEiruv →</a></div></div></div></body></html>`;
      const res=await fetch('https://api.brevo.com/v3/smtp/email',{
        method:'POST',headers:{'Content-Type':'application/json','api-key':env.BREVO_KEY},
        body:JSON.stringify({sender:{name:'MyEiruv',email:'alerts@myeiruv.org'},to:[{email:to,name:toName||to}],subject:`${eruvName} — ${sl[status]||status}`,htmlContent:html})
      });
      return r(await res.text(),res.status,ok);
    }
    if(action==='twilio-sms'){
      const{to,message}=body;
      if(!to||!message)return r('{"error":"missing"}',400,ok);
      let ph=to.replace(/\D/g,'');
      if(ph.length===10)ph='+1'+ph;else if(!ph.startsWith('+'))ph='+'+ph;
      const creds=btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`);
      const res=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`,{
        method:'POST',headers:{'Authorization':`Basic ${creds}`,'Content-Type':'application/x-www-form-urlencoded'},
        body:`From=${encodeURIComponent(env.TWILIO_FROM)}&To=${encodeURIComponent(ph)}&Body=${encodeURIComponent(message)}`
      });
      return r(await res.text(),res.status,ok);
    }
    if(action==='google-routes'){
      const res=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{
        method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':env.GOOGLE_ROUTES_KEY,'X-Goog-FieldMask':'routes.polyline,routes.distanceMeters,routes.duration,routes.legs.steps'},
        body:JSON.stringify(body)
      });
      return r(await res.text(),res.status,ok);
    }
    if(action==='google-places'){
      const{lat,lng,radius,pagetoken}=body;
      const url=pagetoken?`https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${pagetoken}&key=${env.GOOGLE_ROUTES_KEY}`:`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius||2000}&keyword=synagogue+shul&type=place_of_worship&key=${env.GOOGLE_ROUTES_KEY}`;
      const res=await fetch(url);
      return r(await res.text(),res.status,ok);
    }
    return r('{"error":"unknown"}',400,ok);
  }
};
// v3 $(date)
