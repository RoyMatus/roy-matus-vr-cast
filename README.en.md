# Roy Matus VR Cast

[Русский](README.md)

An LG webOS app that receives standard Meta Quest casting. Open the TV app, then select **Roy Matus VR Cast** from the headset's casting menu.

**No Quest installation, headset debugging, USB connection, or running PC is required for viewing.** A computer is needed for the initial TV installation. Experimental release 0.4.2 was tested on an LG 42LF653V-ZC (webOS 2.2, firmware 04.06.75) and Quest 3S on November 9, 2026. Other models are unverified.

## Features

- Direct Quest-to-TV video and audio; no PC media relay.
- Passthrough/room view when included by Quest's standard casting.
- Headset, TV, or simultaneous audio. **TV-only audio requires manually lowering the Quest's local volume.** The app cannot remotely mute the headset.
- Hardware H.264 playback. The tested stream is 1920×1080 at approximately 30 fps. Streams above Full HD are rejected.
- Delivery/loss feedback allows the sender to adapt bitrate. Dynamic resolution switching is not guaranteed.
- The user confirmed smooth playback with less than one second of delay on the tested home network. This is an observation, not a universal latency guarantee.
- A settings interface styled after older LG webOS, with remote arrows, OK and Back navigation. The current app interface is in Russian.

## TV installation

This app is not in LG Content Store. Install both packages: the main app and its hardware player. Only open **Roy Matus VR Cast** in normal use; it launches the player automatically.

### 1. Prepare the LG TV

Install **Developer Mode** from LG's store, sign in with an LG Developer account, enable **Dev Mode Status**, and follow the restart prompt. Reopen Developer Mode, enable **Key Server**, and note the TV's IP address. Keep the TV and computer on the same home network. [LG's official guide](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app).

This is developer mode on the **TV**, not the headset. Check **Remain Session** and press **EXTEND** before expiry. LG removes developer-installed apps when Developer Mode is disabled. Developer Mode and Key Server do not need to be opened for every viewing session.

### 2. Prepare the installer package

Download and extract the ZIP from [Releases](https://github.com/RoyMatus/roy-matus-vr-cast/releases), open a terminal in that folder, and install [Node.js 22 LTS or later](https://nodejs.org/).

```sh
node tools/prepare-install.cjs
npm install --global @webos-tools/cli@3.2.6
```

The first command downloads the publisher's experimental compatibility bundle, checks its pinned SHA-256, key matches and signatures, and creates `local-install/local.quest.receiver_0.4.2_all.ipk`. Internet access is needed for this preparation step. **Do not publish `local-install`.** The main package in `dist` is deliberately unprovisioned: install the prepared package from `local-install` instead.

### 3. Pair the installation tools with the TV

```sh
ares-setup-device
```

Choose `add`: name `lg`, the IP shown on your TV, port `9922`, SSH user `prisoner`. Do not set an SSH password. Then:

```sh
ares-novacom --device lg --getkey
```

Enter the **Passphrase** shown in Developer Mode. Do not share the code or generated key. See the [webOS CLI guide](https://webostv.developer.lge.com/develop/tools/cli-dev-guide).

### 4. Install and launch

```sh
ares-install --device lg dist/local.quest.receiver.player_0.2.2_arm.ipk
ares-install --device lg local-install/local.quest.receiver_0.4.2_all.ipk
ares-launch --device lg local.quest.receiver
```

The PC can now be turned off. No Quest-to-PC USB cable is needed.

## Daily use

1. Put Quest and LG on the same network. Ethernet for the TV and 5 GHz Wi-Fi for Quest are preferable. Guest-network client isolation can block discovery.
2. Open **Roy Matus VR Cast** on the TV. Select an audio mode under **Звук** before casting.
3. Put on Quest. Open **Camera → Cast**, choose **Roy Matus VR Cast**, and press **Next**. Menu labels may vary between Horizon OS versions.
4. Open a game. The TV displays its video and selected audio. Simultaneous audio can produce an echo because the TV plays slightly later.
5. To change settings, stop casting in Quest or press Back on the LG remote. Choose the new settings and start casting again.

| TV app option | Behavior |
|---|---|
| В шлеме — Headset | Mutes TV audio; Quest continues playing |
| На телевизоре — TV | Enables TV audio; lower Quest volume manually |
| В шлеме и на телевизоре — Both | Both devices play audio; adjust their volumes independently |

## Troubleshooting

- **Receiver missing:** open the main LG app, verify the common network, press Restart, then reopen Quest's device list.
- **No video after selection:** stop the attempt in Quest, restart the LG app, and retry. Check the TV's date and that both packages are installed.
- **Stutter:** check Quest Wi-Fi, router distance and network traffic. Complete frames are acknowledged immediately; missing packets are requested again.
- **No TV sound:** select TV or Both, check LG volume, and make sure the game itself is producing sound.
- **No room view:** the app displays only what Quest transmits. Protected/system screens may be omitted by the headset.
- **App disappeared:** check Developer Mode expiry; reinstall after re-enabling it if necessary.

## Compatibility limits

The app relies on a shared experimental identity from [Allcrafter1's public bundle](https://github.com/Allcrafter1/cast-audio-receiver-bundles). This project has no officially issued Google receiver certificate and is not an official Meta/LG product. Quest updates or certificate revocation may break casting. The bundle includes validity windows through December 2030, selected automatically and rotated while idle; this does not guarantee service until that date.

The app does not record room images, video, or audio to disk. Local diagnostics contain counters and connection metadata. Use a trusted home network; there is no separate sender PIN. Remote headset volume control and guaranteed zero latency are not supported.

## Source and feedback

[Build and architecture](docs/DEVELOPMENT.md) · [Release validation](docs/VALIDATION.md) · [Third-party components](THIRD-PARTY.md).

The public repository accepts reading and **Issues**. Outside users have no write access; pull requests are disabled. Include the LG model, webOS version, Quest model and reproduction steps in an issue. Do not attach keys, provisioned packages or private room captures.
