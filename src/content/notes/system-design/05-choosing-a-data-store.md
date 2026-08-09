---
title: 'ডেটা স্টোর বেছে নেওয়া'
subtitle: 'Relational, document, key-value, wide-column, search, object storage — ফ্যাশন দেখে নয়, access pattern দেখে।'
chapter: 5
level: 'beginner'
readingTime: '১৯ মিনিট'
topics: ['databases', 'NoSQL', 'access patterns', 'object storage', 'polyglot persistence']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

রান্নাঘরে চাল থাকে বড় বস্তায়, মসলা থাকে ছোট কৌটায়, দুধ থাকে ফ্রিজে, আর আজকের রুটি থাকে হাতের কাছে ঢাকা দিয়ে। কেউ ফ্রিজে চালের বস্তা রাখে না, কেউ দুধ বস্তায় রাখে না। পাত্রটা ঠিক হয় জিনিসটা কেমন আর কতবার দরকার হয় — তার ওপর।

</Callout>

## গল্পে বুঝি

ফেজ শহরে ফাতিমা আল-ফিহরি একটা বড় মাদ্রাসা চালান। সেখানে জিনিসপত্র রাখার ব্যবস্থা দেখলে ডেটা স্টোর বাছাইয়ের পুরো তত্ত্বটা চোখে ধরা পড়ে।

**হিসাবের দপ্তর।** প্রতিটা ছাত্রের ভর্তি, প্রতিটা বেতন, প্রতিটা অনুদান — সব একটা বাঁধানো লেজারে, নির্দিষ্ট কলামে, নির্দিষ্ট নিয়মে। কেউ ইচ্ছেমতো নতুন কলাম যোগ করতে পারে না। এক পাতায় টাকা কেটে অন্য পাতায় জমা না দেখালে হিসাব মেলে না — দুইটা একসাথে হয়, নয়তো কোনোটাই না। কড়া কাঠামো, কড়া নিয়ম, এবং যেকোনো প্রশ্নের উত্তর বের করা যায়: "গত বছর কর্ডোবা থেকে আসা ছাত্রদের মোট বেতন কত?" — এটাই **relational database**, তার **schema**, তার **transaction**, আর তার **ad-hoc query**-র ক্ষমতা।

**ছাত্রদের ব্যক্তিগত ফাইল।** প্রতিটা ছাত্রের একটা করে খাম। ভেতরে যা যা আছে তা একেকজনের একেক রকম — কারো তিনটা সুপারিশপত্র, কারো একটা; কারো চিকিৎসার কাগজ আছে, কারো নেই। কিন্তু খামটা পুরোটা একসাথেই দরকার হয় — কেউ একজনের সুপারিশপত্র আলাদা করে চায় না। এটাই **document database**: নমনীয় কাঠামো, আর পুরো ডকুমেন্ট একসাথে পড়া-লেখা।

**চাবির বোর্ড।** দরজার পাশে একটা বোর্ড, প্রতিটা হুকে নম্বর লেখা, হুকে চাবি ঝোলানো। "১৭ নম্বর" বললেই চাবি — কোনো খোঁজাখুঁজি নেই। কিন্তু "কোন কোন চাবি পিতলের?" জিজ্ঞেস করলে পুরো বোর্ড দেখা ছাড়া উপায় নেই। এটাই **key-value store**: জানা key দিয়ে বিদ্যুৎগতিতে, অন্য যেকোনো প্রশ্নে অসহায়।

**উপস্থিতির রেজিস্টার।** প্রতিদিন প্রতিটা ছাত্রের জন্য একটা করে দাগ। বছরে লাখ লাখ এন্ট্রি, শুধু যোগ হয়, কখনো বদলায় না। খোঁজার ধরন সবসময় একই: "এই ছাত্রের গত তিন মাস দেখাও।" তাই রেজিস্টার সাজানো ছাত্র অনুযায়ী, ভেতরে তারিখ অনুযায়ী। এটাই **wide-column store**: বিপুল লেখা, নির্দিষ্ট ও পূর্বজানা খোঁজার ধরন।

**গ্রন্থাগারের বিষয়-সূচি।** কেউ এসে বলে "চোখের চিকিৎসা নিয়ে কিছু আছে?" — বইয়ের নাম জানে না, লেখক জানে না। একটা আলাদা কার্ড-বাক্স আছে যেখানে প্রতিটা গুরুত্বপূর্ণ শব্দের নিচে সেই শব্দ যেসব বইয়ে আছে তার তালিকা। এই বাক্সটা মূল সংগ্রহ নয় — এটা মূল সংগ্রহ থেকে বানানো একটা সহায়ক ব্যবস্থা, আর নতুন বই এলে এটা আপডেট করতে হয়। এটাই **search index**: **inverted index**, আর মূল ডেটা থেকে **derived** বলে এটা কখনোই সত্যের উৎস নয়।

