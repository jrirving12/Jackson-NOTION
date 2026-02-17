# Tequila CRM App (Expo)

React Native (Expo) app for iOS and web. Phase 0: scaffold + auth placeholder.

## Setup

```bash
npm install
```

Optional: copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to your backend (e.g. `http://localhost:3000`). For physical device, use your machine's LAN IP (e.g. `http://192.168.1.x:3000`).

## Run

```bash
npm start
```

- **Web:** open http://localhost:8081  
- **iOS:** press `i` in terminal or scan QR with Expo Go  
- **Android:** press `a` or scan QR

## Build for TestFlight (Phase 1+)

```bash
npx eas build --platform ios --profile preview
```

Requires EAS account and `eas.json` config.
