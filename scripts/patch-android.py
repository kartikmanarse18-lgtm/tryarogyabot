#!/usr/bin/env python3
"""Applies ArogyaBot's customisations to the freshly generated Capacitor Android project.
Run right after `npx cap add android` (CI does this automatically; locally: npm run android:setup).
Safe to run more than once."""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, 'android', 'app')
if not os.path.isdir(APP):
    sys.exit('android/ not found — run `npx cap add android` first')

def edit(rel, fn):
    p = os.path.join(APP, rel)
    s = open(p, encoding='utf-8').read()
    out = fn(s)
    if out != s:
        open(p, 'w', encoding='utf-8').write(out)

# ---------- AndroidManifest.xml ----------
def manifest(s):
    if 'arogya_alerts' in s:
        return s   # already patched
    s = s.replace('android:allowBackup="true"', 'android:allowBackup="false"\n        android:usesCleartextTraffic="false"')
    meta = '''
        <!-- FCM defaults: monochrome status-bar icon, accent colour, and the channel created in js/core/native-bridge.js -->
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_arogya" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/colorAccent" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="arogya_alerts" />

        <provider'''
    s = s.replace('\n        <provider', meta, 1)
    perms = '''    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <!-- Notifications (Android 13+ asks at runtime) — POST_NOTIFICATIONS / exact alarms also come from the notification plugin -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <!-- SOS / nearby help / responder tracking (foreground use only for the trial) -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <!-- Telemedicine video calls (WebRTC) -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

    <!-- Hardware is optional so Play doesn't hide the app from devices without it -->
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    <uses-feature android:name="android.hardware.microphone" android:required="false" />
    <uses-feature android:name="android.hardware.location.gps" android:required="false" />
    <uses-feature android:name="android.hardware.telephony" android:required="false" />
</manifest>'''
    i = s.index('    <!-- Permissions -->')
    return s[:i] + perms + '\n'
edit('src/main/AndroidManifest.xml', manifest)

# ---------- app/build.gradle : CI versioning + optional release signing ----------
def gradle(s):
    if 'KEYSTORE_PATH' in s:
        return s
    s = s.replace('versionCode 1\n        versionName "1.0"',
                  'versionCode (System.getenv("VERSION_CODE") ?: "1").toInteger()\n        versionName (System.getenv("VERSION_NAME") ?: "0.1.0")')
    s = s.replace('''    buildTypes {
        release {
            minifyEnabled false''', '''    signingConfigs {
        release {
            // Filled in by CI from repository secrets (see .github/workflows/android-apk.yml).
            // Without KEYSTORE_PATH the release build is simply left unsigned.
            if (System.getenv("KEYSTORE_PATH")) {
                storeFile file(System.getenv("KEYSTORE_PATH"))
                storePassword System.getenv("KEYSTORE_PASSWORD")
                keyAlias System.getenv("KEY_ALIAS")
                keyPassword System.getenv("KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv("KEYSTORE_PATH")) { signingConfig signingConfigs.release }
            minifyEnabled false''')
    return s
edit('build.gradle', gradle)

# ---------- styles.xml : dark splash on Android 12+ ----------
def styles(s):
    if 'windowSplashScreenBackground' in s:
        return s
    return s.replace('''<item name="android:background">@drawable/splash</item>
    </style>''', '''<item name="android:background">@drawable/splash</item>
        <item name="windowSplashScreenBackground">#0F172A</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
    </style>''')
edit('src/main/res/values/styles.xml', styles)

# ---------- brand colours ----------
with open(os.path.join(APP, 'src/main/res/values/colors.xml'), 'w', encoding='utf-8') as f:
    f.write('''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Brand colours (override the Capacitor library defaults) -->
    <color name="colorPrimary">#0F172A</color>
    <color name="colorPrimaryDark">#0F172A</color>
    <color name="colorAccent">#10B981</color>
</resources>
''')
print('Android project patched.')
