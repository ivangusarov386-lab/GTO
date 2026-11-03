const fs=require('fs'), vm=require('vm'), crypto=require('crypto'), assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..')+'/';
function fixture(files){
 let password='пароль-123', writes=[], data={};
 const encode=x=>Buffer.from(typeof x==='string'?x:x).toString('base64url');
 function sheet(name){
  data[name]??=[['номер','Результат'],[1,'старый'],[2,'']];
  return {getLastRow:()=>data[name].length,getDataRange:()=>({getValues:()=>data[name]}),
   getRange:(a,b)=>({getDisplayValues:()=>[[password],['server-key']],getValues:()=>data[name].map(r=>[r[0]]),setValue:v=>{writes.push([name,a,b,v]); data[name][a-1]??=[];data[name][a-1][b-1]=v;}}),
   appendRow:r=>{writes.push([name,'append',r]);data[name].push(r);}};
 }
 const cache=new Map();
 const ctx={console,Date,JSON,Array,String,Number,Math,Error,
 SpreadsheetApp:{openById:()=>({getSheetByName:sheet})},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
 Utilities:{getUuid:()=>crypto.randomUUID(),base64EncodeWebSafe:encode,base64DecodeWebSafe:x=>Buffer.from(x,'base64url'),newBlob:b=>({getDataAsString:()=>b.toString()}),computeHmacSha256Signature:(b,k)=>crypto.createHmac('sha256',k).update(b).digest(),formatDate:()=> 'timestamp'},
 Session:{getScriptTimeZone:()=> 'UTC'},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}};
 vm.createContext(ctx); for(const f of ['JudgeAuth.gs',...files])vm.runInContext(fs.readFileSync(root+f,'utf8'),ctx,{filename:f});
 return {ctx,post:p=>ctx.doPost({postData:{contents:JSON.stringify(p)},parameter:{}}),writes,data,change:p=>password=p};
}
for(const files of [['Gode.gs (norm)'],['Code.gs (run)','Code.gs (pushup)']]){
 const f=fixture(files);
 assert.equal(f.post({action:'login',password:'bad'}).ok,false);
 const login=f.post({action:'login',password:'пароль-123'});assert.equal(login.ok,true);
 assert.equal(f.post({action:'check',session:login.session}).ok,true);
 assert.equal(f.post({action:'check',session:login.session+'bad'}).ok,false);
 const payloads=files.length===1?['pullup','jump','situp','bend','shuttle','run30','throw','shooting','run60'].map(type=>({type,token:'push123',participant:'1',result:type==='run30'?'5,30':'20'})):[{token:'push123',participant:'1',result:'0'},{entries:[{bib:'1',total:'12:40'},{bib:'3',total:'13:05'}]}];
 for(const p of payloads){const before=f.writes.length;assert.equal(f.post(p).code,'AUTH_REQUIRED');assert.equal(f.writes.length,before);const r=f.post({...p,session:login.session});assert.ok(r.ok===true||r.status==='ok',JSON.stringify(r));assert.ok(f.writes.length>before);}
 f.change('новый-пароль');const before=f.writes.length;
 assert.equal(f.post({action:'check',session:login.session}).code,'AUTH_REQUIRED');
 for(const p of payloads)assert.equal(f.post({...p,session:login.session}).code,'AUTH_REQUIRED');
 assert.equal(f.writes.length,before);
 assert.equal(f.post({action:'login',password:'пароль-123'}).ok,false);
 assert.equal(f.post({action:'login',password:'новый-пароль'}).ok,true);
 console.log('PASS',files.join(' + '),': login, tampering, 11 discipline routes, writes denied without session, password revocation');
}
for(const f of ['judge-access.js','sw.js']) new vm.Script(fs.readFileSync(root+f,'utf8'));
const html=fs.readFileSync(root+'index.html','utf8');for(const s of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(s[1]);
console.log('PASS JavaScript syntax');
