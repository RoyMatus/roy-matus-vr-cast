'use strict';
var Service=require('webos-service'),cp=require('child_process'),fs=require('fs'),crypto=require('crypto');
var service=new Service('local.quest.receiver.service'),child=null,activity=null,desired=false,config={audioMode:'headset'},snapshot={state:'stopped'},detail='';
var configFile=__dirname+'/private/settings.json';
try{var saved=JSON.parse(fs.readFileSync(configFile,'utf8'));if(['headset','tv','both'].indexOf(saved.audioMode)>=0)config.audioMode=saved.audioMode;if(/^[a-f0-9]{32}$/.test(saved.receiverId))config.receiverId=saved.receiverId;}catch(e){}
if(!config.receiverId){config.receiverId=crypto.randomBytes(16).toString('hex');try{fs.mkdirSync(__dirname+'/private',448);}catch(e){}try{fs.writeFileSync(configFile,JSON.stringify(config),{mode:384});}catch(e){}}
function state(){var r={returnValue:true,state:snapshot.state||'starting',audioMode:config.audioMode,detail:detail,receiverName:'Roy Matus VR Cast'};Object.keys(snapshot).forEach(function(k){r[k]=snapshot[k];});r.audioMode=config.audioMode;return r;}
function start(){
 desired=true;if(child)return state();detail='';snapshot={state:'starting'};
 if(!activity)service.activityManager.create('royCastReceiver',function(a){activity=a;if(!desired)release();});
 var env={};Object.keys(process.env).forEach(function(k){env[k]=process.env[k];});env.ROY_STREAM='1';env.ROY_AUDIO='1';env.ROY_AUDIO_MODE=config.audioMode;env.ROY_RECEIVER_ID=config.receiverId;
 child=cp.fork(__dirname+'/cast-host.js',[],{env:env,silent:true});var current=child;
 current.on('message',function(m){if(current!==child)return;if(m.action==='status')snapshot=m.payload;else if(m.action==='show-app')service.call('luna://com.webos.applicationManager/launch',{id:'local.quest.receiver'},function(){});});
 current.stderr.on('data',function(b){detail=String(b).slice(0,500);});current.stdout.on('data',function(){});
 current.on('error',function(e){detail=e.message;snapshot={state:'error'};});
 current.on('exit',function(code){if(current!==child)return;child=null;if(desired&&code===75){start();return;}snapshot={state:desired?'error':'stopped'};if(desired&&!detail)detail='Приёмник остановился. Нажмите «Перезапустить».';release();});
 return state();
}
function release(){if(activity){service.activityManager.complete(activity,function(){});activity=null;}}
function stop(){desired=false;if(child)child.kill('SIGTERM');else release();snapshot={state:'stopped'};return state();}
service.register('start',function(m){m.respond(start());});
service.register('stop',function(m){m.respond(stop());});
service.register('status',function(m){m.respond(state());});
service.register('report',function(m){m.respond({returnValue:true});});
service.register('configure',function(m){var mode=m.payload.audioMode;if(['headset','tv','both'].indexOf(mode)<0)return m.respond({returnValue:false,errorText:'Неизвестный режим звука'});config.audioMode=mode;try{fs.writeFileSync(configFile,JSON.stringify(config),{mode:384});}catch(e){detail='Настройка сохранится после повторного открытия приложения.';}if(child)child.send({command:'configure',audioMode:mode});m.respond(state());});
process.on('SIGTERM',function(){stop();setTimeout(function(){process.exit(0);},300);});
