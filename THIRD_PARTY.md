# Third-party components

Electron: https://github.com/electron/electron (MIT and bundled Chromium notices; LICENSE.electron.txt and LICENSES.chromium.html are included in the application distribution).

ffmpeg-static 5.3.0: https://github.com/eugeneware/ffmpeg-static (GPL-3.0-or-later). FFmpeg binary, license and build README are included in the unpacked ffmpeg-static directory.

FFmpeg binaries and corresponding build/source information:
https://github.com/eugeneware/ffmpeg-static/releases
https://github.com/eugeneware/ffmpeg-static/tree/master/build
https://ffmpeg.org/legal.html

Please retain all bundled notices and consult the exact binary's README and LICENSE before redistributing the application. No FFmpeg code is statically linked into the app's own JavaScript; the bundled executable runs as a subprocess.
