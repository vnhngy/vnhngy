#!/usr/bin/env bash
# Für den Selbsttest: App im Android-Emulator starten und Bildschirmfotos machen.
set -e
ID=$(python3 -c "import json;print(json.load(open('app.config.json'))['appId'])")
mkdir -p shots/android
adb shell cmd uimode night yes || true
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
{ echo "Android $(adb shell getprop ro.build.version.release)"; adb shell dumpsys webviewupdate | grep -i "current webview package" || true; } > shots/android/geraet.txt
adb logcat -c || true
adb shell monkey -p "$ID" -c android.intent.category.LAUNCHER 1 >/dev/null
last=0
for t in 10 40 55 62 70; do sleep $((t - last)); last=$t; adb exec-out screencap -p > "shots/android/$t.png"; done
adb shell am force-stop "$ID"
adb shell monkey -p "$ID" -c android.intent.category.LAUNCHER 1 >/dev/null; sleep 14; adb exec-out screencap -p > shots/android/neustart.png
adb logcat -d | grep -iE "Capacitor|chromium|console|AndroidRuntime|FATAL|has died|ActivityTaskManager|ActivityManager.*carmint|libc|DEBUG|crash|backButton" | tail -n 600 > shots/android/log.txt || true
adb logcat -d -b crash > shots/android/crash.txt || true
