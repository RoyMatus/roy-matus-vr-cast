'use strict';
var fs=require('fs');
exports.select=function(){
 var bundle=JSON.parse(fs.readFileSync(__dirname+'/private/credentials.json','utf8')),now=Date.now(),chosen=null;
 (bundle.certs||[]).forEach(function(c){if(Date.parse(c.validFrom)<=now&&Date.parse(c.validUntil)>now&&(!chosen||Date.parse(c.validFrom)>Date.parse(chosen.validFrom)))chosen=c;});
 if(!chosen)throw Error('Нет действующего сертификата приёмника. Проверьте дату телевизора и обновите сертификат.');
 return {cpu:bundle.cpu,ica:bundle.ica,certs:[chosen],validFrom:chosen.validFrom,validUntil:chosen.validUntil};
};