**গুদামঘর।** পুরনো পাণ্ডুলিপি, বড় মানচিত্র, কাপড়ের বান্ডিল — বিশাল জিনিস, কম দরকার হয়, সস্তা জায়গায় রাখা। প্রতিটার গায়ে একটা লেবেল, আর দপ্তরের খাতায় লেখা আছে কোন লেবেল কোথায়। এটাই **object storage**: বড় blob সস্তায়, আর তার **key** থাকে ডেটাবেসে।

মিলিয়ে নিই: হিসাবের লেজার **relational**, ছাত্রের খাম **document**, চাবির বোর্ড **key-value**, উপস্থিতির রেজিস্টার **wide-column**, বিষয়-সূচি **search index**, গুদামঘর **object storage**। এবং সবচেয়ে গুরুত্বপূর্ণ কথাটা: **ফাতিমা এই ছয়টার একটাও বাদ দেননি, আবার একটা দিয়ে সবগুলোর কাজও করাননি।** প্রতিটা জিনিস তার নিজের পাত্রে। এটাই **polyglot persistence**।

## ভুল প্রশ্ন, সঠিক প্রশ্ন

**ভুল প্রশ্ন:** "SQL না NoSQL?"

এই প্রশ্নটার কোনো অর্থ নেই। "NoSQL" শব্দটা একটা বিপণন শব্দ যা সম্পূর্ণ ভিন্ন ছয়-সাত রকমের ডেটাবেসকে এক দলে ফেলে। MongoDB আর Cassandra-র মধ্যে যত পার্থক্য, PostgreSQL আর MongoDB-র মধ্যে তার চেয়ে কম।

**সঠিক প্রশ্ন:** আমার ডেটা কীভাবে _লেখা_ হয়, আর কীভাবে _পড়া_ হয়?

এই দুইটার উত্তর জানলে স্টোর নিজেই বেরিয়ে আসে। নিচের সাতটা প্রশ্ন সবসময় জিজ্ঞেস করুন:

1. **আমি কীভাবে খুঁজব?** — সবসময় একটা জানা id দিয়ে? নাকি ইচ্ছেমতো ফিল্ড দিয়ে? নাকি টেক্সট দিয়ে?
2. **ডেটার আকৃতি কি স্থির?** — সব রেকর্ডে একই ফিল্ড, নাকি একেকটায় একেক রকম?
3. **সম্পর্ক কতটা গভীর?** — একটা জিনিস আনতে কি পাঁচটা টেবিল জোড়া লাগে?
4. **একাধিক জিনিস একসাথে বদলাতে হয়?** — টাকা এক অ্যাকাউন্ট থেকে আরেকটায়? তাহলে transaction দরকার।
5. **Read না write বেশি?** — এবং কত বেশি?
6. **কত বড় হবে?** — এক মেশিনে ধরবে, নাকি ধরবে না?
7. **কতটা পুরনো ডেটা মেনে নেওয়া যায়?** — strong consistency লাগবে, নাকি eventual চলবে?

<Callout type="warning">

**একটা ডেটাবেস বাছাই সবচেয়ে কঠিনভাবে ফেরানো সিদ্ধান্তগুলোর একটা।** কোড বদলানো যায়, ফ্রেমওয়ার্ক বদলানো যায়, এমনকি ক্লাউড প্রোভাইডারও বদলানো যায়। কিন্তু ৫০ কোটি row অন্য মডেলে সরানো মাসের কাজ। তাই এখানে "ট্রেন্ডি" নয়, "আমার access pattern-এর সাথে খাপ খায়" দেখে বাছুন।

</Callout>

## ছয় রকম স্টোর

<Mermaid
title="Access pattern থেকে স্টোর"
code={`graph TB
  Q["কীভাবে পড়বেন?"] --> A["জানা key দিয়ে, শুধু<br/>Key-Value"]
  Q --> B["ইচ্ছেমতো ফিল্ড, JOIN সহ<br/>Relational"]
  Q --> C["পুরো ডকুমেন্ট একসাথে<br/>Document"]
  Q --> D["partition key + range<br/>Wide-Column"]
  Q --> E["টেক্সট / relevance<br/>Search Index"]
  Q --> F["বড় ফাইল, HTTP-তে<br/>Object Storage"]`}
