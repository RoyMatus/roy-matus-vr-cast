'use strict';
const assert=require('assert');
const {Stream,extend8}=require('../service/cast-stream');
// NIST SP 800-38A F.5.1 AES-128-CTR, first block. Independent known-answer vector.
const key='2b7e151628aed2a6abf7158809cf4f3c',iv='f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff';
const encrypted=Buffer.from('874d6191b620e3261bef6864990db6ce','hex');
const expected='6bc1bee22e409f96e93d7e117393172a';
const decoded=[],feedback=[];
const s=new Stream({ssrc:1234,aesKey:key,aesIvMask:iv},(b,pts,k,id)=>decoded.push({hex:b.toString('hex'),pts,k,id}),b=>feedback.push(b),()=>{});
function packet(seq,id,index,max,data){
 const b=Buffer.alloc(18+data.length);b[0]=128;b[1]=96;b.writeUInt16BE(seq,2);b.writeUInt32BE(9000,4);b.writeUInt32BE(1234,8);
 b[12]=128;b[13]=id;b.writeUInt16BE(index,14);b.writeUInt16BE(max,16);data.copy(b,18);return b;
}
const peer={address:'127.0.0.1',port:12345};
s.packet(packet(100,0,1,1,encrypted.subarray(8)),peer);
assert.equal(decoded.length,0,'Never decode an incomplete frame');
s.packet(packet(100,0,1,1,encrypted.subarray(8)),peer);
assert.equal(s.buffered,8,'Duplicate packet must not consume buffer twice');
s.frames[0].at-=25;s.feedback(true);
assert.equal(feedback.at(-1)[8+20+17],1,'Request the missing first fragment');
const beforeComplete=feedback.length;
s.packet(packet(99,0,0,1,encrypted.subarray(0,8)),peer);
assert.equal(feedback.length,beforeComplete+1,'Complete frame ACK must not wait for the periodic timer');
assert.deepEqual(decoded,[{hex:expected,pts:9000,k:true,id:0}],'Reordered fragments must decrypt to the NIST plaintext');
assert.equal(s.buffered,0);assert.equal(s.ack,0);
s.feedback(true);
const ack=feedback.at(-1).subarray(8+20);
assert.equal(ack[1],206);assert.equal(ack[0],143);assert.equal(ack.readUInt16BE(2),6);
assert.equal(ack.toString('ascii',12,16),'CAST');assert.equal(ack[16],0);assert.equal(ack[17],0);
assert.equal(ack.toString('ascii',20,24),'CST2');assert.equal(ack[25],2);
s.packet(packet(102,2,0,0,encrypted),peer);s.feedback(true);
const selective=feedback.at(-1).subarray(8+20);
assert.equal(selective[17],1,'NACK missing frame 1');
assert.equal(selective[30]&1,1,'Selectively ACK complete frame 2 across the gap');
assert.equal(extend8(0,255),256);assert.equal(extend8(255,256),255);assert.equal(extend8(1,512),513);
console.log('PASS: known AES vector, reordered/duplicate/missing fragments, ACK format, frame-ID rollover');
