# Mobile (Expo) — ARCore measurement scaffold

This folder contains a scaffolded Expo app focused on Android ARCore-based room measurement.

Important notes:
- A native ARCore bridge is required to use AR features (plane detection, depth, scale). Expo managed workflow doesn't include custom native modules by default.
- Recommended approach: use `expo prebuild` (or EAS build) to install a native ARCore bridge such as `react-native-arcore` or your own custom native module, then build an Android app that includes ARCore.

Quick start (development flow):

```bash
cd mobile
npm install
expo start            # for expo dev tools
# To use native AR modules you must prebuild and run on device:
expo prebuild         # generates native iOS/Android projects
# then open Android project in Android Studio and add native ARCore bridge dependency
```

See `services/arcore/README.md` for integration notes.
