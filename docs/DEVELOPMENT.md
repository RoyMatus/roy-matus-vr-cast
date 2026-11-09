# Build and architecture / Сборка и устройство

The release ZIP contains installable player binaries and an unprovisioned main IPK. Building from source is optional. / В ZIP уже есть плеер и основной пакет без сертификатов; сборка из исходников необязательна.

## Build

Requirements: Node.js 22+, Python 3.11.8+ (or 3.12+), and **Zig 0.13.0** from [the official downloads](https://ziglang.org/download/0.13.0/). On Windows, pass the full path to `zig.exe`.

```sh
npm install
python tools/build-native.py --zig /path/to/zig
npm run package
npm test
node tools/prepare-install.cjs
```

The compiler targets ARMv7 Cortex-A9, glibc 2.19, the old SYSV symbol hash and lazy binding. Opus 1.6.1 is fetched from Xiph's official server and checked against a fixed SHA-256 before compilation. Native code loads the TV's SDL2 and NDL libraries dynamically. It does not ship those TV libraries. `package.cjs` fixes executable mode to 0755 inside the native IPK, which Windows packaging otherwise loses.

Service code deliberately uses ES5, `new Buffer` and Node 0.10-compatible APIs because that is the runtime on the tested TV. A modern development Node version will print a Buffer deprecation warning during tests. Do not modernize the TV service syntax without checking on the target runtime.

## Components

| Path | Purpose |
|---|---|
| `app/` | LG-style Russian settings, remote navigation and usage instructions |
| `service/service.js` | Luna service, activity lifetime, settings and child supervision |
| `service/cast-host.js` | mDNS discovery, Cast V2 TLS/authentication and session ownership |
| `service/cast-stream.js` | RTP assembly/decryption, retransmission requests, immediate ACKs, RTCP and A/V timing |
| `service/h264-size.js` | Bounded SPS dimension parser and 1920×1080 limit |
| `native/roy-player.c` | H.264 hardware playback, Opus decoding and PCM audio |
| `tools/prepare-install.cjs` | Separate, pinned compatibility credential provisioning on the user's PC |

The receiver prewarms the hardware player **before** sending the Cast ANSWER. Starting the player after receiving video accumulated a startup backlog. Full frames are now acknowledged immediately; delaying the ACK behind a 20–30 ms timer caused Quest to drop frames. CST2 selective ACKs retain progress across packet loss. RR reports carry loss feedback, and missing packets are NACKed. Both H.264 and Opus must be selected for the tested Quest sender.

Audio/video use sender RTCP timing, not independent arrival clocks. The TV's audio can be muted without stopping reception. Stock Cast has not provided a verified way to change the Quest's own local volume, so TV-only mode includes an explicit manual-volume instruction.

## Network and local boundaries

- UDP 5353: mDNS discovery on the LAN.
- TCP 8009: Cast V2 control and compatibility authentication.
- A dynamically assigned UDP port: media from the active sender's IP only.
- TCP 8790 on loopback: framed media from JS to the native player.
- HTTP 8871 on loopback: development status, no media or credentials.
- No ADB client, no headset installation, no PC streaming service, no cloud media relay.

Frame, input and startup buffers are bounded. Malformed/oversized streams terminate rather than accumulating an unbounded queue. Discovery connections cannot issue another session's OFFER/STOP. Idle discovery connections can be evicted to leave room for a sender.

## Certificates

`service/private/credentials.json` is intentionally absent from source and public IPKs. The preparation tool downloads the fixed upstream bundle, verifies its size, SHA-256, each TLS key pair and precomputed device signatures, then inserts it into a **local** IPK. This is a publicly shared experimental identity, not a unique trusted identity assigned to each TV. Discovery IDs are generated separately and saved per installation.

The receiver selects a currently valid TLS window. When idle near the end of a window, the child exits with code 75 and its supervisor selects a newer valid window. A prolonged uninterrupted session is not forcibly interrupted for certificate rotation. Future nonce requirements or revocation can invalidate this compatibility path.

Do not commit `local-install`, `service/private`, personal captures, logs or developer keys. Public packages are checked by `tests/ipk.cjs`; the actual generated credential payload is not a test fixture.

## References

[Google Open Screen implementation](https://chromium.googlesource.com/openscreen/+/main/cast/streaming/impl/) · [LG JS services](https://webostv.developer.lge.com/develop/guides/js-service-faq) · [Bundle publisher's explanation](https://github.com/Allcrafter1/cast-audio-receiver-lab/blob/main/docs/bundle-distribution.md).
