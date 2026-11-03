// Добавьте этот файл в проекты «все нормативы» и «Длинная».
var GTO_ACCESS_ID = '1SnOqMLc6Dw7BGqdXOwHOFDNi2lnJAytYfdTWcqR7gpk';
var GTO_ACCESS_SHEET = 'Доступ';

// Выполнить один раз из редактора. Не меняет существующий пароль и результаты.
function setupJudgeAccess() {
  var ss = SpreadsheetApp.openById(GTO_ACCESS_ID);
  var sh = ss.getSheetByName(GTO_ACCESS_SHEET) || ss.insertSheet(GTO_ACCESS_SHEET);
  sh.getRange('A1').setValue('Пароль судей');
  sh.getRange('B1').setNumberFormat('@');
  sh.getRange('A2').setValue('Служебный ключ — не менять');
  if (!sh.getRange('B2').getValue()) sh.getRange('B2').setValue(Utilities.getUuid() + Utilities.getUuid());
  sh.getRange('A4').setValue('Введите общий пароль в B1. Пустой пароль блокирует вход. Не предоставляйте судьям доступ к этой таблице.');
}
function gtoAccessState_() {
  var sh = SpreadsheetApp.openById(GTO_ACCESS_ID).getSheetByName(GTO_ACCESS_SHEET);
  if (!sh) throw new Error('Сначала выполните setupJudgeAccess и задайте пароль на листе «Доступ», B1');
  var v = sh.getRange('B1:B2').getDisplayValues();
  if (!v[0][0] || !v[1][0]) throw new Error('Пароль доступа не настроен');
  return {password:v[0][0], key:v[1][0]};
}
function gtoEqual_(a,b) {
  a=String(a); b=String(b); var d=a.length ^ b.length;
  for(var i=0;i<Math.max(a.length,b.length);i++) d |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0);
  return d===0;
}
function gtoSign_(body, state) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, state.key + ':' + state.password));
}
function gtoJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function gtoRequest_(e) {
  var raw = e && e.postData && e.postData.contents;
  return raw && /^\s*\{/.test(raw) ? JSON.parse(raw) : (e && e.parameter || {});
}
function gtoSessionValid_(token, state) {
  try {
    var parts=String(token||'').split('.');
    if(parts.length!==2 || !gtoEqual_(parts[1],gtoSign_(parts[0],state))) return false;
    var payload=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    return payload.scope==='judge' && payload.exp>Date.now() && payload.exp<=Date.now()+86400000;
  } catch(err) { return false; }
}
// Возвращает ответ для входа/проверки или отказа; null разрешает запись результата.
function gtoGuard_(params) {
  try {
    var state=gtoAccessState_();
    if(params.action==='login') {
      var lock=LockService.getScriptLock(); lock.waitLock(10000);
      try {
        var cache=CacheService.getScriptCache();
        var attempts=Number(cache.get('judge_login_failures')||0);
        if(attempts>=20) return gtoJson_({ok:false,error:'Слишком много попыток. Подождите минуту.'});
        if(!gtoEqual_(params.password||'',state.password)) {
          cache.put('judge_login_failures',String(attempts+1),60);
          return gtoJson_({ok:false,error:'Неверный пароль'});
        }
        cache.remove('judge_login_failures');
        var exp=Date.now()+86400000;
        var body=Utilities.base64EncodeWebSafe(JSON.stringify({scope:'judge',exp:exp,nonce:Utilities.getUuid()}));
        return gtoJson_({ok:true,session:body+'.'+gtoSign_(body,state),expires:exp});
      } finally { lock.releaseLock(); }
    }
    if(!gtoSessionValid_(params.session,state)) return gtoJson_({ok:false,code:'AUTH_REQUIRED',error:'Войдите с действующим паролем'});
    if(params.action==='check') return gtoJson_({ok:true});
    return null;
  } catch(err) { return gtoJson_({ok:false,code:'AUTH_REQUIRED',error:'Доступ недоступен. Проверьте настройку пароля и соединение.'}); }
}
