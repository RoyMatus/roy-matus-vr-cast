/* Minimal bounded codecs for Cast V2 and DNS. ES5 / Node 0.10 compatible. */
'use strict';
function buf(x){return new Buffer(x);}
function cat(a){return Buffer.concat(a);}
function vi(n){var a=[];do{a.push((n&127)|(n>127?128:0));n=Math.floor(n/128);}while(n);return buf(a);}
function field(n,v){if(typeof v==='number')return cat([vi(n*8),vi(v)]);if(typeof v==='string')v=buf(v);return cat([vi(n*8+2),vi(v.length),v]);}
function parse(b){var o={},p=0;function read(){var n=0,s=0,c;do{if(p>=b.length||s>49)throw Error('Invalid varint');c=b[p++];n+=(c&127)*Math.pow(2,s);s+=7;}while(c&128);return n;}
while(p<b.length){var k=read(),n=Math.floor(k/8),t=k&7,v,len;if(!n)throw Error('Invalid field');if(t===0)v=read();else if(t===2){len=read();if(p+len>b.length)throw Error('Truncated field');v=b.slice(p,p+len);p+=len;}else if(t===1||t===5){len=t===1?8:4;if(p+len>b.length)throw Error('Truncated fixed field');p+=len;continue;}else throw Error('Unsupported wire type');o[n]=v;}return o;}
function cast(source,dest,ns,payload,binary){var b=cat([field(1,0),field(2,source),field(3,dest),field(4,ns),field(5,binary?1:0),field(binary?7:6,binary?payload:JSON.stringify(payload))]),h=buf([0,0,0,0]);h.writeUInt32BE(b.length,0);return cat([h,b]);}
function u16(n){var b=buf([0,0]);b.writeUInt16BE(n,0);return b;}
function u32(n){var b=buf([0,0,0,0]);b.writeUInt32BE(n,0);return b;}
function name(s){var a=[];s.split('.').forEach(function(x){var b=buf(x);if(b.length>63)throw Error('DNS label too long');a.push(buf([b.length]),b);});a.push(buf([0]));return cat(a);}
function record(n,t,data,ttl,flush){return cat([name(n),u16(t),u16(flush?32769:1),u32(ttl),u16(data.length),data]);}
function discovery(id,ip,port,friendly,ttl){var svc='_googlecast._tcp.local',inst='Chromecast-'+id+'.'+svc,host=id+'.local',txt=[];
['id='+id,'ve=05','md=LG webOS prototype','fn='+friendly,'ca=5','st=0','nf=1','rs='].forEach(function(t){var b=buf(t);txt.push(buf([b.length]),b);});
return cat([u16(0),u16(33792),u16(0),u16(1),u16(0),u16(3),record(svc,12,name(inst),ttl,false),record(inst,33,cat([u16(0),u16(0),u16(port),name(host)]),ttl,true),record(inst,16,cat(txt),ttl,true),record(host,1,buf(ip.split('.').map(Number)),ttl,true)]);}
function queryMatches(b,id){if(b.length<12||(b[2]&128))return false;var p=12,count=b.readUInt16BE(4);if(count>100)return false;function readName(){var parts=[],q=p,jumps=0,jumped=false;while(true){if(q>=b.length||++jumps>128)throw Error('Bad DNS name');var n=b[q++];if(!n){if(!jumped)p=q;return parts.join('.').toLowerCase();}if((n&192)===192){if(q>=b.length)throw Error('Bad DNS pointer');if(!jumped)p=q+1;jumped=true;q=((n&63)<<8)|b[q];}else{if(n>63||q+n>b.length)throw Error('Bad DNS label');parts.push(b.slice(q,q+n).toString());q+=n;}}}
try{for(var i=0;i<count;i++){var n=readName();if(p+4>b.length)return false;var t=b.readUInt16BE(p);p+=4;if((n==='_googlecast._tcp.local'&&(t===12||t===255))||n==='chromecast-'+id+'._googlecast._tcp.local'||n===id+'.local')return true;}}catch(e){return false;}return false;}
exports.field=field;exports.parse=parse;exports.cast=cast;exports.discovery=discovery;exports.queryMatches=queryMatches;
