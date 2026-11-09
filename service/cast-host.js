/* Stock Cast receiver. Media stays on the TV; no headset control or recording. */
'use strict';
var fs = require('fs'), tls = require('tls'), http = require('http');
var dgram = require('dgram'), os = require('os'), wire = require('./wire');
var material = require('./credential-store').select();
var selected = material.certs[0], events = [], clients = [], mdns, timer, lastReply = 0;
var NS = 'urn:x-cast:com.google.cast.';
var id = process.env.ROY_RECEIVER_ID;
if(!/^[a-f0-9]{32}$/.test(id))throw Error('Receiver identity is missing');
var state = 'starting', postAuthRequests = 0;
var questAddress = '', mediaOwner = null;
var streamEnabled = process.env.ROY_STREAM === '1', mediaSession = null, app = null;
function log(kind, detail) {
    var event = {at: new Date().toISOString(), kind: kind, detail: detail || ''};
    events.push(event); if (events.length > 60) events.shift();
    console.log(JSON.stringify(event));
}
function der(pem) { return new Buffer(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''), 'base64'); }
var deviceDer = der(material.cpu);
var intermediates = material.ica.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
function status() { return {state: state, events: events, postAuthRequests: postAuthRequests,
    validUntil: material.validUntil, videoImplemented: streamEnabled,
    frames: mediaSession ? mediaSession.frameCount : 0, bytes: mediaSession ? mediaSession.byteCount : 0,
    audioFrames: mediaSession ? mediaSession.audioFrames : 0,
    datagrams: mediaSession ? mediaSession.datagrams : 0,videoSize:mediaSession?mediaSession.videoSize:null,decoderLagMs:mediaSession?mediaSession.decoderLagMs:null,audioMode:process.env.ROY_AUDIO_MODE,receiverName:'Roy Matus VR Cast'}; }
