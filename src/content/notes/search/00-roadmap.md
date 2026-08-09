---
title: 'Search — রোডম্যাপ'
subtitle: 'শূন্য থেকে একটা inverted index বানান। তারপর নিজে Meilisearch বা Elasticsearch সেল্ফ-হোস্ট করুন।'
chapter: 0
level: 'beginner'
readingTime: '3 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা বইয়ের index বনাম প্রতিটা পৃষ্ঠা পড়া: index ছাড়া "database" খুঁজতে গেলে প্রতিটা শব্দ স্ক্যান করতে হয়। একটা search engine-এর inverted index প্রতিটা শব্দকে সেই ডকুমেন্টগুলোর সাথে ম্যাপ করে যেগুলোতে শব্দটা আছে — লুকআপ তাৎক্ষণিক। এই স্ট্রাকচারটা বোঝা মানেই পরের সবকিছু বোঝা: কেন কিছু query দ্রুত, কেন typo tolerance-এর একটা খরচ আছে, কেন facet-এর জন্য বিশেষ ডেটা স্ট্রাকচার লাগে।

</Callout>

## আপনি যা শিখবেন

Search যেকোনো প্রোডাক্টের সবচেয়ে দৃশ্যমান ফিচারগুলোর একটা, আবার সবচেয়ে ভুল-বোঝা ফিচারগুলোরও একটা। এই ট্র্যাকটা শুরু হয় search engine আসলে কীভাবে কাজ করে সেখান থেকে — inverted index, tokenization, BM25 scoring — তারপর কভার করে Postgres full-text search (বেশিরভাগ ক্ষেত্রে যথেষ্ট ভালো), Meilisearch (typo-tolerant, সহজে সেল্ফ-হোস্ট করা যায়), Elasticsearch (জটিল aggregation, বিশাল স্কেল), এবং সময়ের সাথে search quality মাপা ও উন্নত করার প্র্যাক্টিক্যাল অভ্যাস।

## এই ট্র্যাকের চ্যাপ্টারগুলো

1. **How Search Works** — inverted index, tokenization, TF-IDF, BM25, phrase search
2. **Postgres Full-Text Search** — tsvector, GIN index, ranking, highlighting, autocomplete
3. **Meilisearch** — setup, indexing, typo tolerance, facet, Postgres-এর সাথে সিঙ্ক রাখা
4. **Elasticsearch** — mapping, analyzer, Query DSL, aggregation, production cluster
5. **Search in Practice** — relevance tuning, synonym, A/B testing, analytics, zero-results হ্যান্ডলিং
