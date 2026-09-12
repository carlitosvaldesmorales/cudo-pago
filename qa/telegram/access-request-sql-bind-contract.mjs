import fs from 'node:fs';

const SOURCE_PATH='sports-bus/worker/access-request-confirm-entry.js';
const source=fs.readFileSync(SOURCE_PATH,'utf8');

function countBindArgs(sourceText,openParenIndex){
  let depth=1;
  let quote=null;
  let escaped=false;
  let args=1;
  let sawToken=false;

  for(let i=openParenIndex+1;i<sourceText.length;i++){
    const ch=sourceText[i];

    if(escaped){
      escaped=false;
      if(!/\s/.test(ch)) sawToken=true;
      continue;
    }

    if(quote){
      if(ch==='\\') escaped=true;
      else if(ch===quote) quote=null;
      sawToken=true;
      continue;
    }

    if(ch==='\''||ch==='"'||ch==='`'){
      quote=ch;
      sawToken=true;
      continue;
    }

    if(ch==='('||ch==='['||ch==='{'){
      depth++;
      sawToken=true;
      continue;
    }

    if(ch===')'||ch===']'||ch==='}'){
      depth--;
      if(depth===0) return sawToken?args:0;
      sawToken=true;
      continue;
    }

    if(ch===','&&depth===1){
      args++;
      continue;
    }

    if(!/\s/.test(ch)) sawToken=true;
  }

  throw new Error('Unterminated .bind(...) call');
}

function assertSqlBindArity(table){
  const marker=`db.prepare(\`INSERT INTO ${table}`;
  const start=source.indexOf(marker);
  if(start<0) throw new Error(`${table}: INSERT statement not found`);

  const sqlStart=source.indexOf('`',start)+1;
  const sqlEnd=source.indexOf('`)',sqlStart);
  if(sqlStart<=0||sqlEnd<0) throw new Error(`${table}: SQL template boundary not found`);

  const sql=source.slice(sqlStart,sqlEnd);
  const placeholderCount=(sql.match(/\?/g)||[]).length;

  const bindToken='.bind(';
  const bindStart=source.indexOf(bindToken,sqlEnd);
  if(bindStart<0) throw new Error(`${table}: .bind(...) not found`);
  const bindOpen=bindStart+bindToken.length-1;
  const bindArgCount=countBindArgs(source,bindOpen);

  if(placeholderCount!==bindArgCount){
    throw new Error(`${table}: SQL has ${placeholderCount} placeholders but .bind() has ${bindArgCount} arguments`);
  }

  console.log(`PASS ${table}: ${placeholderCount} placeholders == ${bindArgCount} bind arguments`);
}

assertSqlBindArity('partner_access_requests');
assertSqlBindArity('access_requests');

if(!source.includes('sql_bind_arity_verified:true')){
  throw new Error('GOVERNED_CONFIRMATION_CONTRACT must declare sql_bind_arity_verified:true');
}

console.log('PASS governed confirmation SQL bind arity contract');
