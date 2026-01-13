# AR Native Integration Guide

This document describes two integration options for adding native AR support to the app:

- Option A: Add custom native React Native modules that wrap ARCore (Android) and ARKit (iOS).
- Option B: Use a cross-platform library such as ViroReact (`react-viro`) as an alternative.

The JS side in this repo exposes a lightweight bridge at `mobile/src/services/arbridge/index.js` and `mobile/src/services/arcore/index.js` that will call a native module named `ARBridge` / `ARCoreBridge` when present. If the native module is not installed, the JS fallbacks will be used for prototyping.

API surface expected by the JS app
---------------------------------
All native methods should be asynchronous (return Promise) or be available via `NativeModules`.

- `startSession(options?)` -> Promise resolving to `{ ok: true }`
- `pauseSession()` -> Promise
- `stopSession()` -> Promise
- `getPlanes()` -> Promise resolving to `[{ id, label?, center_m:{x,y,z}, polygon_m:[ [x,y,z], ... ], width_m, depth_m, alignment }]`
- `hitTest(screenX, screenY, screenWidth?, screenHeight?)` -> Promise resolving to `{ x,y,z }` or `[{x,y,z, distance, anchorId?}, ...]`
- `getFeaturePoints()` -> Promise resolving to `[{ x,y,z, confidence? }, ...]`
- Native events (optional): emit events like `onPlaneDetected`, `onPlaneUpdated`, `onPlaneRemoved`, `onFeaturePointAdded` via `RCTDeviceEventEmitter`.

Notes on coordinate units: return world coordinates in meters (x,y,z) using the device/world coordinate system so that existing geometry helpers (`mobile/src/services/arcore/geometry.js`) can consume the values.

Option A — Native module skeletons
---------------------------------

Android (ARCore)

- Add ARCore dependency in `android/app/build.gradle` (or project-level build config):

  implementation 'com.google.ar:core:1.51.0'  # check latest

- Add camera permission to `AndroidManifest.xml`:

  <uses-permission android:name="android.permission.CAMERA" />

- Create a React Native module `ARBridgeModule.java` under `android/app/src/main/java/com/<yourapp>/ar/`.

  Example skeleton (Java):

  ```java
  // ARBridgeModule.java
  package com.yourapp.ar;

  import com.facebook.react.bridge.ReactApplicationContext;
  import com.facebook.react.bridge.ReactContextBaseJavaModule;
  import com.facebook.react.bridge.ReactMethod;
  import com.facebook.react.bridge.Promise;

  public class ARBridgeModule extends ReactContextBaseJavaModule {
    public ARBridgeModule(ReactApplicationContext ctx) { super(ctx); }
    @Override public String getName() { return "ARBridge"; }

    @ReactMethod
    public void startSession(final Promise promise) {
      // initialize ARCore session, request camera permissions if needed
      promise.resolve(true);
    }

    @ReactMethod
    public void pauseSession(final Promise promise) {
      // pause session
      promise.resolve(true);
    }

    @ReactMethod
    public void stopSession(final Promise promise) {
      // stop and release resources
      promise.resolve(true);
    }

    @ReactMethod
    public void getPlanes(final Promise promise) {
      // return serialized list of plane polygons in meters
      promise.resolve(/* WritableArray */);
    }

    @ReactMethod
    public void hitTest(double screenX, double screenY, double screenW, double screenH, final Promise promise) {
      // perform ARCore frame.hitTest and return world point(s)
      promise.resolve(/* WritableMap with x,y,z */);
    }
  }
  ```

- Important: ARCore requires rendering a GLSurfaceView or Sceneform view for frame access; many modules run a headless AR Session, but typical implementation attaches an ARFragment/Surface and listens to frames.

iOS (ARKit)

- ARKit is provided by iOS SDK (no CocoaPod required for the framework itself), but you will need to enable camera usage and ARKit support in Xcode. Add the `Privacy - Camera Usage Description` key to Info.plist.

- Create a React Native Objective-C/Swift module that wraps `ARSession`:

  Example skeleton (Objective-C):

  ```objc
  // ARBridge.m
  #import <React/RCTBridgeModule.h>
  #import <ARKit/ARKit.h>

  @interface ARBridge : NSObject <RCTBridgeModule, ARSessionDelegate>
  @property (nonatomic, strong) ARSession *session;
  @end

  @implementation ARBridge

  RCT_EXPORT_MODULE(ARBridge)

  RCT_EXPORT_METHOD(startSession:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    ARWorldTrackingConfiguration *config = [ARWorldTrackingConfiguration new];
    config.planeDetection = ARPlaneDetectionHorizontal | ARPlaneDetectionVertical;
    self.session = [ARSession new];
    self.session.delegate = self;
    [self.session runWithConfiguration:config];
    resolve(@{ @"ok": @YES });
  }

  RCT_EXPORT_METHOD(stopSession:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    [self.session pause];
    resolve(@(YES));
  }

  // Implement hitTest and plane collection using ARFrame and ARAnchor APIs

  @end
  ```

Compatibility and build notes
-----------------------------
- If you're using Expo Managed workflow, you must `eject` (prebuild) to the bare workflow to add native modules / change Gradle and Podfiles.
- After adding native code:

  Android:
  ```bash
  cd mobile
  ./gradlew assembleDebug
  ```

  iOS:
  ```bash
  cd mobile/ios
  pod install
  open YourApp.xcworkspace
  ```

Testing and QA
--------------
- Test on physical devices: ARCore requires a supported Android device; ARKit requires an iOS device with an A9+ CPU and ARKit support.
- Validate coordinate consistency (meters) against the JS geometry helpers.

Option B — ViroReact (react-viro)
--------------------------------
- `react-viro` provides a higher-level cross-platform AR API with React components. It reduces native wiring but still requires native installs and may have maintenance concerns.
- If you prefer that route, follow `react-viro` docs and then adapt `ARBridge` JS wrapper to call into Viro's APIs.

Next steps I can implement for you in this repo
------------------------------------------------
1. Add the native module skeleton Java/ObjC files for reference.
2. Add a small example RN screen `mobile/src/screens/ARNativeExample.js` that uses `mobile/src/services/arbridge` to start a session, query planes and hitTest.
3. If you want, I can scaffold the minimal Android/iOS native files (templates) under the `mobile/` project—but you'll still need to run Gradle/Xcode builds and add AR SDK deps.

Choose which next step you'd like me to take and I'll proceed.
