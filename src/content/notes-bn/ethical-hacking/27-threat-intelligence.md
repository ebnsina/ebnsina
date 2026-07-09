---
title: 'Threat Intelligence & MITRE ATT&CK'
subtitle: 'IOC, threat actor profiling, STIX/TAXII, ATT&CK Navigator, intelligence দিয়ে threat hunting, এবং একটা threat intel program গড়ে তোলা।'
chapter: 27
level: 'intermediate'
readingTime: '10 মিনিট'
topics:
  [
    'threat intelligence',
    'MITRE ATT&CK',
    'IOC',
    'STIX',
    'TAXII',
    'threat hunting',
    'APT',
    'threat actor',
    'CTI'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

গোয়েন্দা সংস্থাগুলো প্রতিপক্ষকে বোঝার জন্য attack-এর অপেক্ষা করে না — তারা আগেভাগেই তাদের profile তৈরি করে ফেলে। কোনো নির্দিষ্ট APT group যে spearphishing Word document দিয়ে healthcare-কে target করে, সেটা জানা থাকলে আপনি ঠিক সেই scenario-র জন্য আগেই defense শক্ত করতে পারবেন — তাদের নজরে পড়ার আগেই।

</Callout>

## MITRE ATT&CK Framework

ATT&CK (Adversarial Tactics, Techniques, and Common Knowledge) হলো adversary-দের আচরণ নিয়ে একটা globally-accessible knowledge base।

```
Structure:
  Tactic     → the adversary's goal (Initial Access, Execution, Persistence...)
  Technique  → how they achieve the goal (T1566 Phishing)
  Sub-technique → specific variant (T1566.001 Spearphishing Attachment)
  Procedure  → specific implementation by a specific APT group

14 Tactics (Enterprise):
  TA0001 Reconnaissance
  TA0002 Resource Development
  TA0003 Initial Access
  TA0004 Execution
  TA0005 Persistence
  TA0006 Privilege Escalation
  TA0007 Defense Evasion
  TA0008 Credential Access
  TA0009 Discovery
  TA0010 Lateral Movement
  TA0011 Collection
  TA0012 Command and Control
  TA0013 Exfiltration
  TA0014 Impact
```

### ATT&CK Navigator

```bash
# ATT&CK Navigator — visual heatmap of techniques
# https://mitre-attack.github.io/attack-navigator/

# Uses:
# 1. Map your defenses — color techniques where you have detection
# 2. Map known APT behavior — see what you're exposed to
# 3. Red team planning — pick techniques that match your threat actors
# 4. Gap analysis — where do you have no coverage?

# Example: APT29 (Cozy Bear) layer
# Download from MITRE: groups/G0016
# Load in Navigator → see their preferred techniques
# → tells you exactly what to defend against for this threat actor
```

## Indicator of Compromise (IOC) Types

```
Atomic indicators — standalone, easy to extract
  IP addresses:     93.184.216.34
  Domain names:     malicious-c2.example.com
  File hashes:      MD5, SHA1, SHA256 of malware
  Email addresses:  phisher@evil.com
  URL:              https://evil.com/payload.exe

Computed indicators — require analysis
  Mutex names:      Global\{GUID} created by specific malware family
  Registry keys:    HKCU\Software\malware_name\config
  Network signatures: user-agent strings, protocol patterns
  Behavioral indicators: "process spawns cmd.exe that downloads then executes"

Contextual indicators (most valuable, hardest to change)
  TTPs (Tactics, Techniques, Procedures)
  Adversary infrastructure patterns
  Attack tooling preferences (APT group X always uses Mimikatz + BloodHound)
```

## STIX/TAXII — Intelligence Sharing Standards

```python
# STIX (Structured Threat Information Expression) — JSON format for CTI
from stix2 import Indicator, Malware, Relationship, Bundle

# Create a malware indicator
malware = Malware(
    name="WannaCry",
    is_family=False,
    description="Ransomware that exploits MS17-010"
)

indicator = Indicator(
    name="WannaCry SHA256 hash",
    pattern="[file:hashes.SHA256 = '24d004a104d4d54034dbcffc2a4b19a11f39008a575aa614ea04703480b1022c']",
    pattern_type="stix",
    valid_from="2017-05-12T00:00:00Z"
)

relationship = Relationship(
    relationship_type="indicates",
    source_ref=indicator,
    target_ref=malware
)

bundle = Bundle(objects=[malware, indicator, relationship])
print(bundle.serialize(pretty=True))
```

```bash
# TAXII (Trusted Automated Exchange of Intelligence Information)
# Protocol for distributing STIX content

# TAXII client
pip install taxii2-client
python3 << EOF
from taxii2client.v20 import Server

server = Server('https://cti-taxii.mitre.org/taxii/', verify=True)
for api_root in server.api_roots:
    print(api_root.title)
    for collection in api_root.collections:
        print(f"  {collection.id}: {collection.title}")
EOF

# Get ATT&CK data via TAXII
python3 << EOF
from taxii2client.v20 import Collection
import json

collection = Collection("https://cti-taxii.mitre.org/stix/collections/95ecc380-afe9-11e4-9b6c-751b66dd541e/")
tc_source = collection.get_objects()
for obj in tc_source['objects'][:5]:
    print(obj.get('type'), obj.get('name', ''))
EOF
```

## Threat Intelligence Platforms

```bash
# MISP — Open Source Threat Intelligence Platform
# https://www.misp-project.org/

# Install MISP (Docker)
docker pull misp/misp-docker
# Or: use MISP Training VM

# Features:
# - IOC management and correlation
# - Sharing with trusted communities
# - Integration with SIEMs and firewalls
# - API for automation
# - Built-in taxonomies and galaxies

# PyMISP — Python API
pip install pymisp
from pymisp import PyMISP

misp = PyMISP('https://misp.yourdomain.com', 'YOUR_API_KEY')

# Search for an IOC
result = misp.search('attributes', value='malicious-domain.com', type_attribute='domain')
for attr in result['Attribute']:
    print(attr['value'], attr['comment'])

# Add an IOC
event = misp.new_event(info="Phishing campaign against Finance team")
misp.add_named_attribute(event, 'domain', 'phishing-site.example.com')
misp.add_named_attribute(event, 'ip-dst', '192.168.99.100')
```

## APT Group Profiles

বড় threat actor-দের বোঝা defense-এর priority ঠিক করতে সাহায্য করে:

```
APT28 (Fancy Bear) — Russia, GRU
  Targets:    Government, military, defense, elections
  TTPs:       Spearphishing, X-Agent malware, credential harvesting
  Known ops:  DNC hack 2016, Bundestag, WADA

APT29 (Cozy Bear) — Russia, SVR
  Targets:    Government, think tanks, healthcare, energy
  TTPs:       SolarWinds supply chain, WellMess, MiniDuke
  Known ops:  SolarWinds 2020, COVID-19 vaccine research theft

Lazarus Group — North Korea
  Targets:    Banks, cryptocurrency, defense
  TTPs:       WannaCry, SWIFT banking attacks, fake job postings
  Known ops:  Sony Pictures hack, $81M Bangladesh bank heist

APT41 (Double Dragon) — China (dual espionage + financial)
  Targets:    Healthcare, telecom, gaming, manufacturing
  TTPs:       Supply chain attacks, PlugX, Winnti
  Known ops:  Citrix exploitation, CCleaner supply chain

FIN7 — Criminal, Eastern Europe
  Targets:    Restaurants, hospitality, retail (payment card data)
  TTPs:       Spearphishing with malicious Word docs, Carbanak
  Known ops:  Chipotle, Red Robin, Arby's card data theft
```

## Threat Hunting with Intelligence

```python
# Hunting process:
# 1. Hypothesis — "We believe APT29 may have targeted us based on sector"
# 2. Intelligence — What are their TTPs? (ATT&CK G0016)
# 3. Data sources — What logs contain evidence of these TTPs?
# 4. Hunt — Query the data
# 5. Findings — Document and act

# Example hunt: APT29 uses PowerShell with encoded commands (T1059.001)
# Data source: Windows Event Log 4688 (Process Creation)

# Splunk query:
# index=windows EventCode=4688 ParentProcessName="winword.exe"
#   (ProcessName="powershell.exe" OR ProcessName="cmd.exe")
# | table _time, ComputerName, Account_Name, CommandLine
# | eval suspicion = if(match(CommandLine, "(?i)-enc|-EncodedCommand"), "HIGH", "MEDIUM")

# Hypothesis: compromised credentials being used from unusual geos
# Hunt: find logins from countries not in normal baseline
# index=auth action="success"
# | iplocation src_ip
# | stats count by Country, User
# | where Country != "United States" AND Country != "Canada"
```

## Building a CTI Program

```
Maturity levels:

Level 1 — Reactive (most organizations)
  - Subscribe to commercial threat feeds
  - Block known bad IPs/domains
  - Run commercial antivirus
  - No internal production of intelligence

Level 2 — Active
  - Consume and action threat feeds
  - Share IOCs with sector ISAC
  - Threat hunting based on external intel
  - Internal incident analysis produces IOCs

Level 3 — Proactive
  - Internal CTI team
  - Analyst-produced intelligence reports
  - Threat actor tracking
  - Proactive hunting before alerts
  - Contribute to community sharing

Level 4 — Leading
  - Predictive intelligence
  - Red team aligned to specific threat actors
  - Hunt program catches attackers before persistence
  - Intelligence-driven security program
```

## Free CTI Resources

```
MITRE ATT&CK          → attack.mitre.org
AlienVault OTX        → otx.alienvault.com
Abuse.ch              → threatfox.abuse.ch, urlhaus.abuse.ch, malwarebazaar.abuse.ch
VirusTotal            → virustotal.com (free tier)
Shodan                → shodan.io
Censys                → censys.io
Feodo Tracker         → feodotracker.abuse.ch (banking trojans)
URLScan.io            → urlscan.io
GreyNoise             → greynoise.io (internet background noise)
Robtex               → robtex.com (IP/domain investigation)
CIRCL                 → circl.lu/doc/misp/ (MISP training)
CISA Advisories       → cisa.gov/known-exploited-vulnerabilities-catalog
```
