'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ipk=require('../tools/ipk.cjs'),root=path.resolve(__dirname,'..');
function entries(file){let out;ipk.rewrite(file,t=>{out=ipk.tarMembers(t);return t;});return out;}
const clean=fs.readFileSync(path.join(root,'dist/local.quest.receiver_0.4.2_all.ipk'));
assert(!entries(clean).some(e=>e.name.includes('/private/')));
const provisioned=ipk.addCredentials(clean,{test:true});
const member=entries(provisioned).find(e=>e.name.endsWith('/private/credentials.json'));
assert.deepEqual(JSON.parse(member.body),{test:true});
assert.throws(()=>ipk.addCredentials(provisioned,{}),'Never duplicate credentials');
const native=entries(fs.readFileSync(path.join(root,'dist/local.quest.receiver.player_0.2.2_arm.ipk')));
const binary=native.find(e=>e.name.endsWith('/roy-player'));
assert.equal(parseInt(binary.block.toString('ascii',100,108),8),0o755);
assert(native.some(e=>e.name.endsWith('/OPUS-LICENSE')));
console.log('PASS: clean public package, local provisioning, duplicate rejection, native executable mode and license');