/>

### ১. Relational (PostgreSQL, MySQL)

**মডেল:** নির্দিষ্ট কলামসহ টেবিল, টেবিলের মধ্যে সম্পর্ক, SQL দিয়ে যেকোনো প্রশ্ন।

**সবচেয়ে ভালো যখন:** ডেটার মধ্যে সম্পর্ক আছে; একাধিক জিনিস একসাথে বদলাতে হয় (transaction); আপনি এখনো জানেন না ভবিষ্যতে কী কী প্রশ্ন করবেন।

**দুর্বলতা:** একটা মেশিনের সীমা পেরোলে scale করা কঠিন; schema বদলাতে সাবধানতা লাগে; খুব বেশি write-heavy হলে চাপে পড়ে।

**যা মানুষ ভুলে যায়:** আধুনিক PostgreSQL-এ JSON কলাম আছে, full-text search আছে, array আছে, এমনকি ভালো mediocre-স্কেলের time-series সাপোর্টও আছে। **বেশিরভাগ প্রোজেক্টে "আমার একটা document DB দরকার" আসলে "আমার একটা JSONB কলাম দরকার"।**

### ২. Document (MongoDB, DynamoDB-র document মোড, CouchDB)

**মডেল:** JSON-সদৃশ ডকুমেন্ট, প্রতিটা স্বয়ংসম্পূর্ণ, নমনীয় কাঠামো।

**সবচেয়ে ভালো যখন:** প্রতিটা এন্টিটি স্বয়ংসম্পূর্ণ এবং একসাথেই পড়া/লেখা হয়; আকৃতি একেকটার একেক রকম (যেমন প্রোডাক্ট ক্যাটালগ — জামার সাইজ আছে, ল্যাপটপের RAM আছে); কাঠামো দ্রুত বদলায়।

**দুর্বলতা:** ডকুমেন্টের সীমানা পেরিয়ে জোড়া লাগানো কঠিন; ডেটা ডুপ্লিকেট হয় এবং সেগুলো সিঙ্কে রাখা আপনার দায়িত্ব; একাধিক ডকুমেন্ট জুড়ে transaction ব্যয়বহুল।

**নিয়ম:** যদি এক ডকুমেন্ট আনতে গিয়ে আপনাকে আরও তিনটা ডকুমেন্ট আনতে হয় এবং হাতে জোড়া লাগাতে হয় — আপনি ভুল স্টোর বেছেছেন, ওটা relational-এর কাজ।

### ৩. Key-Value (Redis, Memcached, DynamoDB, etcd)

**মডেল:** একটা key, একটা value। ব্যস।

**সবচেয়ে ভালো যখন:** সবসময় জানা key দিয়ে খুঁজবেন; দরকার চরম গতি; session, cache, counter, rate limit, feature flag, leaderboard।

**দুর্বলতা:** key ছাড়া কোনো খোঁজা নেই; সম্পর্ক নেই; বেশিরভাগ (Redis সহ) মেমরিভিত্তিক, তাই ডেটা মেমরিতে ধরতে হবে।

**একটা ভুল ধারণা:** Redis শুধু cache নয় — এতে list, set, sorted set, stream আছে, আর persistence-ও আছে। কিন্তু সত্যের একমাত্র উৎস হিসেবে Redis ব্যবহার করা সাধারণত ভুল সিদ্ধান্ত।

### ৪. Wide-Column (Cassandra, ScyllaDB, HBase, Bigtable)

**মডেল:** partition key দিয়ে সারি ভাগ, প্রতিটা partition-এর ভেতরে clustering key দিয়ে সাজানো।

**সবচেয়ে ভালো যখন:** বিপুল পরিমাণ write; আগে থেকেই সব query pattern জানা; time-series, event log, মেসেজ ইতিহাস, IoT সেন্সর ডেটা; এক মেশিনে ধরবে না এমন আকার।

**দুর্বলতা:** **query pattern আগে ঠিক করে তারপর টেবিল বানাতে হয়** — উল্টোটা করা যায় না। নতুন ধরনের প্রশ্ন এলে নতুন টেবিল লিখে পুরনো ডেটা আবার লিখতে হয়। JOIN নেই। Ad-hoc বিশ্লেষণ নেই। Eventual consistency।

**কখন বাছবেন না:** যখন আপনি এখনো জানেন না ডেটা দিয়ে কী করবেন। Cassandra অনমনীয়তার বিনিময়ে scale দেয়।

### ৫. Search Index (Elasticsearch, OpenSearch, Meilisearch, Typesense)

