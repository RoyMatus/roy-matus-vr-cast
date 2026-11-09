'use strict';
const zlib=require('node:zlib');
function checksum(h){h.fill(32,148,156);let sum=0;for(const b of h)sum+=b;h.write(sum.toString(8).padStart(6,'0')+'\0 ',148,'ascii');}
function oct(h,value,start,size){h.write(value.toString(8).padStart(size-1,'0')+'\0',start,size,'ascii');}
function tarEntry(name,body,mode=0o644,type='0'){
 const h=Buffer.alloc(512);if(Buffer.byteLength(name)>99)throw Error('Tar path too long');h.write(name);oct(h,mode,100,8);oct(h,0,108,8);oct(h,0,116,8);oct(h,body.length,124,12);oct(h,0,136,12);h.write(type,156);h.write('ustar\0',257);h.write('00',263);checksum(h);
 return Buffer.concat([h,body,Buffer.alloc((512-body.length%512)%512)]);
}
function tarMembers(data){let p=0,out=[];while(p+512<=data.length){const h=data.subarray(p,p+512);if(h.every(b=>b===0))break;const size=parseInt(h.toString('ascii',124,136).replace(/\0/g,'').trim()||'0',8);if(!Number.isFinite(size)||size<0||p+512+size>data.length)throw Error('Invalid tar size');const length=512+Math.ceil(size/512)*512;out.push({name:h.toString('utf8',0,100).split('\0')[0],block:Buffer.from(data.subarray(p,p+length)),body:data.subarray(p+512,p+512+size)});p+=length;}return out;}
function rewrite(input,change){if(input.subarray(0,8).toString()!=='!<arch>\n')throw Error('Invalid IPK');let parts=[input.subarray(0,8)],p=8,found=0;
 while(p<input.length){const h=Buffer.from(input.subarray(p,p+60));const size=Number(h.toString('ascii',48,58).trim()),name=h.toString('ascii',0,16).trim().replace(/\/$/,'');if(!Number.isInteger(size)||size<0||p+60+size>input.length)throw Error('Invalid ar size');let body=input.subarray(p+60,p+60+size);if(name==='data.tar.gz'){body=zlib.gzipSync(change(zlib.gunzipSync(body)));found++;}h.write(String(body.length).padEnd(10,' '),48,10,'ascii');parts.push(h,body);if(body.length%2)parts.push(Buffer.from('\n'));p+=60+size+size%2;}
 if(found!==1)throw Error('Expected one data archive');return Buffer.concat(parts);
}
function addCredentials(input,credentials){return rewrite(input,tar=>{
 const members=tarMembers(tar),prefix='usr/palm/services/local.quest.receiver.service/';
 if(!members.some(m=>m.name.replace(/^\.\//,'')===prefix+'service.js'))throw Error('Wrong receiver package');
 if(members.some(m=>m.name.includes('/private/')))throw Error('Package already provisioned');
 return Buffer.concat([...members.map(m=>m.block),tarEntry('./'+prefix+'private/',Buffer.alloc(0),0o777,'5'),tarEntry('./'+prefix+'private/credentials.json',Buffer.from(JSON.stringify(credentials))),Buffer.alloc(1024)]);
});}
function fixExecutable(input){return rewrite(input,tar=>{const members=tarMembers(tar);let fixed=0;for(const m of members)if(m.name.endsWith('/roy-player')){oct(m.block,0o755,100,8);checksum(m.block.subarray(0,512));fixed++;}if(fixed!==1)throw Error('Expected one player binary');return Buffer.concat([...members.map(m=>m.block),Buffer.alloc(1024)]);});}
module.exports={tarEntry,tarMembers,rewrite,addCredentials,fixExecutable};
