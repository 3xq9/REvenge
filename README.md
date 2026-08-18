# REvengeBS

Frida agent for **Brawl Stars v68.250** (official, arm64). Not BSD.

<p align="center">
  <a href="https://discord.gg/ZksZaUeDbW"><img src="https://img.shields.io/badge/Discord-join-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord" /></a>
</p>

## Test / download

Join the Discord or you get nothing: **https://discord.gg/ZksZaUeDbW**

The app is here. This repo is the agent source only.

## APK

`apk/` is **not updated** yet. Still BSD Brawl v67.264. Don't use it on v68.250.

## Repo

```
agent/   current v68.250 sources
apk/     old, not updated
```

## Build

```
npm install frida-compile
npx frida-compile agent/index.js -o dist/agent.js -B iife
```

Offsets in `agent/core/offsets.js` are RVAs for that exact `libg.so`. Other versions won't work.

## License

See `LICENSE`. No resell, no rehost, no commercial use.
