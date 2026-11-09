/* Experimental Cast RTP -> installed LG H.264 decoder, ES5 / Node 0.10.
 * Protocol references: Chromium Open Screen and tristanpenman/go-cast (MIT).
 * No recording, ADB, headset installation, or PC media relay.
 */
'use strict';
var dgram=require('dgram'),crypto=require('crypto'),net=require('net'),cp=require('child_process'),readSize=require('./h264-size');
function zero(n){var b=new Buffer(n);b.fill(0);return b;}
function ntp(){var ms=Date.now(),s=Math.floor(ms/1000)+2208988800;return [s>>>0,Math.floor((ms%1000)*4294967296/1000)>>>0];}
function extend8(n,near){if(near<0)return n;var v=Math.floor(near/256)*256+n;if(v<near-128)v+=256;else if(v>near+128)v-=256;return v;}
function Stream(config,emit,send,log){
 this.config=config;this.emit=emit;this.send=send;this.log=log;this.sender=config.ssrc>>>0;this.receiver=(this.sender+1)>>>0;
 this.key=new Buffer(config.aesKey,'hex');this.mask=new Buffer(config.aesIvMask,'hex');
 if(this.key.length!==16||this.mask.length!==16)throw Error('Unsupported encryption key length');
 this.frames={};this.high=-1;this.ack=-1;this.next=0;this.highSeq=-1;this.seqCycles=0;this.lastSeq=0;
 this.sr=0;this.srAt=0;this.packets=0;this.decoded=0;this.lastAckAt=0;this.lastPli=0;this.buffered=0;this.endpoint=null;
 this.feedbackCount=0;this.baseSeq=null;this.uniquePackets=0;this.lastExpected=0;this.lastReceived=0;
}
Stream.prototype.feedback=function(force){
 if(!this.endpoint||(!force&&Date.now()-this.lastAckAt<20))return;this.lastAckAt=Date.now();
 var n=ntp(),xr=zero(20);xr[0]=128;xr[1]=207;xr.writeUInt16BE(4,2);xr.writeUInt32BE(this.receiver,4);
 xr[8]=4;xr.writeUInt16BE(2,10);xr.writeUInt32BE(n[0],12);xr.writeUInt32BE(n[1],16);
 var missing=[],self=this;
 for(var id=this.ack+1;id<=this.high&&missing.length<80;id++){
  var f=this.frames[id];if(f&&f.complete)continue;
  if(!f){missing.push({id:id,p:65535,mask:0});continue;}
  if(Date.now()-f.at<12)continue;
  for(var p=0;p<=f.max&&missing.length<80;p++)if(!f.parts[p]){
   var bits=0;for(var j=1;j<=8&&p+j<=f.max;j++)if(!f.parts[p+j])bits|=1<<(j-1);
   missing.push({id:id,p:p,mask:bits});p+=8;
  }
 }
 var vectorBytes=2;while(vectorBytes*8<this.high-this.ack-1&&vectorBytes<18)vectorBytes+=4;
 var ack=zero(26+missing.length*4+vectorBytes);ack[0]=143;ack[1]=206;ack.writeUInt16BE(ack.length/4-1,2);
 ack.writeUInt32BE(this.receiver,4);ack.writeUInt32BE(this.sender,8);ack.write('CAST',12,'ascii');
 ack[16]=this.ack&255;ack[17]=missing.length;ack.writeUInt16BE(100,18);
 missing.forEach(function(m,i){var p=20+i*4;ack[p]=m.id&255;ack.writeUInt16BE(m.p,p+1);ack[p+3]=m.mask;});
 var ext=20+missing.length*4;ack.write('CST2',ext,'ascii');ack[ext+4]=(this.feedbackCount++)&255;ack[ext+5]=vectorBytes;
 for(var ready=this.ack+2;ready<=this.high;ready++)if(this.frames[ready]&&this.frames[ready].complete){var bit=ready-this.ack-2;if(bit<vectorBytes*8)ack[ext+6+(bit>>>3)]|=1<<(bit&7);}
 var pieces=[];
 if(this.sr){var rr=zero(32);rr[0]=129;rr[1]=201;rr.writeUInt16BE(7,2);rr.writeUInt32BE(this.receiver,4);
  rr.writeUInt32BE(this.sender,8);rr.writeUInt32BE((this.seqCycles+this.lastSeq)>>>0,16);
  var expected=this.baseSeq===null?0:this.highSeq-this.baseSeq+1,interval=expected-this.lastExpected,lostInterval=interval-(this.uniquePackets-this.lastReceived);
  rr[12]=interval>0?Math.max(0,Math.min(255,Math.floor(lostInterval*256/interval))):0;
  var lost=Math.max(0,Math.min(8388607,expected-this.uniquePackets));rr[13]=(lost>>>16)&255;rr[14]=(lost>>>8)&255;rr[15]=lost&255;
  this.lastExpected=expected;this.lastReceived=this.uniquePackets;
  rr.writeUInt32BE(this.sr,24);rr.writeUInt32BE(Math.floor((Date.now()-this.srAt)*65.536)>>>0,28);pieces.push(rr);
 }else{var empty=zero(8);empty[0]=128;empty[1]=201;empty.writeUInt16BE(1,2);empty.writeUInt32BE(this.receiver,4);pieces.push(empty);}
 pieces.push(xr,ack);
 if(this.high-this.ack>12&&Date.now()-this.lastPli>600){
  var pli=zero(12);pli[0]=129;pli[1]=206;pli.writeUInt16BE(2,2);pli.writeUInt32BE(this.receiver,4);pli.writeUInt32BE(this.sender,8);
  pieces.push(pli);this.lastPli=Date.now();this.log('keyframeRequest',String(this.high-this.ack));
 }
 this.send(Buffer.concat(pieces),this.endpoint);
};
Stream.prototype.report=function(b,endpoint){
 this.endpoint=endpoint;
 for(var p=0;p+4<=b.length;){var length=(b.readUInt16BE(p+2)+1)*4;if(length<4||p+length>b.length)return;
  if(b[p+1]===200&&length>=28&&b.readUInt32BE(p+4)===this.sender){
   this.sr=((b.readUInt32BE(p+8)&65535)*65536+(b.readUInt32BE(p+12)>>>16))>>>0;this.srAt=Date.now();this.feedback(true);
   this.clock={ntp:(b.readUInt32BE(p+8)-2208988800)*1000+b.readUInt32BE(p+12)*1000/4294967296,rtp:b.readUInt32BE(p+16)};
  }p+=length;
 }
};
Stream.prototype.packet=function(b,endpoint){
 if(b.length<18||(b[0]>>>6)!==2)return;var off=12+(b[0]&15)*4,end=b.length;
 if(off>end)return;if(b[0]&16){if(off+4>end)return;off+=4+b.readUInt16BE(off+2)*4;}
 if(b[0]&32)end-=b[end-1];if(off+6>end)return;
 var flags=b[off],id=extend8(b[off+1],this.high),packet=b.readUInt16BE(off+2),max=b.readUInt16BE(off+4);
 if(packet>max||max>4095||id<=this.ack||id<0)return;
 if(id>this.high+128||this.buffered>8*1024*1024)throw Error('Receiver buffering limit exceeded');
 this.endpoint=endpoint;this.packets++;var seq=b.readUInt16BE(2);
 if(this.highSeq<0||((seq-this.lastSeq+65536)%65536)<32768){if(this.highSeq>=0&&seq<this.lastSeq)this.seqCycles+=65536;this.lastSeq=seq;this.highSeq=this.seqCycles+seq;}
 if(this.baseSeq===null)this.baseSeq=this.highSeq;else if(this.packets<64&&seq<this.baseSeq&&this.baseSeq-seq<64)this.baseSeq=seq;
 if(id>this.high)this.high=id;var pts=b.readUInt32BE(4);off+=6;
 if(flags&64)off++;for(var i=0;i<(flags&63);i++){if(off+2>end)return;off+=2+(b.readUInt16BE(off)&1023);}
 if(off>=end)return;
 var f=this.frames[id];if(!f){f=this.frames[id]={parts:[],max:max,count:0,bytes:0,key:!!(flags&128),pts:pts,at:Date.now(),complete:false};}
 if(f.max!==max||f.pts!==pts)throw Error('Inconsistent frame metadata');
 if(!f.parts[packet]){f.parts[packet]=new Buffer(b.slice(off,end));f.count++;f.bytes+=end-off;this.buffered+=end-off;this.uniquePackets++;}
 if(f.bytes>1024*1024)throw Error('Encoded frame exceeds decoder limit');
 if(f.count===max+1)f.complete=true;
 // A newly received keyframe permits recovery without replaying an ever-growing queue.
 if(id>this.next&&f.complete&&f.key&&id-this.next>4){
  for(var old=this.next;old<id;old++)if(this.frames[old]){this.buffered-=this.frames[old].bytes;delete this.frames[old];}
  this.next=id;this.ack=id-1;
 }
 var advanced=false;
 while(this.frames[this.next]&&this.frames[this.next].complete){
  var current=this.frames[this.next],ciphertext=Buffer.concat(current.parts),iv=new Buffer(this.mask);
  iv.writeUInt32BE((iv.readUInt32BE(8)^(this.next>>>0))>>>0,8);
  var decipher=crypto.createDecipheriv('aes-128-ctr',this.key,iv);
  var plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
  this.emit(plain,current.pts,current.key,this.next);this.decoded++;
  this.buffered-=current.bytes;delete this.frames[this.next];this.ack=this.next++;advanced=true;
 }
 // Never hold a completed frame's ACK behind the NACK rate limiter. A 20-30ms
 // timer can consume a large part of Quest's short in-flight window.
 this.feedback(advanced);
};
function Session(log,state,done){
 this.log=log;this.state=state;this.done=done;this.peerAddress=process.env.ROY_QUEST_ADDRESS;this.socket=dgram.createSocket('udp4');this.streams={};this.port=0;
 this.pipe=null;this.queue=[];this.queued=0;this.frameCount=0;this.byteCount=0;this.audioFrames=0;this.datagrams=0;this.basePts=null;this.stopped=false;this.nativeStarted=false;
 this.audioMode=process.env.ROY_AUDIO_MODE||'headset';this.audioEnabled=process.env.ROY_AUDIO==='1';this.mediaOrigin=null;this.decoderLagMs=null;
 var self=this;this.socket.on('error',function(e){self.fail(e);});
 this.socket.on('message',function(b,peer){
  if(self.stopped||peer.address!==self.peerAddress)return;
  if(b.length<12)return;
  self.datagrams++;if(self.datagrams===1)self.log('firstDatagram',JSON.stringify({bytes:b.length,type:b[1]}));
  try{var stream=self.streams[b.readUInt32BE(b[1]>=192&&b[1]<=223?4:8)];if(!stream)return;
   if(b[1]>=192&&b[1]<=223)stream.report(b,peer);else stream.packet(b,peer);
  }catch(e){self.fail(e);}
 });
 this.socket.bind(0,'0.0.0.0',function(){self.port=self.socket.address().port;log('udpReady',String(self.port));});
 this.timer=setInterval(function(){Object.keys(self.streams).forEach(function(k){self.streams[k].feedback(false);});},30);
}
Session.prototype.fail=function(e){if(this.stopped)return;this.log('streamError',e.message);this.state('error');this.stop();};
Session.prototype.stop=function(){
 if(this.stopped)return;this.stopped=true;clearInterval(this.timer);if(this.connectTimer)clearTimeout(this.connectTimer);
 try{this.socket.close();}catch(e){}if(this.pipe)this.pipe.destroy();this.queue=[];this.queued=0;
};
Session.prototype.native=function(ready){
 var self=this;
 cp.execFile('/usr/bin/luna-send-pub',['-n','1','luna://com.webos.applicationManager/launch','{"id":"local.quest.receiver.player"}'],function(err,stdout){
  if(err)return self.fail(Error('Native player could not launch'));self.log('playerLaunch',String(stdout).slice(0,200));
 });
 var deadline=Date.now()+8000;
 function connect(){
  if(self.stopped)return;var pipe=net.connect(8790,'127.0.0.1'),connected=false;
  pipe.on('error',function(e){if(connected)self.fail(e);else if(Date.now()<deadline)self.connectTimer=setTimeout(connect,150);else self.fail(Error('Native player did not open its input'));});
  pipe.on('connect',function(){connected=true;self.pipe=pipe;pipe.setNoDelay(true);
   self.log('playerConnected');self.mute(self.audioMode==='headset');self.queue.forEach(function(b){pipe.write(b);});self.queue=[];self.queued=0;if(ready)ready();
  });
  var stats='';pipe.on('data',function(b){stats+=b.toString();var newline;while((newline=stats.indexOf('\n'))>=0){try{var item=JSON.parse(stats.slice(0,newline));if(item.type==='stats')self.decoderLagMs=item.lagMs;}catch(e){}stats=stats.slice(newline+1);}if(stats.length>2048)stats='';});
  pipe.on('close',function(){if(connected&&!self.stopped)self.fail(Error('Native player closed'));});
 }
 connect();
};
Session.prototype.feed=function(data,pts,key,id){
 if(!this.nativeStarted){this.nativeStarted=true;this.native();}
 if(this.basePts===null)this.basePts=pts;
 var elapsed=this.audioEnabled?this.timestamp(this.videoStream,pts):((pts-this.basePts)>>>0)/90;
 var nalStarts=[];for(var i=0;i+3<data.length;i++){
  if(data[i]===0&&data[i+1]===0&&(data[i+2]===1||data[i+2]===0&&data[i+3]===1)){
   var size=data[i+2]===1?3:4;nalStarts.push({p:i,size:size,type:data[i+size]&31});i+=size-1;
  }
 }
 if(!nalStarts.length)throw Error('Expected Annex-B H.264 frame');
 var self=this;
 nalStarts.forEach(function(n,index){
  var end=index+1<nalStarts.length?nalStarts[index+1].p:data.length;
  // Feed codec configuration independently, as required by the tested LG decoder path.
  var nal=data.slice(n.p,end),header=zero(16);
  if(n.type===7){self.videoSize=readSize(nal.slice(n.size));self.log('videoSize',JSON.stringify(self.videoSize));}
  header.writeUInt32LE(nal.length,0);header.writeUInt32LE(1,4);
  header.writeUInt32LE(Math.round(elapsed)>>>0,8);header.writeUInt32LE(n.type===7||n.type===8?128:0,12);
  var packet=Buffer.concat([header,nal]);
  if(self.pipe){if(self.pipe.bufferSize>1024*1024)throw Error('Hardware player is falling behind');self.pipe.write(packet);}
  else{self.queue.push(packet);self.queued+=packet.length;if(self.queued>2*1024*1024)throw Error('Player startup buffer exceeded limit');}
 });
 this.frameCount++;this.byteCount+=data.length;this.state('streaming');
 if(this.frameCount===1||this.frameCount%120===0)this.log('video',JSON.stringify({frames:this.frameCount,bytes:this.byteCount,ptsMs:Math.round(elapsed),key:key,frameId:id}));
};
Session.prototype.timestamp=function(stream,pts){
 if(!stream.clock)throw Error('Missing sender timing report');
 var rate=Number(stream.config.timeBase.split('/')[1]),t=stream.clock.ntp+((pts-stream.clock.rtp)|0)*1000/rate;
 if(this.mediaOrigin===null)this.mediaOrigin=t;
 return Math.max(0,Math.round(t-this.mediaOrigin));
};
Session.prototype.mute=function(muted){
 if(!this.pipe||!this.audioEnabled)return;var b=zero(17);b.writeUInt32LE(1,0);b.writeUInt32LE(3,4);b[16]=muted?1:0;this.pipe.write(b);
};
Session.prototype.feedAudio=function(data,pts){
 this.audioFrames++;if(!this.audioEnabled)return;
 var b=zero(16);b.writeUInt32LE(data.length,0);b.writeUInt32LE(4,4);b.writeUInt32LE(this.timestamp(this.audioStream,pts)>>>0,8);
 if(this.pipe){if(this.pipe.bufferSize>1024*1024)throw Error('Hardware audio player is falling behind');this.pipe.write(Buffer.concat([b,data]));}
};
Session.prototype.offer=function(p,reply){
 var self=this,streams=(p.offer||{}).supportedStreams||[];
 this.log('offer',JSON.stringify(streams.map(function(s){return {type:s.type,codec:s.codecName,index:s.index,resolutions:s.resolutions,timeBase:s.timeBase};})));
 var video=null,audio=null;streams.forEach(function(s){if(s.type==='video_source'&&String(s.codecName).toLowerCase()==='h264'&&!video)video=s;
  if(s.type==='audio_source'&&String(s.codecName).toLowerCase()==='opus'&&!audio)audio=s;});
 if(!video||!audio){this.log('unsupportedOffer','H.264 and Opus required');return reply({type:'ANSWER',seqNum:p.seqNum,result:'error',error:{code:1,description:'This LG requires H.264 and Opus'}});}
 if(this.nativeStarted)throw Error('Stream is already negotiated');
 var stream=new Stream(video,function(b,pts,key,id){self.feed(b,pts,key,id);},function(b,peer){if(!self.stopped)self.socket.send(b,0,b.length,peer.port,peer.address);},this.log);
 this.streams[video.ssrc>>>0]=stream;
 this.videoStream=stream;
 var indexes=[],ssrcs=[];
 if(audio){var audioStream=new Stream(audio,function(b,pts){self.feedAudio(b,pts);},function(b,peer){if(!self.stopped)self.socket.send(b,0,b.length,peer.port,peer.address);},this.log);
  this.audioStream=audioStream;
  this.streams[audio.ssrc>>>0]=audioStream;indexes.push(audio.index);ssrcs.push(audioStream.receiver);}
 indexes.push(video.index);ssrcs.push(stream.receiver);
 if(!this.port)throw Error('Media socket is not ready');
 this.nativeStarted=true;this.native(function(){
 reply({type:'ANSWER',seqNum:p.seqNum,result:'ok',answer:{udpPort:self.port,sendIndexes:indexes,ssrcs:ssrcs,
  constraints:{audio:{maxSampleRate:48000,maxChannels:2,minBitRate:32000,maxBitRate:192000,maxDelay:100},
   video:{maxPixelsPerSecond:1280*720*60,maxDimensions:{width:1280,height:720,frameRate:'60'},minBitRate:300000,maxBitRate:5000000,maxDelay:100}},
  display:{dimensions:{width:1920,height:1080,frameRate:'60'},aspectRatio:'16:9',scaling:'receiver'}}});
 self.log('answer','Player ready; H.264 + Opus; target delay 100ms');
 });
};
exports.Session=Session;exports.Stream=Stream;exports.extend8=extend8;
