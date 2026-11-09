'use strict';
const assert=require('node:assert/strict'),read=require('../service/h264-size');
for(const fixture of require('./sps-fixtures.json')){
 const input=Buffer.from(fixture.sps,'hex');
 if(fixture.width>1920)assert.throws(()=>read(input));
 else assert.deepEqual(read(input),{width:fixture.width,height:fixture.height});
}
assert.throws(()=>read(Buffer.from('674200','hex')));
console.log('PASS: independent libx264 SPS fixtures, Full HD limit, truncated input');
