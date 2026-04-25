#!/usr/bin/env bash
set +e
REPO_ROOT="$(pwd)"
echo "============================================================"
echo " CREDIT STAMINA — ANDROID READINESS AUDIT"
echo " Run from: $REPO_ROOT"
echo " Date:     $(date)"
echo "============================================================"

section() { echo ""; echo "------------------------------------------------------------"; echo " $1"; echo "------------------------------------------------------------"; }
exists()  { [ -e "$1" ] && echo "  [OK] $1" || echo "  [MISSING] $1"; }

section "1. PROJECT STRUCTURE"
exists "package.json"
exists "ios/"
exists "android/"
exists "android/app/build.gradle"
exists "android/build.gradle"
exists "android/gradle.properties"
exists "android/app/src/main/AndroidManifest.xml"

section "2. TOOLCHAIN VERSIONS"
echo "  node:        $(node -v 2>/dev/null || echo 'not found')"
echo "  npm:         $(npm -v 2>/dev/null || echo 'not found')"
echo "  java:        $(java -version 2>&1 | head -1 || echo 'not found')"
echo "  ANDROID_HOME=${ANDROID_HOME:-<unset>}"
echo "  ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-<unset>}"
if [ -f package.json ]; then
  echo "  React Native version:"
  grep -E '"react-native"[[:space:]]*:' package.json | head -1 | sed 's/^/    /'
fi

section "3. KEY DEPENDENCIES"
if [ -f package.json ]; then
  for pkg in \
    "@supabase/supabase-js" \
    "@react-native-async-storage/async-storage" \
    "react-native-url-polyfill" \
    "react-native-keychain" \
    "react-native-encrypted-storage" \
    "@notifee/react-native" \
    "@react-native-firebase/app" \
    "@react-native-firebase/messaging" \
    "react-native-push-notification" \
    "expo-notifications" \
    "react-native-permissions" \
    "react-native-document-picker" \
    "react-native-image-picker" \
    "react-native-vision-camera" \
    "@react-native-google-signin/google-signin" \
    "react-native-google-places-autocomplete" \
    "react-native-maps" \
    "react-native-webview" \
    "react-native-pdf" \
    "react-native-share" \
    "react-native-fs" \
    "react-native-blob-util" \
    "react-native-mmkv" \
    "react-native-safe-area-context" \
    "react-native-screens" \
    "react-native-reanimated" \
    "react-native-gesture-handler" \
    "react-native-svg" \
    "react-native-linear-gradient" \
    "@react-native-community/netinfo" \
    "react-native-device-info" \
    "react-native-biometrics" \
    "react-native-iap" \
    "accept-react-native"
  do
    v=$(node -e "try { var p=require('./package.json'); console.log(p.dependencies&&p.dependencies['$pkg'] || p.devDependencies&&p.devDependencies['$pkg'] || '') } catch(e){}" 2>/dev/null)
    if [ -n "$v" ]; then
      printf "    %-50s %s\n" "$pkg" "$v"
    fi
  done
fi

section "4. iOS-ONLY CODE"
if [ -d src ]; then
  echo "  Platform.OS === 'ios'    : $(grep -rE "Platform\.OS[[:space:]]*===[[:space:]]*['\"]ios['\"]" src/ 2>/dev/null | wc -l | tr -d ' ')"
  echo "  Platform.OS === 'android': $(grep -rE "Platform\.OS[[:space:]]*===[[:space:]]*['\"]android['\"]" src/ 2>/dev/null | wc -l | tr -d ' ')"
  echo "  Platform.select usages   : $(grep -rE "Platform\.select" src/ 2>/dev/null | wc -l | tr -d ' ')"
  echo ""
  echo "  Orphan .ios files (no .android or shared fallback):"
  found=0
  while IFS= read -r f; do
    base="${f%.ios.*}"
    ext="${f##*.}"
    if [ ! -f "${base}.android.${ext}" ] && [ ! -f "${base}.${ext}" ]; then
      echo "    [!] $f"
      found=1
    fi
  done < <(find src -type f \( -name "*.ios.ts" -o -name "*.ios.tsx" -o -name "*.ios.js" -o -name "*.ios.jsx" \) 2>/dev/null)
  [ $found -eq 0 ] && echo "    (none)"
  echo ""
  echo "  iOS-only API usage:"
  for needle in "PushNotificationIOS" "ApplePay" "ActionSheetIOS" "DatePickerIOS" "SegmentedControlIOS" "TabBarIOS" "AlertIOS" "ProgressViewIOS"; do
    hits=$(grep -rEn "$needle" src/ 2>/dev/null)
    if [ -n "$hits" ]; then
      echo "    [WARN] $needle:"
      echo "$hits" | sed 's/^/        /' | head -3
    fi
  done
