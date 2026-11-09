# Release validation / Проверки выпуска

Date: 2026-11-09. Main app 0.4.2, native player 0.2.2.

Tested hardware: LG 42LF653V-ZC, webOS 2.2, firmware 04.06.75; Meta Quest 3S; local home network. No headset software was installed. USB was used during development only to inspect system messages and press the stock casting UI, not to carry video or run a streaming server.

## Observed on the devices

- Stock Quest Cast device discovery, device authentication, session launch, H.264 video and Opus audio succeeded.
- User confirmed live video, visible room passthrough, audible TV/game audio and headset-only mode muting the TV while keeping headset sound.
- After player prewarming, user reported end-to-end delay below one second. This was a human estimate, not an instrumented camera measurement.
- A later test exposed stutter. Quest logged frames dropped while awaiting ACKs. Immediate frame ACKs and improved RTCP feedback removed those messages in the observation interval; user then explicitly confirmed smooth motion.
- Final stream SPS reports 1920×1080. Sustained counters show approximately 30 video frames/s and 50 audio packets/s; player queue observed around 0.15–0.22 seconds. Decoder queue is **not** the total end-to-end latency.
- Repeated stock UI launches worked after replacing the installed main app. Browser discovery traffic no longer changes the app's playback state.
- Source certificate preparation downloaded the pinned bundle successfully and verified its signatures/key matches.
- A clean source build of the native player and public packages succeeded. The locally provisioned release packages were installed on the same TV and received 1080p video/audio again. Public source and both public IPKs were scanned for private credentials, personal network/device identifiers and workspace paths; none were found.

## Automated checks

`npm test` covers an independent NIST AES-128-CTR known-answer vector, out-of-order and duplicate fragments, missing fragment NACKs, immediate ACK delivery, selective ACKs across a missing frame, frame-ID rollover, independent libx264 SPS fixtures including 1080p crop and oversize rejection, malformed SPS input, public package absence of credentials, local IPK provisioning and executable permissions/license inclusion.

## Not established

- No compatibility claim for other LG generations, other Quest models or future Horizon OS releases.
- No controlled degraded-Wi-Fi/congestion benchmark. Feedback for sender bitrate adaptation is implemented; dynamic resolution changes have not been demonstrated.
- No automatic source-volume control on Quest. TV-only operation uses the documented manual volume step.
- No guarantee that the shared experimental compatibility identity will remain accepted.
- No claim of zero latency, 60 fps output, a security audit, or approval by LG, Meta or Google.