**মডেল:** inverted index — শব্দ থেকে ডকুমেন্টের তালিকা, সাথে relevance স্কোর।

**সবচেয়ে ভালো যখন:** টেক্সট খোঁজা, ভুল বানান সহনশীলতা, autocomplete, facet, relevance অনুযায়ী সাজানো।

**দুর্বলতা:** **এটা সত্যের উৎস নয়, কখনোই নয়।** এটা আপনার আসল ডেটাবেস থেকে বানানো একটা derived কপি, যেটা হারিয়ে গেলে আবার বানানো যায়। এখানে transaction নেই, এবং ইনডেক্স আপডেট eventual।

**সাধারণ ভুল:** প্রোডাক্ট ক্যাটালগের একমাত্র কপি Elasticsearch-এ রাখা। তারপর একদিন index নষ্ট হলে ব্যবসাটাই থেমে যায়।

### ৬. Object Storage (S3, R2, GCS, MinIO)

**মডেল:** key দিয়ে বড় বাইট-ব্লব, HTTP দিয়ে সরাসরি সার্ভ করা যায়।

**সবচেয়ে ভালো যখন:** ছবি, ভিডিও, PDF, ব্যাকআপ, লগ আর্কাইভ, তৈরি করা রিপোর্ট — অর্থাৎ যেকোনো কিছু যা ডেটাবেসের row-তে রাখলে ডেটাবেসকে কাঁদায়।

**দুর্বলতা:** partial update নেই (পুরো object আবার লিখতে হয়); latency ডেটাবেসের চেয়ে বেশি (১০-১০০ ms); কোনো query নেই — শুধু key।

**নিয়ম:** **কখনো ডেটাবেসে বড় বাইনারি রাখবেন না।** ব্লব যায় object storage-এ, আর তার key যায় ডেটাবেসে। ব্যতিক্রম শুধু কয়েক কিলোবাইটের ছোট জিনিস।

## এক নজরে তুলনা

|                  | Relational | Document | Key-Value | Wide-Column | Search | Object       |
| ---------------- | ---------- | -------- | --------- | ----------- | ------ | ------------ |
| Key দিয়ে খোঁজা  | ভালো       | ভালো     | চমৎকার    | চমৎকার      | ভালো   | চমৎকার       |
| ইচ্ছেমতো query   | চমৎকার     | মোটামুটি | নেই       | নেই         | ভালো   | নেই          |
| JOIN / সম্পর্ক   | চমৎকার     | দুর্বল   | নেই       | নেই         | নেই    | নেই          |
| Transaction      | চমৎকার     | সীমিত    | সীমিত     | দুর্বল      | নেই    | নেই          |
| Write throughput | মাঝারি     | ভালো     | চমৎকার    | চমৎকার      | মাঝারি | ভালো         |
| আনুভূমিক scale   | কঠিন       | ভালো     | চমৎকার    | চমৎকার      | ভালো   | সীমাহীন      |
| Schema নমনীয়তা  | কম         | বেশি     | সর্বোচ্চ  | মাঝারি      | মাঝারি | প্রযোজ্য নয় |

<Callout type="tip">

**PostgreSQL দিয়ে শুরু করুন।** এটা কোনো রক্ষণশীলতা নয় — এটা পরিসংখ্যান। PostgreSQL relational কাজ করে, JSONB দিয়ে document কাজ করে, `hstore`/`unlogged table` দিয়ে হালকা key-value কাজ করে, full-text search করে, এমনকি extension দিয়ে time-series আর vector search-ও করে। যতক্ষণ না আপনার কাছে একটা নির্দিষ্ট, পরিমাপ করা কারণ থাকে — একটাই ডেটাবেস চালানো তিনটা চালানোর চেয়ে অনেক সস্তা।

</Callout>

## Access pattern থেকে সিদ্ধান্ত — তিনটা বাস্তব উদাহরণ

### উদাহরণ ১: URL shortener

- **Write:** দিনে ১০ লাখ নতুন লিংক, প্রতিটা ছোট
- **Read:** দিনে ১০ কোটি redirect, সবসময় **জানা short code দিয়ে**
- **Query:** শুধু "এই code-এর মূল URL কী?" — আর কিছু নয়
- **Consistency:** নতুন লিংক সাথে সাথে কাজ করা উচিত

**সিদ্ধান্ত:** সত্যের উৎস relational (মালিকানা, মেয়াদ, বিশ্লেষণের সাথে জোড়া লাগে), আর সামনে একটা key-value cache — কারণ hot path-টা বিশুদ্ধ key lookup। ৯৯% redirect cache থেকেই যাবে।