fi

section "5. DEEP LINKING (creditstamina://)"
MANIFEST="android/app/src/main/AndroidManifest.xml"
if [ -f "$MANIFEST" ]; then
  if grep -q 'android:scheme="creditstamina"' "$MANIFEST"; then
    echo "  [OK] creditstamina:// scheme present"
  else
    echo "  [MISSING] creditstamina:// scheme not in AndroidManifest.xml"
  fi
else
  echo "  [MISSING] $MANIFEST"
fi

section "6. PERMISSIONS"
if [ -f "$MANIFEST" ]; then
  echo "  Declared:"
  grep -oE 'android\.permission\.[A-Z_]+' "$MANIFEST" | sort -u | sed 's/^/    /'
fi

section "7. FCM / PUSH"
exists "android/app/google-services.json"
if [ -f android/build.gradle ]; then
  grep -q 'com.google.gms:google-services' android/build.gradle \
    && echo "  [OK] google-services classpath" \
    || echo "  [MISSING] google-services classpath in android/build.gradle"
fi
if [ -f android/app/build.gradle ]; then
  if grep -qE "google-services" android/app/build.gradle; then
    echo "  [OK] google-services plugin applied"
  else
    echo "  [MISSING] google-services plugin in android/app/build.gradle"
  fi
fi

section "8. GOOGLE PLACES API KEYS"
echo "  Hardcoded AIza* keys found:"
hits=$(grep -rEn "AIza[0-9A-Za-z_-]{20,}" src/ android/ 2>/dev/null)
if [ -n "$hits" ]; then
  echo "$hits" | sed 's/^/    /' | head -20
else
  echo "    (none in src/ or android/)"
fi

section "9. SIGNING"
exists "android/app/debug.keystore"
exists "android/app/release.keystore"
if [ -f android/gradle.properties ]; then
  grep -qE "MYAPP_UPLOAD_STORE_FILE|RELEASE_STORE_FILE" android/gradle.properties \
    && echo "  [OK] release keystore vars in gradle.properties" \
    || echo "  [MISSING] release keystore vars"
fi

section "10. APP ID / VERSIONS"
if [ -f android/app/build.gradle ]; then
  grep -E "applicationId|versionCode|versionName|minSdkVersion|targetSdkVersion|compileSdkVersion" android/app/build.gradle | sed 's/^/    /'
fi

section "11. SUPABASE ANDROID GOTCHAS"
if [ -d src ]; then
  if grep -rEq "createClient\(" src/ 2>/dev/null; then
    grep -rEq "react-native-url-polyfill/auto" src/ 2>/dev/null \
      && echo "  [OK] react-native-url-polyfill/auto imported" \
      || echo "  [MISSING] react-native-url-polyfill/auto (Supabase needs this on RN)"
    grep -rEq "AsyncStorage" src/ 2>/dev/null \
      && echo "  [OK] AsyncStorage referenced" \
      || echo "  [WARN] No AsyncStorage usage"
  fi
fi

section "12. AUTHORIZE.NET INTEGRATION"
hits=$(grep -rEn "Accept\.dispatchData|AcceptUI|authorize\.net|accept\.js|accept-react-native" src/ 2>/dev/null)
if [ -n "$hits" ]; then
  echo "$hits" | sed 's/^/    /' | head -10
else
  echo "    (no Accept.js / authorize.net references found in src/)"
fi

section "13. ENV / CONFIG"
exists ".env"
exists ".env.production"
exists "react-native.config.js"
exists "babel.config.js"
exists "metro.config.js"

echo ""
echo "============================================================"
echo " DONE — paste this whole output into the chat."
echo "============================================================"
