# AppWeb

AppWeb is a command-line tool that converts any website into a dedicated desktop or Android application.

It currently generates:

- A portable 64-bit Windows executable (`.exe`)
- A debug-signed Android package (`.apk`)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/DelfinIbnKadafi/AppWeb.git
cd AppWeb
```

### 2. Install dependencies

```bash
npm install
npm link
```

The `npm link` command makes the `appweb` command available globally.

## Usage

Run AppWeb in interactive mode:

```bash
appweb
```

Check the required build toolchain:

```bash
appweb doctor
```

Build applications directly from the command line with flags:

```bash
appweb build --name Google --domain google.com --block --platform both --icon logo.png --yes
```

### Command options

| Option | Description |
| --- | --- |
| `--name <name>` | Application name |
| `--domain <domain>` | Primary website domain |
| `--entry <url>` | Optional entry URL |
| `--block` / `--no-block` | Permit navigation to the domain and its subdomains only |
| `--platform <target>` | Target platform: `android`, `windows`, or `both` |
| `--icon <file>` | PNG or JPG application icon |
| `--out <dir>` | Output directory |
| `--verbose` | Print full build logs |
| `--no-build` | Prepare project files without building them |
| `--yes` | Skip confirmation prompts |

Generated applications are written to `./dist` by default. Build logs are stored in `~/.appweb/logs`.

## Requirements

### Windows

- Node.js 18 or newer
- Internet access for downloading Electron and electron-builder on the first build

### Android

- JDK 17 or newer
- Android SDK

Using Android Studio is recommended. After installation, accept the SDK licenses:

```bash
sdkmanager --licenses
```

Gradle 8.7 is downloaded automatically when needed.

## Features

- **Build progress:** Displays overall progress across all build stages.
- **Application icons:** Accepts square PNG or JPG images. Android receives every standard mipmap size, while Windows receives a multi-size `.ico` file.
- **Windows zoom:** Supports `Ctrl+Plus`, `Ctrl+Minus`, `Ctrl+0`, and `Ctrl+Scroll`. Zoom level is preserved between launches and can be reset from the header badge.
- **Android zoom:** Supports pinch zoom and removes common restrictions imposed by websites that disable zoom.
- **Android header:** Automatically hides while scrolling down and reappears while scrolling up, at the top of the page, or after navigation.
- **Domain filtering:** When enabled, AppWeb allows the configured domain and its subdomains while cancelling off-domain navigation, redirects, and popups.

## Recommended icon size

Use a square PNG or JPG image with a minimum size of 192 × 192 pixels. A 512 × 512 pixel image is recommended for the best icon quality.

## Important notes

- The Windows executable is portable and does not require installation.
- The Android package is debug-signed and can be installed immediately.
- Domain filtering can prevent OAuth flows that redirect to external providers, including Google and Facebook.
- Android header visibility is based on page-level scrolling. Websites that scroll content inside an inner container may not trigger the header behavior.
- Temporary build files are stored in `~/.appweb/work` and can be deleted safely.

## License

This project is licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
