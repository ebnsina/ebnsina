---
title: 'Mobile Security'
subtitle: 'Android APK অ্যানালাইসিস, iOS অ্যাপ টেস্টিং, Frida দিয়ে ডায়নামিক ইনস্ট্রুমেন্টেশন, SSL pinning bypass, এবং mobile OWASP Top 10।'
chapter: 24
level: 'intermediate'
readingTime: '14 মিনিট'
topics:
  [
    'mobile security',
    'Android',
    'iOS',
    'APK analysis',
    'Frida',
    'SSL pinning bypass',
    'MobSF',
    'OWASP mobile',
    'dynamic analysis'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সিনার এক প্রতিবেশী খোয়ারিজমি ছিলেন ভীষণ অসাবধান। তার ব্যাংকের PIN আর সব পাসওয়ার্ড লেখা থাকত একটা আলগা কাগজের টুকরোয়, আর সেই টুকরো তিনি গুঁজে রাখতেন খোলা একটা মানিব্যাগে — যে ব্যাগ তিনি সবখানে সঙ্গে নিয়ে ঘুরতেন। ব্যাগে কোনো তালা নেই, কাগজে কোনো ঢাকা নেই। কেউ যদি ব্যাগটা হারিয়ে ফেলে বা ছিনিয়ে নেয়, এক পলকেই তার সব গোপন কথা অন্যের হাতে। আর ফোনে ব্যাংকের কাজ করার সময় তিনি ভরা মজলিসের মাঝখানে গলা তুলে নিজের অ্যাকাউন্ট নম্বর, কোড সব চেঁচিয়ে বলতেন — চারপাশের সবাই শুনে ফেলত।

ফাতিমা ছিলেন উল্টো — সাবধানী। তিনি গোপন জিনিস রাখতেন একটা তালাবদ্ধ থলিতে, চাবি নিজের কাছে। আর ব্যাংকের কথা বলতেন শুধু আলাদা ঘরে, নিচু গলায়, যেখানে আর কেউ নেই। ব্যাগ হারালেও থলি খুলবে না, আর কথাও কেউ শুনবে না।

একটা ফোন আসলে ঠিক ওই সহজে-হারানো মানিব্যাগের মতোই — যেকোনো সময় হারিয়ে যেতে পারে, চুরি হতে পারে, বা কেউ খুলে ভেতরটা ঘেঁটে দেখতে পারে। খোয়ারিজমির আলগা কাগজে লেখা PIN হলো ডিভাইসে **plaintext local storage**-এ রাখা secret, আর মজলিসে চেঁচিয়ে বলাটা হলো **insecure transport** — এনক্রিপশন ছাড়া ডেটা পাঠানো। যেহেতু ডিভাইসটা হাতছাড়া হয়ে যেতে পারে, তাই কখনো ধরে নেবেন না ফোনটা নিরাপদ — ক্লায়েন্টকে বিশ্বাস করবেন না। ফাতিমার তালাবদ্ধ থলি আর আড়ালে কথা বলাই হলো সমাধান: stored secret **encryption at rest** দিয়ে লক করে রাখা আর সব ডেটা **TLS**-এর ওপর দিয়ে পাঠানো। বাস্তবে এ কারণেই ব্যাংকিং অ্যাপ টোকেন-পাসওয়ার্ড Keychain বা Keystore-এ এনক্রিপ্ট করে রাখে এবং প্রতিটা কল certificate pinning সহ HTTPS-এ পাঠায় — ফোন হারালেও যেন গোপন কথা গোপনই থাকে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

প্রতিটি মোবাইল অ্যাপ হলো একটা client-side অ্যাপ্লিকেশন যা ব্যবহারকারীরা ইচ্ছেমতো reverse-engineer করতে পারে — সার্ভারের মতো নয়, এখানে আপনি কোড লুকিয়ে রাখতে পারবেন না। মোবাইল অ্যাপের ভেতরে বেক করা secret আসলে secret নয়; যেসব protection শুধু ডিভাইসেই থাকে, সেগুলো ভাঙা যায়।

</Callout>

## OWASP Mobile Top 10

```
M1  Improper Credential Usage          → hardcoded secrets, insecure storage
M2  Inadequate Supply Chain Security   → malicious SDK, compromised library
M3  Insecure Authentication/Auth       → biometric bypass, token leakage
M4  Insufficient Input/Output Validation → client-side validation only
M5  Insecure Communication             → HTTP, missing cert pinning
M6  Inadequate Privacy Controls        → over-collection, PII in logs
M7  Insufficient Binary Protections    → no obfuscation, easy to reverse
M8  Security Misconfiguration          → debug mode, verbose logging
M9  Insecure Data Storage              → plaintext SQLite, world-readable files
M10 Insufficient Cryptography          → weak algorithms, hardcoded keys
```

## Android APK Analysis

### Static Analysis

```bash
# Extract APK (it's a ZIP file)
cp app.apk app.zip
unzip app.zip -d app/

# Decompile with apktool (smali code)
apktool d app.apk -o app-decompiled/

# Convert DEX to JAR for Java decompilation
d2j-dex2jar app.apk -o app.jar

# Decompile JAR to Java source
jd-gui app.jar       # Java Decompiler GUI
# or: cfr-decompiler, jadx

# jadx — best all-in-one decompiler
jadx app.apk -d output/
jadx-gui app.apk     # GUI version

# Search for secrets in decompiled code
grep -r "api_key\|apiKey\|secret\|password\|token\|AWS\|Bearer" output/
grep -r "http://" output/     # insecure URLs
grep -r "Log.d\|Log.e\|Log.v" output/   # debug logging (PII?)

# AndroidManifest.xml — permissions, components, exported activities
cat app-decompiled/AndroidManifest.xml

# Look for:
# android:exported="true" → accessible to other apps or ADB
# android:debuggable="true" → debug mode in production!
# android:allowBackup="true" → backup extracts app data
# android.permission.READ_CONTACTS + unnecessary permissions
```

### MobSF — Automated Mobile Analysis

```bash
# Install MobSF with Docker
docker pull opensecurity/mobile-security-framework-mobsf
docker run -it --rm -p 8000:8000 opensecurity/mobile-security-framework-mobsf:latest

# Access at http://localhost:8000
# Upload APK → automatic static analysis report

# Findings:
# - Hardcoded secrets
# - Exported components
# - Insecure permissions
# - Weak crypto
# - Certificate validation issues
# - Insecure network traffic
```

### Dynamic Analysis (Android)

```bash
# Set up Android emulator or rooted device
# AVD (Android Virtual Device) via Android Studio
emulator -avd Pixel_4_API_30

# Install app
adb install app.apk

# ADB commands
adb devices                         # list devices
adb shell                           # shell into device
adb logcat | grep -i "error\|password\|token"  # read device logs
adb backup -apk -nosystem com.target.app   # backup app data

# Intercept traffic with Burp Suite
# Configure proxy: Settings → WiFi → long press network → Proxy: 192.168.1.50:8080
# Install Burp CA cert on device
adb push BurpCA.cer /sdcard/
# Settings → Security → Install from storage

# For apps with SSL pinning — bypass required (see below)
```

## Frida — Dynamic Instrumentation

Frida চলমান process-এর ভেতরে JavaScript ইনজেক্ট করে function hook করতে, security check bypass করতে, এবং data বের করে আনতে।

```bash
# Install Frida
pip install frida-tools

# Push Frida server to Android device
adb push frida-server-16.x.x-android-x86 /data/local/tmp/frida-server
adb shell chmod 755 /data/local/tmp/frida-server
adb shell /data/local/tmp/frida-server &

# List running apps
frida-ps -U   # -U = USB device
frida-ps -Ua  # applications only

# Attach to app
frida -U -n "com.target.app" --no-pause -l script.js
```

```javascript
// Frida script — hook a function
Java.perform(function () {
	// Hook a class method
	var Activity = Java.use('com.target.app.LoginActivity');

	Activity.checkPassword.implementation = function (password) {
		console.log('[*] checkPassword called with: ' + password);

		// Call original and see result
		var result = this.checkPassword(password);
		console.log('[*] Original result: ' + result);

		// Override: always return true
		return true;
	};
});
```

### SSL Pinning Bypass

SSL pinning ট্রাফিক intercept করা আটকায় — অ্যাপ শুধু তার নিজের certificate-কেই বিশ্বাস করে। Frida দিয়ে এটা bypass করুন:

```javascript
// Universal SSL Pinning Bypass — covers most frameworks
// Source: fridaninja / objection
Java.perform(function () {
	// OkHttp3
	try {
		var OkHostnameVerifier = Java.use('okhttp3.internal.tls.OkHostnameVerifier');
		OkHostnameVerifier.verify.overload(
			'java.lang.String',
			'javax.net.ssl.SSLSession'
		).implementation = function (s, session) {
			return true;
		};
	} catch (e) {}

	// TrustManager — custom cert validation
	var TrustManager = Java.registerClass({
		name: 'com.custom.TrustManager',
		implements: [Java.use('javax.net.ssl.X509TrustManager')],
		methods: {
			checkClientTrusted: function (chain, authType) {},
			checkServerTrusted: function (chain, authType) {},
			getAcceptedIssuers: function () {
				return [];
			}
		}
	});

	var SSLContext = Java.use('javax.net.ssl.SSLContext');
	SSLContext.init.overload(
		'[Ljavax.net.ssl.KeyManager;',
		'[Ljavax.net.ssl.TrustManager;',
		'java.security.SecureRandom'
	).implementation = function (km, tm, sr) {
		this.init(km, [TrustManager.$new()], sr);
	};
});
```

```bash
# Objection — mobile app security toolkit built on Frida
pip install objection

# Start objection
objection -g com.target.app explore

# Objection commands:
android sslpinning disable         # disable SSL pinning
android root disable               # bypass root detection
android hooking list classes       # list all classes
android hooking watch class_method com.target.app.Auth.checkPin # watch a method
android filesystem ls /data/data/com.target.app/  # list app files
android keystore list              # list keystore entries
```

## Insecure Data Storage

```bash
# App data location (requires root or ADB backup)
adb shell "run-as com.target.app ls /data/data/com.target.app/"

# Databases
adb shell "run-as com.target.app ls /data/data/com.target.app/databases/"
adb pull /data/data/com.target.app/databases/app.db
sqlite3 app.db
.tables
SELECT * FROM users;

# Shared Preferences (XML files with key-value pairs)
adb shell "run-as com.target.app cat /data/data/com.target.app/shared_prefs/UserPrefs.xml"

# Look for:
# - Stored credentials, tokens, API keys
# - Sensitive PII
# - Unencrypted database

# External storage (SD card — no access controls)
adb shell ls /sdcard/Android/data/com.target.app/
```

## iOS App Testing

```bash
# Tools needed:
# - Jailbroken device (or Corellium for virtual iOS)
# - ipa file (from App Store with Apple Configurator, or sideloaded)

# Unpack IPA
cp app.ipa app.zip
unzip app.zip -d app/
cd app/Payload/App.app/

# Strings from binary
strings App | grep -iE "(api_key|secret|password|bearer|http)"

# Class-dump — extract Objective-C class headers
class-dump -H App -o headers/

# Frida on iOS (jailbroken)
# Install Frida via Cydia
frida-ps -U
frida -U -n "Target App" -l ssl_bypass.js

# Objection iOS
objection -g "Target App" explore

# iOS commands in objection:
ios sslpinning disable
ios keychain dump
ios nsuserdefaults get
ios filesystem ls /
ios hooking list classes
```

## Real Project: DVIA (Damn Vulnerable iOS Application)

```bash
# DVIA and DVIA-v2 on GitHub — intentionally vulnerable iOS apps
# Run in iOS Simulator or on device

# Challenges:
# 1. Bypass insecure data storage (check NSUserDefaults, Keychain)
# 2. SSL pinning bypass
# 3. Jailbreak detection bypass
# 4. Hardcoded credentials
# 5. Side-channel data leakage (screenshots, keyboard cache)
# 6. Binary protection challenges (anti-debugging)
```

## Android Testing with DIVA

```bash
# DIVA (Damn Insecure and Vulnerable App for Android)
# Download APK from GitHub
adb install diva-beta.apk

# Challenges:
# 1. Insecure Logging — find credentials in logcat
adb logcat | grep -i "cred\|pass\|token"

# 2. Hardcoded Issues — find secrets in decompiled code
jadx diva-beta.apk -d output/
grep -r "API_KEY\|password\|secret" output/

# 3. Insecure Data Storage
# Level 1: SharedPreferences
adb shell "run-as jakhar.aseem.diva cat /data/data/jakhar.aseem.diva/shared_prefs/jakhar.aseem.diva_preferences.xml"

# Level 2: SQLite database
adb pull /data/data/jakhar.aseem.diva/databases/ids2
sqlite3 ids2 "SELECT * FROM sqliuser;"

# 4. Input Validation Issues
# SQL injection in app fields
# XSS in WebView
```