### উদাহরণ ২: চ্যাট অ্যাপের মেসেজ ইতিহাস

- **Write:** সেকেন্ডে ৫০,০০০ মেসেজ, শুধু append
- **Read:** সবসময় "এই conversation-এর শেষ ৫০টা মেসেজ"
- **Query:** ঠিক একটাই ধরন, এবং সেটা কখনো বদলাবে না
- **আকার:** বছরে TB-স্কেল

**সিদ্ধান্ত:** wide-column। partition key হবে `conversation_id`, clustering key হবে `message_id` (সময়ানুক্রমে নামা)। ঠিক এই একটা query-র জন্য নিখুঁত, এবং write throughput যত খুশি বাড়ানো যায়।

### উদাহরণ ৩: ই-কমার্স অর্ডার

- **Write:** দিনে ৫০,০০০ অর্ডার
- **Read:** অর্ডারের ইতিহাস, অ্যাডমিন রিপোর্ট, রিফান্ড, হিসাব মেলানো
- **Query:** ইচ্ছেমতো — "গত মাসে দামেস্কে কত অর্ডার বাতিল হয়েছে?"
- **Transaction:** অর্ডার তৈরি + ইনভেন্টরি কমানো + পেমেন্ট — সব একসাথে হতে হবে

**সিদ্ধান্ত:** relational, কোনো আলোচনার দরকার নেই। দিনে ৫০,০০০ অর্ডার মানে সেকেন্ডে একটারও কম — scale এখানে কোনো ইস্যুই নয়, কিন্তু correctness আর ইচ্ছেমতো query-র দাবি প্রবল।

## Polyglot persistence — বাস্তবে একাধিক স্টোর

বাস্তব সিস্টেমে একটা এন্টিটির বিভিন্ন অংশ বিভিন্ন স্টোরে থাকে। নিচের কোডটা সেই সমন্বয়টা দেখায়: একটা "পাণ্ডুলিপি প্রকাশ" করার সময় মেটাডেটা যায় relational-এ, ফাইল যায় object storage-এ, খোঁজার ডকুমেন্ট যায় search index-এ, আর জনপ্রিয়তার কাউন্টার যায় key-value-তে।

গুরুত্বপূর্ণ অংশটা কোন স্টোর ব্যবহার হচ্ছে তা নয় — গুরুত্বপূর্ণ হলো **কোনটা সত্যের উৎস আর কোনটা derived**, এবং derived জিনিসগুলো ব্যর্থ হলে কী হয়।

