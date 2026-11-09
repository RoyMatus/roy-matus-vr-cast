/* Roy Matus VR Cast: bounded-latency bridge to the TV's installed NDL decoder.
 * API declarations: LG Electronics Apache-2.0 headers from webos-userland.
 * Input: little endian length, type (1 video), timestamp milliseconds, flags;
 * followed by one complete H.264 access unit. No recording or persistent buffer.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <errno.h>
#include <dlfcn.h>
#include <time.h>
#include <poll.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <SDL.h>
#include <ndl-directmedia2/esplayer-api.h>
#include <limits.h>
static volatile sig_atomic_t stopping;
static int inputfd=0;
static __typeof__(&SDL_PollEvent) pollEvent;
static void pump(void){if(!pollEvent)return;SDL_Event e;while(pollEvent(&e)){if(e.type==SDL_QUIT)stopping=1;if(e.type==SDL_KEYDOWN){dprintf(2,"KEY %d %d\n",e.key.keysym.sym,e.key.keysym.scancode);if(e.key.keysym.sym==SDLK_ESCAPE||e.key.keysym.sym==SDLK_AC_BACK||e.key.keysym.sym==461)stopping=1;}}}
static void stop(int sig){(void)sig;stopping=1;}
static int64_t now_ms(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return (int64_t)t.tv_sec*1000+t.tv_nsec/1000000;}
static void event(NDL_ESP_EVENT e,void *data,void *user){(void)data;(void)user;if(e!=1&&e!=2&&e!=3&&e!=4&&e!=6)dprintf(2,"EVENT %d at %lld\n",e,(long long)now_ms());if(e==NDL_ESP_RESOURCE_RELEASED_BY_POLICY)stopping=1;}
static int exact(void *buf,size_t n){size_t done=0;int64_t timeout=now_ms()+3000;while(done<n&&!stopping){pump();struct pollfd p={inputfd,POLLIN,0};int r=poll(&p,1,30);if(r==0&&now_ms()<timeout)continue;if(r<=0)return 0;ssize_t k=read(inputfd,(char*)buf+done,n-done);if(k<=0)return 0;done+=(size_t)k;}return done==n;}
#define LOAD(name) __typeof__(&name) p_##name=(__typeof__(&name))dlsym(lib,#name); if(!p_##name){dprintf(2,"Missing %s\n",#name);return 2;}
int main(int argc,char **argv){
 int logfd=open("/tmp/roy-native.log",O_WRONLY|O_CREAT|O_TRUNC,0644);if(logfd>=0){fchmod(logfd,0644);dup2(logfd,2);close(logfd);}dprintf(2,"PLAYER START\n");setenv("APPID","local.quest.receiver.player",1);signal(SIGTERM,stop);signal(SIGINT,stop);signal(SIGPIPE,SIG_IGN);
 int width=argc>1&&argv[1][0]!='{'?atoi(argv[1]):1280,height=argc>2?atoi(argv[2]):720,fps=argc>3?atoi(argv[3]):60;
 if(width<320||width>1920||height<180||height>1080||fps<15||fps>60)return 2;
 setenv("EGL_PLATFORM","wayland",0);setenv("XDG_RUNTIME_DIR","/tmp/xdg",0);
 char opuspath[PATH_MAX];ssize_t plen=readlink("/proc/self/exe",opuspath,sizeof(opuspath)-32);if(plen<0)return 2;opuspath[plen]=0;char *slash=strrchr(opuspath,'/');if(!slash)return 2;strcpy(slash+1,"libroyopus.so");
 dprintf(2,"OPUS OPEN\n");void *opuslib=dlopen(opuspath,RTLD_LAZY|RTLD_LOCAL);if(!opuslib){dprintf(2,"Opus load: %s\n",dlerror());return 2;}dprintf(2,"OPUS LOADED\n");
 void *(*opus_create)(int,int,int*)=dlsym(opuslib,"opus_decoder_create");int (*opus_decode)(void*,const unsigned char*,int,short*,int,int)=dlsym(opuslib,"opus_decode");void (*opus_destroy)(void*)=dlsym(opuslib,"opus_decoder_destroy");
 if(!opus_create||!opus_decode||!opus_destroy)return 2;int opuserr=0;dprintf(2,"OPUS CREATE\n");void *opus=opus_create(48000,2,&opuserr);if(!opus||opuserr)return 2;dprintf(2,"OPUS READY\n");short pcm[5760*2];
 void *sdl=dlopen("libSDL2-2.0.so.0",RTLD_NOW|RTLD_LOCAL);if(!sdl)return 2;
 #define S(name) __typeof__(&name) p_##name=(__typeof__(&name))dlsym(sdl,#name);if(!p_##name)return 2;
 S(SDL_Init);S(SDL_CreateWindow);S(SDL_CreateRenderer);S(SDL_SetRenderDrawColor);S(SDL_RenderClear);S(SDL_RenderPresent);S(SDL_DestroyRenderer);S(SDL_DestroyWindow);S(SDL_Quit);S(SDL_GetError);
 pollEvent=(__typeof__(&SDL_PollEvent))dlsym(sdl,"SDL_PollEvent");
 if(p_SDL_Init(SDL_INIT_VIDEO)!=0){dprintf(2,"SDL init %s\n",p_SDL_GetError());return 2;}
 SDL_Window *window=p_SDL_CreateWindow("Roy Matus VR Cast",0,0,1280,720,SDL_WINDOW_FULLSCREEN);if(!window){dprintf(2,"SDL window %s\n",p_SDL_GetError());return 2;}
 SDL_Renderer *renderer=p_SDL_CreateRenderer(window,-1,SDL_RENDERER_ACCELERATED);if(!renderer){dprintf(2,"SDL renderer %s\n",p_SDL_GetError());return 2;}
 p_SDL_SetRenderDrawColor(renderer,0,0,0,0);p_SDL_RenderClear(renderer);p_SDL_RenderPresent(renderer);dprintf(2,"WINDOW READY\n");
 void *lib=dlopen("libndl-directmedia2.so.1",RTLD_NOW|RTLD_LOCAL);if(!lib){dprintf(2,"dlopen: %s\n",dlerror());return 2;}
 LOAD(NDL_EsplayerCreate);LOAD(NDL_EsplayerDestroy);LOAD(NDL_EsplayerLoad);LOAD(NDL_EsplayerUnload);LOAD(NDL_EsplayerPlay);LOAD(NDL_EsplayerSetAppForegroundState);LOAD(NDL_EsplayerSetVideoDisplayWindow);LOAD(NDL_EsplayerFeedData);LOAD(NDL_EsplayerGetMediatime);LOAD(NDL_EsplayerMuteAudio);
 dprintf(2,"LIB LOADED\n");NDL_EsplayerHandle player=p_NDL_EsplayerCreate("local.quest.receiver.player",event,NULL);if(!player){dprintf(2,"Create failed\n");return 2;}
 p_NDL_EsplayerSetAppForegroundState(player,NDL_ESP_APP_STATE_FOREGROUND);
 NDL_ESP_META_DATA meta;memset(&meta,0,sizeof(meta));meta.video_codec=NDL_ESP_VIDEO_CODEC_H264;meta.audio_codec=NDL_ESP_AUDIO_CODEC_PCM_48000_2CH;meta.channels=2;meta.samplerate=48000;meta.bitspersample=16;meta.width=width;meta.height=height;meta.framerate=fps;
 int result=p_NDL_EsplayerLoad(player,&meta);dprintf(2,"LOAD %d\n",result);if(result){p_NDL_EsplayerDestroy(player);return 2;}
 dprintf(2,"WINDOW %d PLAY %d\n",p_NDL_EsplayerSetVideoDisplayWindow(player,0,0,1920,1080,1),p_NDL_EsplayerPlay(player));
 int listener=socket(AF_INET,SOCK_STREAM,0),one=1;setsockopt(listener,SOL_SOCKET,SO_REUSEADDR,&one,sizeof(one));struct sockaddr_in address;memset(&address,0,sizeof(address));address.sin_family=AF_INET;address.sin_port=htons(8790);address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
 if(bind(listener,(struct sockaddr*)&address,sizeof(address))||listen(listener,1)){dprintf(2,"LISTEN FAILED %d\n",errno);stopping=1;}
 int64_t waitUntil=now_ms()+15000;while(!stopping&&now_ms()<waitUntil){pump();struct pollfd f={listener,POLLIN,0};if(poll(&f,1,30)>0){inputfd=accept(listener,NULL,NULL);break;}}close(listener);if(!inputfd)stopping=1;
 uint8_t *data=malloc(1024*1024);uint32_t h[4];int frames=0,audioframes=0;int64_t start=now_ms();
 while(data&&!stopping&&exact(h,sizeof(h))){if(!h[0]||h[0]>1024*1024||h[1]<1||h[1]>4||!exact(data,h[0]))break;
  if(h[1]==3){p_NDL_EsplayerMuteAudio(player,data[0]?1:0);continue;}
  NDL_ESP_STREAM_BUFFER b;memset(&b,0,sizeof(b));b.data=data;b.data_len=h[0];b.stream_type=h[1]==1?NDL_ESP_VIDEO_ES:NDL_ESP_AUDIO_ES;b.timestamp=(int64_t)h[2]*90;b.flags=h[3];
  if(h[1]==4){if(h[0]>1275*3){dprintf(2,"Oversized Opus packet\n");break;}int samples=opus_decode(opus,data,h[0],pcm,5760,0);if(samples<0){dprintf(2,"Opus decode %d\n",samples);break;}b.data=(unsigned char*)pcm;b.data_len=samples*4;audioframes++;if(audioframes%250==0){int peak=0;for(int i=0;i<samples*2;i++){int v=abs(pcm[i]);if(v>peak)peak=v;}dprintf(2,"AUDIO %d samples %d peak %d pts %u\n",audioframes,samples,peak,h[2]);}}
  int64_t deadline=now_ms()+200;do{result=p_NDL_EsplayerFeedData(player,&b);if(result>=0)break;if(result!=NDL_ESP_RESULT_FEED_FULL)break;usleep(2000);}while(!stopping&&now_ms()<deadline);
  if(result<0){dprintf(2,"FEED ERROR %d\n",result);break;}if(h[1]!=1)continue;frames++;
  if(frames%60==0){int64_t a=0,c=0;p_NDL_EsplayerGetMediatime(player,&a,&c);char message[180];int n=snprintf(message,sizeof(message),"{\"type\":\"stats\",\"frames\":%d,\"lagMs\":%lld,\"panelWidth\":1920,\"panelHeight\":1080}\n",frames,(long long)h[2]-c/1000);if(n>0&&n<(int)sizeof(message))send(inputfd,message,n,MSG_DONTWAIT|MSG_NOSIGNAL);dprintf(2,"FRAME %d inputMs %u media %lld start %lld wallMs %lld\n",frames,h[2],(long long)c,(long long)a,(long long)(now_ms()-start));}
 }
 free(data);if(inputfd)close(inputfd);p_NDL_EsplayerUnload(player);p_NDL_EsplayerDestroy(player);dlclose(lib);p_SDL_DestroyRenderer(renderer);p_SDL_DestroyWindow(window);p_SDL_Quit();opus_destroy(opus);dlclose(opuslib);dprintf(2,"STOP %d frames\n",frames);return 0;
}



