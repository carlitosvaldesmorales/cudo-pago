const SCRIPT_ID='1NI73jgr_PFvrsHy27ejE_kLbTWwLbM1Y8Nyc6mRaWlcCaLlZrpEB3Ud8';

async function accessToken(){
  const body=new URLSearchParams({
    client_id:process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID||'',
    client_secret:process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET||'',
    refresh_token:process.env.CUDO_GOOGLE_REFRESH_TOKEN||'',
    grant_type:'refresh_token'
  });
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json(); if(!r.ok||!d.access_token) throw new Error(`OAuth refresh ${r.status}`); return d.access_token;
}

const access=await accessToken();
const r=await fetch(`https://script.googleapis.com/v1/scripts/${SCRIPT_ID}:run`,{
  method:'POST',
  headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},
  body:JSON.stringify({function:'auditHumanFormsQA',devMode:true})
});
const d=await r.json();
if(!r.ok) throw new Error(`Execution API HTTP ${r.status}: ${JSON.stringify(d)}`);
if(d.error){
  console.log(JSON.stringify({ok:false,mode:'EXISTING_APPS_SCRIPT_FORMAUDIT',execution_error:d.error},null,2));
  process.exit(2);
}
const result=d.response?.result??null;
console.log(JSON.stringify({ok:true,mode:'EXISTING_APPS_SCRIPT_FORMAUDIT',result},null,2));