```typescript
// ---------------------------------------------------------------------------
// Polyglot persistence, done deliberately.
//
//   relational  -> source of truth for metadata (transactional)
//   object      -> the manuscript file itself (large, immutable)
//   search      -> derived index, rebuildable, never authoritative
//   key-value   -> hot counters and cached reads, disposable
//
// The rule the code enforces: a failure in a DERIVED store must never fail the
// write. It must only make the derived view temporarily wrong.
// ---------------------------------------------------------------------------

export interface Manuscript {
	id: string;
	title: string;
	author: string;
	city: string;
	language: string;
	pageCount: number;
	storageKey: string; // where the scan lives in object storage
	publishedAt: string;
}

// --- Store interfaces ----------------------------------------------------

export interface RelationalStore {
	// Runs fn inside a transaction; either everything commits or nothing does.
	withTransaction<T>(fn: (tx: RelationalTx) => Promise<T>): Promise<T>;
	findById(id: string): Promise<Manuscript | null>;
	listByAuthor(author: string, limit: number): Promise<Manuscript[]>;
}

export interface RelationalTx {
	insertManuscript(m: Manuscript): Promise<void>;
	insertOutboxEvent(event: OutboxEvent): Promise<void>;
}

export interface ObjectStore {
	put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
	signedUrl(key: string, ttlSeconds: number): Promise<string>;
}

export interface SearchIndex {
	index(doc: SearchDoc): Promise<void>;
	query(text: string, limit: number): Promise<string[]>; // returns ids only
}

export interface KeyValueStore {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttlSeconds: number): Promise<void>;
	incr(key: string): Promise<number>;
	del(key: string): Promise<void>;
}

export interface SearchDoc {
	id: string;
	title: string;
	author: string;
	city: string;
	language: string;
}

export interface OutboxEvent {
	id: string;
	type: 'manuscript.published';
	payload: string;
	createdAt: string;
}

// --- The service ---------------------------------------------------------

export class ManuscriptService {
	constructor(
		private db: RelationalStore,
		private objects: ObjectStore,
		private search: SearchIndex,
		private kv: KeyValueStore
	) {}

	/**
	 * Publish order matters:
	 *   1. object storage first — a stored blob with no row is harmless garbage,
	 *      but a row pointing at a missing blob is a broken record.
	 *   2. relational commit — this is the moment the manuscript "exists".
	 *   3. search index — best effort; the outbox row guarantees it eventually
	 *      catches up even if this call fails right now.
	 */
	async publish(
		input: Omit<Manuscript, 'storageKey' | 'publishedAt'>,
		scan: Uint8Array
	): Promise<Manuscript> {
		const storageKey = `manuscripts/${input.id}/scan.pdf`;
		await this.objects.put(storageKey, scan, 'application/pdf');

		const manuscript: Manuscript = {
			...input,
			storageKey,
			publishedAt: new Date().toISOString()
		};

		await this.db.withTransaction(async (tx) => {
			await tx.insertManuscript(manuscript);
			// The outbox row commits atomically with the manuscript row, so the
			// search index can never permanently miss a published manuscript.
			await tx.insertOutboxEvent({
				id: `evt-${manuscript.id}`,
				type: 'manuscript.published',
				payload: JSON.stringify(manuscript),
				createdAt: manuscript.publishedAt
			});
		});

		// Derived write — allowed to fail without failing the request.
		try {
			await this.search.index(toSearchDoc(manuscript));
		} catch (err) {
			console.warn(
				JSON.stringify({
					level: 'warn',
					message: 'search index write failed, outbox will retry',
					manuscriptId: manuscript.id,
					error: String(err)
				})
			);
		}

		await this.kv.del(`author:${manuscript.author}:recent`);
		return manuscript;
	}

	/** Read path: cache first, relational on miss. Never search. */
	async get(id: string): Promise<Manuscript | null> {
		const cacheKey = `manuscript:${id}`;

		try {
			const cached = await this.kv.get(cacheKey);
			if (cached) return JSON.parse(cached) as Manuscript;
		} catch {
			// A dead cache must degrade into a slow system, not a broken one.
		}

		const found = await this.db.findById(id);
		if (!found) return null;

		try {
			await this.kv.set(cacheKey, JSON.stringify(found), 300);
		} catch {
			/* ignore — populating the cache is never worth failing a read */
		}
		return found;
	}

	/**
	 * Search returns ids from the derived index, then the authoritative rows
	 * come from the relational store. This is the pattern that keeps a stale
	 * index from serving stale content: at worst you get a missing result, never
	 * a wrong one.
	 */
	async searchManuscripts(text: string, limit = 20): Promise<Manuscript[]> {
		const ids = await this.search.query(text, limit);
		const rows = await Promise.all(ids.map((id) => this.db.findById(id)));
		return rows.filter((r): r is Manuscript => r !== null);
	}

	async recordView(id: string): Promise<number> {
		// Counters in a key-value store: cheap, fast, and acceptable to lose.
		// If exact view counts mattered financially, this would be an event
		// stream, not an incr.
		return this.kv.incr(`manuscript:${id}:views`);
	}

	async downloadUrl(id: string): Promise<string | null> {
		const m = await this.get(id);
		if (!m) return null;
		return this.objects.signedUrl(m.storageKey, 600);
	}
}

function toSearchDoc(m: Manuscript): SearchDoc {
	return { id: m.id, title: m.title, author: m.author, city: m.city, language: m.language };
}

// --- A tiny in-memory implementation so the shape is runnable ------------

class MemoryRelational implements RelationalStore {
	private rows = new Map<string, Manuscript>();
	private outbox: OutboxEvent[] = [];

	async withTransaction<T>(fn: (tx: RelationalTx) => Promise<T>): Promise<T> {
		const stagedRows: Manuscript[] = [];
		const stagedEvents: OutboxEvent[] = [];
		const tx: RelationalTx = {
			insertManuscript: async (m) => {
				stagedRows.push(m);
			},
			insertOutboxEvent: async (e) => {
				stagedEvents.push(e);
			}
		};
		const result = await fn(tx);
		// commit
		for (const m of stagedRows) this.rows.set(m.id, m);
		this.outbox.push(...stagedEvents);
		return result;
	}

	async findById(id: string): Promise<Manuscript | null> {
		return this.rows.get(id) ?? null;
	}

	async listByAuthor(author: string, limit: number): Promise<Manuscript[]> {
		return [...this.rows.values()].filter((m) => m.author === author).slice(0, limit);
	}
}

class MemorySearch implements SearchIndex {
	private docs = new Map<string, SearchDoc>();

	async index(doc: SearchDoc): Promise<void> {
		this.docs.set(doc.id, doc);
	}

	async query(text: string, limit: number): Promise<string[]> {
		const needle = text.toLowerCase();
		return [...this.docs.values()]
			.filter((d) =>
				[d.title, d.author, d.city, d.language].some((f) => f.toLowerCase().includes(needle))
			)
			.slice(0, limit)
			.map((d) => d.id);
	}
}

class MemoryKV implements KeyValueStore {
	private data = new Map<string, { value: string; expiresAt: number }>();

	async get(key: string): Promise<string | null> {
		const entry = this.data.get(key);
		if (!entry || Date.now() > entry.expiresAt) return null;
		return entry.value;
	}
	async set(key: string, value: string, ttlSeconds: number): Promise<void> {
		this.data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
	}
	async incr(key: string): Promise<number> {
		const current = Number((await this.get(key)) ?? '0');
		const next = current + 1;
		await this.set(key, String(next), 86_400);
		return next;
	}
	async del(key: string): Promise<void> {
		this.data.delete(key);
	}
}

class MemoryObjects implements ObjectStore {
	private blobs = new Map<string, Uint8Array>();
	async put(key: string, bytes: Uint8Array): Promise<void> {
		this.blobs.set(key, bytes);
	}
	async signedUrl(key: string, ttlSeconds: number): Promise<string> {
		return `https://cdn.example/${key}?expires=${Math.floor(Date.now() / 1000) + ttlSeconds}`;
	}
}

