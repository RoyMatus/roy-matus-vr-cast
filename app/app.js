(function(){
'use strict';
var requests=[],running=false,currentPage='connection',video=document.createElement('video'),audioMode='headset',audioModes=['headset','tv','both'],pages=['connection','audio','about'];
var caps={userAgent:navigator.userAgent,webRTC:!!(window.RTCPeerConnection||window.webkitRTCPeerConnection),mediaSource:!!(window.MediaSource||window.WebKitMediaSource),webSocket:!!window.WebSocket,h264:video.canPlayType('video/mp4; codecs="avc1.42E01E"'),aac:video.canPlayType('audio/mp4; codecs="mp4a.40.2"'),hls:video.canPlayType('application/vnd.apple.mpegurl')};
try{var saved=localStorage.getItem('roy-matus-vr-cast.audio');if(audioModes.indexOf(saved)>=0)audioMode=saved;}catch(e){}
function call(method,params,cb){
 if(!window.webOS||!webOS.service){if(cb)cb({state:'stopped',events:[]});return;}
 var request=webOS.service.request('luna://local.quest.receiver.service/',{method:method,parameters:params||{},onSuccess:cb||function(){},onFailure:function(e){document.getElementById('status').textContent='Не удалось выполнить проверку';document.getElementById('events').textContent=e.errorText||JSON.stringify(e);}});requests.push(request);if(requests.length>12)requests.shift();
}
function report(){
 caps.viewportHeight=window.innerHeight;caps.layoutHeight=document.documentElement.scrollHeight;caps.page=currentPage;caps.contentBottom=Math.round(document.getElementById('page-'+currentPage).getBoundingClientRect().bottom);caps.buttonsFit=true;
 var buttons=document.querySelectorAll('button');for(var i=0;i<buttons.length;i++)if(buttons[i].offsetParent!==null){var r=buttons[i].getBoundingClientRect();if(r.bottom>window.innerHeight||r.right>window.innerWidth)caps.buttonsFit=false;}
 try{caps.audioPreferenceStored=localStorage.getItem('roy-matus-vr-cast.audio')===audioMode;}catch(e){caps.audioPreferenceStored=false;}call('report',caps);
}
function setPage(page){currentPage=page;var labels={connection:'Подключение',audio:'Звук',about:'О приложении'};pages.forEach(function(p){document.getElementById('page-'+p).style.display=p===page?'block':'none';document.getElementById('nav-'+p).className='nav-item'+(p===page?' active':'');});document.getElementById('section-title').textContent=labels[page]+' /';report();}
var stateLabels={starting:'Запуск приёмника…',waiting:'Готово. Выберите телевизор в Quest.',listening:'Приёмник включён. Ожидаем Quest.',stopped:'Приёмник остановлен',error:'Подключение прервано',authSent:'Quest подключается…',postAuth:'Quest подключается…',launchReached:'Подготовка изображения и звука…',streaming:'Трансляция идёт'};
var eventLabels={started:'Приёмник запущен',mdns:'Телевизор доступен в списке трансляции',tls:'Открыто соединение',auth:'Шлем проверяет сертификат',authReply:'Сертификат отправлен',status:'Получен запрос состояния',availability:'Получен запрос запуска',launch:'Проверка дошла до запуска',closed:'Соединение закрыто',error:'Соединение прервано',stop:'Приёмник остановлен'};
function show(r){
 document.getElementById('status').textContent=stateLabels[r.state]||r.state;
 var live=r.state==='streaming'||r.state==='launchReached';document.documentElement.style.background=live?'transparent':'#315477';document.body.style.background=live?'transparent':'#315477';document.querySelector('.settings-shell').style.display=live?'none':'block';document.getElementById('back').style.display=live?'none':'block';
 var lines=[];if(r.detail)lines.push(r.detail);if(r.frames)lines.push('Получено кадров: '+r.frames);if(typeof r.decoderLagMs==='number')lines.push('Очередь плеера: '+r.decoderLagMs+' мс (не полная задержка)');if(r.audioFrames)lines.push('Звук принимается');document.getElementById('events').textContent=lines.join('\n');
}
function start(){running=true;call('configure',{audioMode:audioMode},function(){call('start',{},function(r){show(r);report();});});}
function selectAudio(mode){
 audioMode=mode;var stored=true;try{localStorage.setItem('roy-matus-vr-cast.audio',mode);}catch(e){stored=false;}
 audioModes.forEach(function(m){var b=document.getElementById('audio-'+m),selected=m===mode;b.className='audio-choice'+(selected?' selected':'');b.setAttribute('aria-pressed',selected?'true':'false');});
 var notes={headset:'Телевизор будет без звука. Громкость в шлеме регулируется в Quest.',tv:'Звук на телевизоре. Чтобы он был только там, убавьте громкость в самом Quest.',both:'Звук в шлеме и на телевизоре одновременно. Между ними возможны задержка и эхо.'};
 document.getElementById('audio-note').textContent=notes[mode];document.getElementById('saved-note').textContent=stored?'Выбор сохранён. Режим применяется и во время трансляции.':'Не удалось сохранить выбор. Настройка действует до закрытия приложения.';call('configure',{audioMode:mode});report();
}
function back(){if(currentPage!=='connection'){setPage('connection');document.getElementById('nav-connection').focus();}else{running=false;call('stop');window.close();}}
pages.forEach(function(p){document.getElementById('nav-'+p).onclick=function(){setPage(p);};});
audioModes.forEach(function(m){document.getElementById('audio-'+m).onclick=function(){selectAudio(m);};});
document.getElementById('restart').onclick=function(){call('stop',{},function(){setTimeout(start,800);});};document.getElementById('stop').onclick=function(){running=false;call('stop',{},show);};document.getElementById('back').onclick=back;
document.getElementById('details').onclick=function(){var e=document.getElementById('events'),visible=e.style.display==='none';e.style.display=visible?'block':'none';this.setAttribute('aria-expanded',visible?'true':'false');report();};
document.addEventListener('keydown',function(e){
 if(e.keyCode===461||e.keyCode===27){back();e.preventDefault();return;}if(e.keyCode<37||e.keyCode>40)return;
 var buttons=document.querySelectorAll('button'),active=document.activeElement,rect=active.getBoundingClientRect(),cx=(rect.left+rect.right)/2,cy=(rect.top+rect.bottom)/2,best=null,bestScore=Infinity;
 for(var i=0;i<buttons.length;i++){var b=buttons[i];if(b===active||b.offsetParent===null)continue;var r=b.getBoundingClientRect(),dx=(r.left+r.right)/2-cx,dy=(r.top+r.bottom)/2-cy,primary=e.keyCode===37?-dx:e.keyCode===39?dx:e.keyCode===38?-dy:dy,secondary=e.keyCode===37||e.keyCode===39?dy:dx;if(primary<=2)continue;var score=primary+Math.abs(secondary)*3;if(score<bestScore){best=b;bestScore=score;}}
 if(best)best.focus();e.preventDefault();
});
document.addEventListener('visibilitychange',function(){if(!document.hidden&&running)call('status',{},show);});setInterval(function(){if(running)call('status',{},show);},400);
selectAudio(audioMode);setPage('connection');document.getElementById('nav-connection').focus();start();
}());
