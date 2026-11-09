'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),cli=path.join(root,'node_modules/@webos-tools/cli/bin/ares-package.js');
if(fs.existsSync(path.join(root,'service/private')))throw Error('Public packages must not contain credentials/settings');
function pack(folders){const r=cp.spawnSync(process.execPath,[cli,...folders.map(f=>path.join(root,f)),'-o',path.join(root,'dist')],{stdio:'inherit'});if(r.status!==0)throw Error('Packaging failed');}
pack(['app','service']);pack(['player-app']);
const p=path.join(root,'dist/local.quest.receiver.player_0.2.2_arm.ipk');fs.writeFileSync(p,require('./ipk.cjs').fixExecutable(fs.readFileSync(p)));
console.log('Public packages ready; prepare-install is required before installing the main package.');
