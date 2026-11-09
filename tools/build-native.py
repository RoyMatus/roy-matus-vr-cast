"""Build the ARMv7 player and Opus with Zig 0.13.0. Python 3.11+ standard library."""
import argparse,hashlib,json,os,pathlib,re,shutil,subprocess,tarfile,urllib.request
root=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--zig',default=os.environ.get('ZIG','zig'));args=parser.parse_args()
zig=shutil.which(args.zig) or str(pathlib.Path(args.zig).resolve())
version=subprocess.check_output([zig,'version'],text=True).strip()
if version!='0.13.0':raise SystemExit('Use Zig 0.13.0 for the tested old-TV ABI')
build=root/'.build';build.mkdir(exist_ok=True)
archive=build/'opus-1.6.1.tar.gz'
if not archive.exists():
    with urllib.request.urlopen('https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz',timeout=60) as r:archive.write_bytes(r.read())
if hashlib.sha256(archive.read_bytes()).hexdigest()!='6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1':raise SystemExit('Opus checksum mismatch')
source=build/'opus-1.6.1'
if not source.exists():
    with tarfile.open(archive) as t:t.extractall(build,filter='data')
variables={}
for name in ('silk_sources.mk','celt_sources.mk','opus_sources.mk'):
    text=(source/name).read_text().replace('\\\n',' ')
    for key,value in re.findall(r'^(\w+)\s*=([^\n]*)',text,re.M):variables[key]=value.split()
files=[]
for key in ('SILK_SOURCES','SILK_SOURCES_FLOAT','CELT_SOURCES','OPUS_SOURCES','OPUS_SOURCES_FLOAT'):files.extend(variables[key])
env=dict(os.environ,ZIG_GLOBAL_CACHE_DIR=str(build/'zig-global'),ZIG_LOCAL_CACHE_DIR=str(build/'zig-local'))
common=['-target','arm-linux-gnueabi.2.19','-mcpu=cortex_a9','-fPIC','-Wl,--hash-style=sysv','-Wl,-z,lazy']
opusargs=[*common,'-shared','-O2','-Wl,--no-undefined','-DOPUS_BUILD','-DUSE_ALLOCA','-DHAVE_LRINTF','-DHAVE_LRINT','-Iinclude','-Isilk','-Icelt','-Isilk/float',*files,'-lm','-o',(root/'player-app/libroyopus.so').as_posix()]
response=build/'opus-args.txt';response.write_text('\n'.join(json.dumps(a) for a in opusargs),encoding='utf-8')
subprocess.run([zig,'cc','@'+str(response)],cwd=source,env=env,check=True)
subprocess.run([zig,'cc',*common,'-O1','-I',str(root/'vendor/include'),'-I',str(root/'vendor/include/SDL2'),str(root/'native/roy-player.c'),'-ldl','-lpthread','-o',str(root/'player-app/roy-player')],cwd=root,env=env,check=True)
shutil.copy2(source/'COPYING',root/'player-app/OPUS-LICENSE')
print('Built player and Opus for the tested ARMv7 LG TV')