// --- Demo ----------------------------------------------------------------

async function demo(): Promise<void> {
	const service = new ManuscriptService(
		new MemoryRelational(),
		new MemoryObjects(),
		new MemorySearch(),
		new MemoryKV()
	);

	await service.publish(
		{
			id: 'ms-001',
			title: 'Kitab al-Manazir',
			author: 'Ibn al-Haytham',
			city: 'Cairo',
			language: 'Arabic',
			pageCount: 412
		},
		new Uint8Array([1, 2, 3])
	);

	await service.publish(
		{
			id: 'ms-002',
			title: 'Al-Jabr wa-l-Muqabala',
			author: 'Al-Khwarizmi',
			city: 'Baghdad',
			language: 'Arabic',
			pageCount: 210
		},
		new Uint8Array([4, 5, 6])
	);

	console.log(await service.get('ms-001'));
	console.log(await service.searchManuscripts('baghdad'));
	console.log('views:', await service.recordView('ms-001'));
	console.log(await service.downloadUrl('ms-002'));
}

demo().catch(console.error);
```

## কোডটা থেকে যে নিয়মগুলো বের হলো

**সত্যের উৎস একটাই।** প্রতিটা তথ্যের জন্য ঠিক একটা স্টোর কর্তৃত্বশীল। বাকি সব copy বা derived। কোন স্টোরটা কর্তৃত্বশীল সেটা যদি বলতে না পারেন, আপনার একটা ডেটা-সংগতির সমস্যা অপেক্ষা করছে।

**Derived স্টোরের ব্যর্থতা মূল কাজ থামাতে পারবে না।** Search index লিখতে ব্যর্থ হলে প্রকাশনাটা ব্যর্থ হয় না — শুধু কিছুক্ষণ খোঁজায় আসে না।

**Derived স্টোর থেকে কখনো সরাসরি কনটেন্ট সার্ভ করবেন না।** Search index থেকে শুধু id নিন, তারপর আসল row ডেটাবেস থেকে। এতে সবচেয়ে খারাপ ফলাফল হয় "একটা জিনিস খুঁজে পাওয়া গেল না", কখনো "ভুল তথ্য দেখানো হলো"।

**Cache-এর ব্যর্থতা সিস্টেমকে ধীর করবে, ভাঙবে না।** `try/catch` দিয়ে cache-এর কল ঘিরে রাখাটা অলসতা নয়, নকশা।

**লেখার ক্রম গুরুত্বপূর্ণ।** Blob আগে, তারপর row। উল্টো করলে row থাকবে কিন্তু ফাইল থাকবে না — যা অনেক খারাপ, কারণ ইউজার সেটা দেখতে পাবে।

<Callout type="warning">

দুইটা স্টোরে লিখতে গেলে মাঝখানে ক্র্যাশ করতে পারে — এটাই **dual-write সমস্যা**। এর সমাধান distributed transaction নয় (সেটা ধীর ও ভঙ্গুর), সমাধান হলো **outbox pattern**: মূল ডেটার সাথে একই transaction-এ একটা event row লিখুন, তারপর আলাদা একটা প্রসেস সেই row পড়ে বাকি স্টোরগুলো আপডেট করে। উপরের কোডে সেটার ভিত্তি রাখা আছে; পুরো প্যাটার্ন চ্যাপ্টার ২১-এ।

</Callout>

## বাছাই করার সময় যে ভুলগুলো হয়

**"এটা স্কেল করে" শুনে বাছা।** Cassandra স্কেল করে — অনমনীয়তার বিনিময়ে। আপনার যদি স্কেলের সমস্যা না থাকে, আপনি শুধু অনমনীয়তাটাই কিনলেন।

**প্রতিটা নতুন ফিচারের জন্য নতুন ডেটাবেস।** প্রতিটা অতিরিক্ত স্টোর মানে আরেকটা জিনিস মনিটর করা, ব্যাকআপ নেওয়া, আপগ্রেড করা, আর রাত তিনটায় ডিবাগ করা। তিনজনের টিমে চারটা ডেটাবেস মানে কেউ কোনোটাই ভালো জানে না।

**Schema-less মানে ডিজাইন লাগে না ভাবা।** Document ডেটাবেসে schema থাকেই — শুধু সেটা ডেটাবেসের বদলে আপনার কোডে থাকে, এবং সেখানে কেউ সেটা যাচাই করে না।

**ডেটাবেসে ফাইল রাখা।** ৫ MB-র ছবি row-তে রাখলে ব্যাকআপ ফুলে যায়, replication ধীর হয়, buffer cache নষ্ট হয়।

**একটা মেশিনের ক্ষমতা কম আঁকা।** আধুনিক NVMe SSD-সহ একটা সার্ভারে PostgreSQL দিব্যি কয়েক TB আর কয়েক হাজার QPS সামলায়। "একটা ডেটাবেস যথেষ্ট নয়" — এই সিদ্ধান্তে পৌঁছানোর আগে মেপে দেখুন।

<div class="takeaways">

### মূল শেখা

- "SQL না NoSQL" ভুল প্রশ্ন; সঠিক প্রশ্ন হলো ডেটা কীভাবে লেখা হয় আর কীভাবে পড়া হয়
- Key-value চরম দ্রুত কিন্তু শুধু জানা key-তে; relational ইচ্ছেমতো query আর transaction দেয়; wide-column বিপুল write দেয় কিন্তু query pattern আগে থেকে ঠিক থাকতে হয়
- Search index সবসময় derived — সত্যের উৎস কখনো নয়, এবং সেখান থেকে সরাসরি কনটেন্ট সার্ভ করবেন না
- বড় ফাইল object storage-এ, তার key ডেটাবেসে — ব্যতিক্রম নেই
- একটা সিস্টেমে একাধিক স্টোর থাকা স্বাভাবিক, কিন্তু প্রতিটা তথ্যের জন্য ঠিক একটা কর্তৃত্বশীল উৎস থাকতে হবে
- Derived স্টোরের ব্যর্থতা মূল write ব্যর্থ করবে না; cache-এর ব্যর্থতা সিস্টেমকে ধীর করবে, ভাঙবে না
- দুই স্টোরে লেখার সমস্যার সমাধান outbox pattern, distributed transaction নয়
- সন্দেহ হলে PostgreSQL দিয়ে শুরু করুন এবং সরানোর কারণটা মেপে প্রমাণ করুন

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **নতুন সার্ভিসের ডিজাইনে** — সাতটা access-pattern প্রশ্ন দিয়ে স্টোর বাছাই, এবং সেই যুক্তিটা ডিজাইন ডকে লিখে রাখা
- **যখন কেউ নতুন ডেটাবেস আনতে চায়** — "বিদ্যমান স্টোরে কেন হবে না" প্রশ্নটা করে অপ্রয়োজনীয় অপারেশনাল বোঝা ঠেকানো
- **মিডিয়া-ভারী প্রোডাক্টে** — blob object storage-এ সরিয়ে ডেটাবেসের আকার ও ব্যাকআপ সময় নাটকীয়ভাবে কমানো
- **Search যোগ করার সময়** — index-কে derived রেখে rebuild করার স্ক্রিপ্ট প্রথম দিনেই লিখে রাখা
- **Incident-এর পরে** — কোন স্টোরের ব্যর্থতা কোন ফিচার নামিয়ে দিল, তা দেখে derived/cache পথগুলোতে graceful degradation বসানো

</div>
