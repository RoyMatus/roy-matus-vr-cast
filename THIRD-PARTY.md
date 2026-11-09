# Third-party components

- **Opus 1.6.1**, Xiph.Org Foundation and contributors: built into `libroyopus.so` in the player IPK. The upstream BSD-style license and patent provisions are in [licenses/Opus.txt](licenses/Opus.txt) and inside the player package. [Official source](https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz), SHA-256 `6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1`.
- **SDL 2.0.3 headers**, Sam Lantinga and contributors: [zlib license](licenses/SDL2.txt), retained in every vendored header. The TV's existing SDL library is used; an SDL binary is not shipped. [Upstream](https://github.com/libsdl-org/SDL/tree/release-2.0.3).
- **LG NDL DirectMedia2 headers**, copyright LG Electronics: Apache-2.0 notices retained under `vendor/include/ndl-directmedia2`; [license](licenses/Apache-2.0.txt). [Header source](https://github.com/webosbrew/webos-userland). The proprietary TV decoder library is not distributed.
- **webOSTV.js 1.2.13**, LG Electronics: [Apache-2.0](app/LICENSE-webOSTV.txt). [Official library](https://webostv.developer.lge.com/develop/references/webostvjs-introduction).
- **webOS CLI 3.2.6** is a build/install dependency from `@webos-tools/cli`; it is not bundled into the TV application.

Protocol references: [Google Open Screen](https://chromium.googlesource.com/openscreen/+/main/cast/streaming/), [go-cast](https://github.com/tristanpenman/go-cast), and [Cast receiver lab](https://github.com/Allcrafter1/cast-audio-receiver-lab). No Meta APKs, decompiled vendor source, or FFmpeg binaries are included.

The experimental compatibility credential bundle is downloaded separately from [the upstream publisher](https://github.com/Allcrafter1/cast-audio-receiver-bundles/releases/tag/2026.09.20) by `prepare-install`. It is not included in this repository or public release packages. It is a shared third-party identity, not an official certificate issued to this project. Availability and acceptance may change.
