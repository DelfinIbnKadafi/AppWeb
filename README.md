# AppWeb

Turn any website into a single-site app. CLI only. Outputs `.exe` (Windows) and `.apk` (Android).

## Install

```
npm install
npm link        # gives you the `appweb` command
```

## Use

```
appweb                      # interactive
appweb doctor               # check toolchain
appweb build --name Google --domain google.com --block --platform both --yes
```

Output lands in `./dist`.

## Requirements

- Windows .exe: Node 18+ and internet (pulls Electron + electron-builder on first run)
- Android .apk: JDK 17+ and Android SDK (Android Studio is the easy way, then run `sdkmanager --licenses`). Gradle 8.7 is downloaded automatically, one time.

## Notes

- The .exe is a portable single file (x64). The .apk is debug-signed, so it installs right away.
- "Block other domains" allows the domain plus its subdomains. Off-domain navigation, redirects, and popups get cancelled, user stays on the current page.
- OAuth logins (Google, Facebook, etc.) will break when blocking is on, since they hop to another domain.
- Work files live in `~/.appweb/work`, safe to delete.
