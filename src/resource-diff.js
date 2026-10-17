import {parse} from 'jsonc-parser';
const secret=/key|token|secret|password|authorization|headers|env/i;
function safe(value,key=''){
 if(secret.test(key))return '••••••••';
 if(Array.isArray(value))return value.map((v,i)=>i&&typeof value[i-1]==='string'&&/^--?(?:.*[-_])?(?:token|secret|password|api[-_]?key|authorization)$/i.test(value[i-1])?'••••••••':safe(v));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,safe(v,k)]));
 if(typeof value==='string')return value.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi,'$1••••••••').replace(/\b(?:sk-[\w-]{12,}|gh[pousr]_[\w]{20,}|github_pat_[\w_]{20,})\b/g,'••••••••').replace(/((?:token|secret|password|api[-_]?key|authorization)\s*(?:=|:)\s*)[^\s,;]+/gi,'$1••••••••');
 return value;
}
export function resourceDiff(file){
 const operation=file.hash===file.afterHash?'unchanged':file.after===null?'delete':!file.exists?'create':'update';
 const result={operation,beforeHash:file.hash,afterHash:file.afterHash};
 if(file.encoding==='base64')return{...result,binary:true,beforeBytes:file.exists?Buffer.from(file.text,'base64').length:0,afterBytes:file.after===null?0:Buffer.from(file.after,'base64').length};
 if(operation==='unchanged')return{...result,changes:[]};
 if(/\.jsonc?$/.test(file.file)){
  const before=file.exists?parse(file.text):{},after=file.after===null?{}:parse(file.after),changes=[];
  function walk(a,b,p=''){
   if(JSON.stringify(a)===JSON.stringify(b))return;
   if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[k],b[k],p?p+'.'+k:k);}
   else changes.push({path:p,operation:a===undefined?'add':b===undefined?'remove':'change',before:safe(a??null,p),after:safe(b??null,p)});
  }
  walk(before,after);return{...result,changes:changes.slice(0,100),truncated:changes.length>100};
 }
 const before=(file.exists?file.text:'').split(/\r?\n/),after=(file.after??'').split(/\r?\n/);
 // Preserve ordering and repeated lines without quadratic work on large documents.
 let first=0,lastA=before.length,lastB=after.length;while(first<lastA&&first<lastB&&before[first]===after[first])first++;
 while(lastA>first&&lastB>first&&before[lastA-1]===after[lastB-1]){lastA--;lastB--;}
 const lines=[...before.slice(first,lastA).map((text,i)=>({operation:'remove',line:first+i+1,text:safe(text)})),...after.slice(first,lastB).map((text,i)=>({operation:'add',line:first+i+1,text:safe(text)}))];
 return{...result,lines:lines.slice(0,120),truncated:lines.length>120};
}
