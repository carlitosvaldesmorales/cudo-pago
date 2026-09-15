import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(__dirname,'..');

const FORMS={
  EQUIPO:{
    url:'https://docs.google.com/forms/d/e/1FAIpQLScMsSWHj_u6waAtMUSbkyTEr15Ckt1kJPMXaLFNYuWyDzw0uA/viewform',
    contract:'contracts/equipos-v1.json'
  },
  TABLA:{
    url:'https://docs.google.com/forms/d/e/1FAIpQLSf_WwBEVwZkvlDFMHnfO3FOFG7h9eUd-6DG4Rh6MW6kix696Q/viewform',
    contract:'contracts/tabla-v1.json'
  }
};

function extractPublicData(html){
  const marker='FB_PUBLIC_LOAD_DATA_ =';
  const idx=html.indexOf(marker);
  if(idx<0) throw new Error('FB_PUBLIC_LOAD_DATA_ no encontrado');
  let p=html.indexOf('[',idx+marker.length);
  if(p<0) throw new Error('JSON público del formulario no encontrado');
  const start=p;
  let depth=0,inString=false,escape=false;
  for(;p<html.length;p++){
    const ch=html[p];
    if(inString){
      if(escape){escape=false;continue;}
      if(ch==='\\'){escape=true;continue;}
      if(ch==='"') inString=false;
      continue;
    }
    if(ch==='"'){inString=true;continue;}
    if(ch==='[') depth++;
    else if(ch===']'){
      depth--;
      if(depth===0) return JSON.parse(html.slice(start,p+1));
    }
  }
  throw new Error('JSON público del formulario incompleto');
}

function stringsDeep(value,out=[]){
  if(typeof value==='string'&&value.trim()) out.push(value.trim());
  else if(Array.isArray(value)) for(const v of value) stringsDeep(v,out);
  return out;
}

function parseQuestions(data){
  const items=data?.[1]?.[1];
  if(!Array.isArray(items)) throw new Error('Estructura de preguntas Google Forms inesperada');
  const questions=[];
  for(const item of items){
    if(!Array.isArray(item)||typeof item[1]!=='string'||!Array.isArray(item[4])||!item[4].length) continue;
    const entry=item[4][0];
    const entryId=Array.isArray(entry)&&Number.isInteger(entry[0])?entry[0]:null;
    if(entryId===null) continue;
    const optionStrings=[...new Set(stringsDeep(entry?.[4]??[]))];
    questions.push({
      title:item[1].trim(),
      type:Number.isInteger(item[3])?item[3]:null,
      entry_id:`entry.${entryId}`,
      required:Boolean(entry?.[2]),
      options:optionStrings
    });
  }
  return questions;
}

async function fetchForm(url){
  const r=await fetch(url,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 CUDO-QA-Readonly-Schema-Probe/1.0'}});
  const html=await r.text();
  if(!r.ok) throw new Error(`GET ${url} HTTP ${r.status}`);
  if(!html.includes('FB_PUBLIC_LOAD_DATA_')) throw new Error(`Formulario no expone esquema público esperado: ${r.url}`);
  return {final_url:r.url,html};
}

const report={ok:true,mode:'READ_ONLY_PUBLIC_FORM_SCHEMA',writes:0,timestamp:new Date().toISOString(),forms:{},errors:[]};

for(const [key,cfg] of Object.entries(FORMS)){
  try{
    const contract=JSON.parse(fs.readFileSync(path.join(ROOT,cfg.contract),'utf8'));
    const expected=contract.form_mapping.map(x=>({title:x.question,required:x.required}));
    const {final_url,html}=await fetchForm(cfg.url);
    const parsed=parseQuestions(extractPublicData(html));
    const byTitle=new Map(parsed.map(q=>[q.title,q]));
    const mapped=expected.map(e=>{
      const q=byTitle.get(e.title)||null;
      return {
        title:e.title,
        expected_required:e.required,
        present:Boolean(q),
        entry_id:q?.entry_id??null,
        live_required:q?.required??null,
        required_matches:q? q.required===e.required:false,
        type:q?.type??null,
        options:q?.options??[]
      };
    });
    const unmatchedLive=parsed.filter(q=>!expected.some(e=>e.title===q.title)).map(q=>q.title);
    const formOk=mapped.every(x=>x.present&&x.required_matches&&x.entry_id)&&unmatchedLive.length===0;
    report.forms[key]={
      ok:formOk,
      source_url:cfg.url,
      final_url:final_url.split('?')[0],
      response_endpoint:cfg.url.replace(/\/viewform(?:\?.*)?$/,'/formResponse'),
      contract_id:contract.contract_id,
      expected_question_count:expected.length,
      live_question_count:parsed.length,
      mapped,
      unmatched_live_questions:unmatchedLive
    };
    if(!formOk){report.ok=false;report.errors.push(`${key}: esquema live no coincide con contrato`);}
  }catch(error){
    report.ok=false;
    report.errors.push(`${key}: ${String(error?.message||error)}`);
  }
}

fs.mkdirSync('qa-form-schema',{recursive:true});
fs.writeFileSync('qa-form-schema/google-form-capture-schema.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.ok) process.exit(1);
