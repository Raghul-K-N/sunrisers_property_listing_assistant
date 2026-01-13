# ARCore native integration notes

This file explains how to connect a native ARCore bridge to the JS interface in `services/arcore/index.js`.

Steps overview:

1. Choose a native library or implement your own native module that exposes ARCore functionality via React Native's `NativeModules` or a Native UI Component.
2. Run `expo prebuild` to generate native projects (android/ and ios/). For Android, add the native ARCore dependency in `android/app/build.gradle` and include any required permissions in `AndroidManifest.xml`.
3. Implement the native methods: `startSession`, `stopSession`, `getPlanes`, `requestSnapshot`, and event callbacks for plane detection.
4. In `services/arcore/index.js` replace the stub functions with `NativeModules.YourArBridge.method()` calls.

Notes:
- ARCore is Android-only; iOS requires ARKit and a different native module.
- For Expo's managed workflow you must use EAS Build / prebuild to include native modules.
