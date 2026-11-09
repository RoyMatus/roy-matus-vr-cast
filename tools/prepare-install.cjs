#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {addCredentials}=require('./ipk.cjs');
const ROOT=path.resolve(__dirname,'..');
const URL='https://github.com/Allcrafter1/cast-audio-receiver-bundles/releases/download/2026.09.20/bundle-through-2030-12-06.json';
const SHA256='97ac49c254dfdd9ef4a140481ffbff9d62d1bad9aa3909f5e06ea211691af7ef';
async function main(){
 if(Number(process.versions.node.split('.')[0])<20)throw Error('Node.js 20 or newer is required');
 console.log('Fetching the pinned public experimental compatibility bundle…');
 const response=await fetch(URL,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Bundle download failed: '+response.status);
 const data=Buffer.from(await response.arrayBuffer());if(data.length!==2742207||crypto.createHash('sha256').update(data).digest('hex')!==SHA256)throw Error('Bundle integrity check failed');
 const bundle=JSON.parse(data),device=new crypto.X509Certificate(bundle.cpu);let valid=0;
 for(const entry of bundle.certs){
  const cert=new crypto.X509Certificate(entry.pu),pub=crypto.createPublicKey(entry.pr);
  if(!pub.export({type:'spki',format:'der'}).equals(cert.publicKey.export({type:'spki',format:'der'})))throw Error('Certificate key mismatch');
  for(const hash of ['sha1','sha256'])if(!crypto.verify(hash,cert.raw,device.publicKey,Buffer.from(entry['sig_'+hash],'base64')))throw Error('Certificate signature mismatch');
  entry.validFrom=new Date(cert.validFrom).toISOString();entry.validUntil=new Date(cert.validTo).toISOString();
  if(Date.parse(entry.validFrom)<=Date.now()&&Date.now()<Date.parse(entry.validUntil))valid++;
 }
 if(!valid)throw Error('No currently valid certificate; check computer date or update the bundle source');
 const input=path.join(ROOT,'dist/local.quest.receiver_0.4.2_all.ipk'),output=path.join(ROOT,'local-install/local.quest.receiver_0.4.2_all.ipk');
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,addCredentials(fs.readFileSync(input),bundle),{mode:0o600});
 console.log('Ready: '+output);console.log('Install this local package and the player package from dist/. Do not upload local-install/.');
}
main().catch(e=>{console.error('Installation preparation failed: '+e.message);process.exitCode=1;});