function endMedia(closeOwner) {
    var owner=mediaOwner,session=mediaSession;
    mediaOwner=null;mediaSession=null;app=null;state='waiting';
    if(session)session.stop();if(closeOwner&&owner)owner.destroy();
    if(process.send)process.send({action:'show-app'});
}
function receive(socket, bytes) {
    var m = wire.parse(bytes), source = m[2] && m[2].toString(), dest = m[3] && m[3].toString();
    var ns = m[4] && m[4].toString();
    if (!source || !dest || !ns) throw Error('Incomplete Cast envelope');
    function peerLog(kind, detail) { log(kind, socket.remoteAddress + ' ' + (detail || '')); }
    function send(payload, binary) { socket.write(wire.cast(dest, source, ns, payload, binary)); }
    if (ns === NS + 'tp.deviceauth') {
        var auth = wire.parse(m[7] || new Buffer(0));
        if (!auth[1]) throw Error('No authentication challenge');
        var ch = wire.parse(auth[1]), hash = ch[3] || 0;
        peerLog('challenge', 'hash=' + hash + ', nonceBytes=' + (ch[2] ? ch[2].length : 0));
        if ((ch[1] && ch[1] !== 1) || hash > 1) throw Error('Unsupported challenge algorithm');
        if (Date.now() < Date.parse(material.validFrom) || Date.now() >= Date.parse(material.validUntil)) {
            throw Error('Certificate window expired');
        }
        // This published bundle supplies the legacy signature over the TLS certificate only.
        // Do not pretend it covers the sender nonce. A strict sender will reject it.
        var sig = new Buffer(hash === 1 ? selected.sig_sha256 : selected.sig_sha1, 'base64');
        var fields = [wire.field(1, sig), wire.field(2, deviceDer)];
        intermediates.forEach(function(c) { fields.push(wire.field(3, der(c))); });
        fields.push(wire.field(4, 1), wire.field(6, hash));
        send(wire.field(2, Buffer.concat(fields)), true);
        socket.authSent = true; peerLog('authSent'); return;
    }
    if (!m[6]) { peerLog('binary', ns + ' -> ' + dest); return; }
    var p = JSON.parse(m[6].toString());
    if (ns === NS + 'tp.heartbeat' && p.type === 'PING') { send({type: 'PONG'}); return; }
    peerLog('request', JSON.stringify({namespace: ns, destination: dest, type: p.type,
        requestId: p.requestId, appId: p.appId, protocolVersion: p.protocolVersion,
        protocolVersionList: p.protocolVersionList, keys: Object.keys(p)}));
    if (ns === NS + 'tp.connection') {
        peerLog('connection', String(p.type));
        if (p.type === 'CONNECT' && (typeof p.protocolVersion === 'number' || Array.isArray(p.protocolVersionList))) {
            // Negotiate the Cast V2 1.0 envelope implemented by wire.js.
            send({type: 'CONNECTED', protocolVersion: 0}); peerLog('connectedResponse');
        }
        return;
    }
    if (socket.authSent && ns === NS + 'receiver') {
        postAuthRequests++; peerLog('postAuth', String(p.type));
    }
    if (ns === NS + 'webrtc' && mediaSession && socket===mediaOwner) {
        if (p.type === 'OFFER') mediaSession.offer(p, function(answer) { send(answer); });
        return;
    }
    if (ns !== NS + 'receiver') { log('namespace', ns.slice(0, 100)); return; }
    function receiverStatus() { send({type: 'RECEIVER_STATUS', requestId: p.requestId,
        status: {applications: app ? [app] : [], isActiveInput: true, volume: {level: 1, muted: process.env.ROY_AUDIO_MODE==='headset'}}}); }
    if (p.type === 'GET_STATUS') {
        receiverStatus();
    } else if (p.type === 'GET_APP_AVAILABILITY') {
        var avail = {}; (p.appId || []).forEach(function(a) { avail[a] = a==='0F5096E8' ? 'APP_AVAILABLE' : 'APP_UNAVAILABLE'; });
        send({type: 'APP_AVAILABILITY', requestId: p.requestId, availability: avail});
    } else if (p.type === 'LAUNCH') {
        log('launch', String(p.appId).slice(0, 80));
        if (streamEnabled && p.appId === '0F5096E8') {
            if(mediaOwner&&mediaOwner!==socket)return send({type:'LAUNCH_ERROR',reason:'BUSY',requestId:p.requestId});
            if (mediaSession) mediaSession.stop();state='launchReached';
            var Session = require('./cast-stream').Session;
            mediaOwner=socket;questAddress=socket.remoteAddress;process.env.ROY_QUEST_ADDRESS=questAddress;
            var session = new Session(log, function(value) { if(mediaSession!==session)return;state=value;if(value==='error')endMedia(true); });
            mediaSession=session;
            app = {appId: p.appId, displayName: 'Roy Matus VR Cast', isIdleScreen: false,
                namespaces: [{name:NS+'webrtc'},{name:NS+'remoting'},{name:NS+'media'}],
                sessionId: 'roy-session-1', transportId: 'roy-stream-1', statusText: 'Waiting for Quest video'};
            receiverStatus();
        } else send({type: 'LAUNCH_ERROR', reason: 'NOT_FOUND', requestId: p.requestId});
    } else if (p.type === 'STOP') {
        if(socket===mediaOwner)endMedia(false);receiverStatus();
    }
}
function addresses() {
    var result = [], interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach(function(k) {
        interfaces[k].forEach(function(a) {
            if (!a.internal && a.family === 'IPv4' && result.indexOf(a.address) < 0) result.push(a.address);
        });
    }); return result;
}
function announce(ttl) {
    if (!mdns) return;
    addresses().forEach(function(ip) {
        var b = wire.discovery(id, ip, 8009, 'Roy Matus VR Cast', ttl);
        mdns.send(b, 0, b.length, 5353, '224.0.0.251', function(e) { if (e) log('error', e.message); });
    });
}
var server = tls.createServer({key: selected.pr, cert: selected.pu, rejectUnauthorized: false}, function(socket) {
    // Browsers keep discovery connections open. Make room for a new sender
    // without terminating the active cast when these idle slots are occupied.
    if (clients.length >= 8) {
        var idle=null;for(var c=0;c<clients.length;c++)if(clients[c]!==mediaOwner){idle=clients[c];break;}
        if(!idle){socket.destroy();return;}clients.splice(clients.indexOf(idle),1);idle.destroy();
    }
    log('tls', socket.remoteAddress); clients.push(socket); var pending = new Buffer(0);
    socket.setTimeout(45000, function() { socket.destroy(); });
    socket.on('data', function(chunk) {
        try {
            pending = Buffer.concat([pending, chunk]);
            if (pending.length > 1048580) throw Error('Input buffer exceeded limit');
            while (pending.length >= 4) {
                var n = pending.readUInt32BE(0);
                if (n < 1 || n > 1048576) throw Error('Invalid frame length');
                if (pending.length < n + 4) break;
                receive(socket, pending.slice(4, n + 4)); pending = pending.slice(n + 4);
            }
        } catch (e) { log('error', e.message); socket.destroy(); }
    });
    socket.on('error', function(e) { log('error', e.message); });
    socket.on('close', function() {
        var i = clients.indexOf(socket); if (i >= 0) clients.splice(i, 1);
        log('closed'); if (socket===mediaOwner)endMedia(false);
    });
});
server.on('error', function(e) { state = 'error'; log('error', e.message); });
server.on('clientError', function(e) { log('tlsError', e.message); });
server.listen(8009, '0.0.0.0', function() {
    state = 'waiting'; log('started'); mdns = dgram.createSocket('udp4');
    mdns.on('error', function(e) { log('error', e.message); });
    mdns.on('message', function(b) {
        if (wire.queryMatches(b, id) && Date.now() - lastReply > 250) { lastReply = Date.now(); announce(120); }
    });
    mdns.bind(5353, '0.0.0.0', function() {
        try {
            mdns.setMulticastTTL(255); addresses().forEach(function(ip) {
                try { mdns.addMembership('224.0.0.251', ip); }
                catch (e) { if (String(e.message).indexOf('EADDRINUSE') < 0) log('error', e.message); }
            });
            announce(120); timer = setInterval(function() { announce(120); }, 45000);
        } catch (e) { log('error', e.message); }
    });
});
var web = http.createServer(function(req, res) {
    res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify(status()));
});
web.on('error', function(e) { log('error', e.message); });
web.listen(8871, '127.0.0.1');
if(process.send)setInterval(function(){process.send({action:'status',payload:status()});},500);
process.on('message',function(m){if(m.command==='configure'&&['headset','tv','both'].indexOf(m.audioMode)>=0){process.env.ROY_AUDIO_MODE=m.audioMode;if(mediaSession){mediaSession.audioMode=m.audioMode;mediaSession.mute(m.audioMode==='headset');}}});
// Rotate the short-lived TLS certificate when idle; the supervisor restarts us.
setInterval(function(){if(!mediaSession && Date.now()>Date.parse(material.validUntil)-3600000)process.exit(75);},60000);
function stop() {
    if (mediaSession) mediaSession.stop();
    if (timer) clearInterval(timer); announce(0); clients.forEach(function(s) { s.destroy(); });
    server.close(); web.close(); setTimeout(function() { if (mdns) mdns.close(); process.exit(0); }, 200);
}
process.on('SIGTERM', stop); process.on('SIGINT', stop);
process.on('disconnect',stop);
