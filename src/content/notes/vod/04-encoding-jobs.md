---
title: 'এনকোডিং জব অর্কেস্ট্রেশন'
subtitle: 'একটা আপলোড থেকে ডজনখানেক জব: River দিয়ে ট্রানজ্যাকশনের ভেতরে জব ঢোকানো, ইউনিক জব, রিট্রাই আর ক্যানসেল, রেন্ডিশন-প্রতি ফ্যান-আউট, শেষজনের হাতে প্যাকেজিং, প্রোগ্রেস, আর ভাঙা ফাইলকে ফ্লিট খেতে না দেওয়া।'
chapter: 4
level: 'intermediate'
readingTime: '২০ মিনিট'
topics: ['encoding jobs', 'river', 'job queue', 'retries', 'idempotency', 'fan-out', 'ffmpeg progress']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

বাংলাবাজারের এক ছাপাখানা চালায় বিরুনি। সকালে কাউন্টারে অর্ডার আসে: একটা প্রকাশকের ৫০০০ কপি গল্পের বই, একটা স্কুলের প্রশ্নপত্র যেটা পরশু সকালে লাগবে, একটা বিয়ের কার্ড। কাউন্টারে বসা হাইসাম প্রতিটা অর্ডার একটা রেজিস্টারে তোলে আর একটা অর্ডার স্লিপ লিখে মেশিনঘরের বোর্ডে ঝুলিয়ে দেয়। নিয়ম একটাই: রেজিস্টারে না উঠলে স্লিপ ঝোলে না, স্লিপ না ঝুললে মেশিন চলে না। একবার হাইসাম তাড়াহুড়োয় স্লিপ ঝুলিয়েছিল কিন্তু রেজিস্টারে তোলেনি, আর পরে কেউ জানত না বইগুলো কার, কত টাকা নেওয়া হয়েছে।

মেশিনঘরে চারটা অফসেট মেশিন, প্রতিটার একজন অপারেটর। অপারেটররা বোর্ড থেকে নিজেরাই স্লিপ নেয়, আর বোর্ড সাজানো থাকে ডেডলাইন অনুযায়ী: প্রশ্নপত্র সবার আগে, তারপর বিয়ের কার্ড, তারপর বই। একটা বড় বইয়ের অর্ডার বিরুনি চার ফর্মায় ভাগ করে দেয়, প্রতিটা ফর্মা আলাদা স্লিপ, যাতে চারটা মেশিন একসাথে চালানো যায়। চার ফর্মার যে শেষে ছাপা হয়, তার অপারেটর রেজিস্টারে টিক দিয়ে দেখে বাকি তিনটাও শেষ কিনা; শেষ হলে সে-ই বাঁধাইঘরে একটা নতুন স্লিপ পাঠায়।

ছাপার মাঝে কাগজ আটকে গেলে অপারেটর একটু পরে আবার চেষ্টা করে; দ্বিতীয়বারে প্রায় সবসময় ঠিক হয়ে যায়। কিন্তু একবার একটা অর্ডারের প্লেট নিজেই ভাঙা ছিল। অপারেটর তিনবার চেষ্টা করল, তিনবারই নষ্ট কাগজ। বিরুনির নিয়ম: প্লেট ভাঙা হলে আর চেষ্টা না, স্লিপটা আলাদা একটা লাল ফাইলে রাখো আর প্রকাশককে ফোন করো। নইলে একটা ভাঙা প্লেট সারাদিন একটা মেশিন আটকে রাখে আর পাঁচ রিম কাগজ খায়। আর কেউ একই অর্ডার দুবার দিয়ে ফেললে হাইসাম রেজিস্টার দেখে বলে, "এটা তো সকালেই নেওয়া হয়েছে", দ্বিতীয় স্লিপ ঝোলায় না।

মিলিয়ে নিই: রেজিস্টার হলো **PostgreSQL-এর অ্যাসেট টেবিল**, আর বোর্ডের স্লিপ হলো **জব কিউ**। "রেজিস্টারে না উঠলে স্লিপ ঝোলে না" হলো **একই ট্রানজ্যাকশনে অ্যাসেট আপডেট আর জব ইনসার্ট**। অপারেটররা হলো **ওয়ার্কার**, ডেডলাইন অনুযায়ী সাজানো হলো **প্রায়োরিটি আর আলাদা কিউ**। চার ফর্মায় ভাগ হলো **রেন্ডিশন-প্রতি ফ্যান-আউট**, আর শেষ ফর্মার অপারেটরের বাঁধাইঘরে স্লিপ পাঠানো হলো **ফ্যান-ইন: শেষ জব পরের ধাপ ঢোকায়**। কাগজ আটকানোর পর আবার চেষ্টা হলো **ক্ষণস্থায়ী এররে রিট্রাই**, ভাঙা প্লেট হলো **পয়জন ফাইল**, আর লাল ফাইল হলো **ক্যানসেল বা ডেড-লেটার**। একই অর্ডার দুবার না নেওয়া হলো **ইউনিক জব**। একটা VOD প্ল্যাটফর্মের এনকোডিং স্তর ঠিক এই ছাপাখানা।

## এই চ্যাপ্টার কী নিয়ে

পাইপলাইনের সাধারণ গঠন (probe, plan, encode, stitch, package; lease; আইডেম্পোটেন্সি কী; segment-parallel encoding) আছে [ট্রান্সকোডিং পাইপলাইন](/notes/video/04-transcoding-pipeline) চ্যাপ্টারে, আর রিট্রাইয়ের তত্ত্ব আছে [রিট্রাই ও ব্যাকঅফ](/notes/background-jobs/03-retries-and-backoff) আর [আইডেম্পোটেন্সি](/notes/background-jobs/04-idempotency) চ্যাপ্টারে। এখানে আমরা নির্দিষ্ট একটা টুল দিয়ে সেটা বাস্তবায়ন করব: **River**, PostgreSQL-এর উপর Go-র জব কিউ। কারণ আমাদের অ্যাসেট টেবিল আগেই PostgreSQL-এ, আর River জবও সেখানেই রাখে, তাই দুটো একই ট্রানজ্যাকশনে লেখা যায়। আলাদা Redis বা RabbitMQ লাগে না।

<Callout type="info">

নিচের River API (ফাংশনের নাম, ডিফল্ট মান) ২০২৬ সালের অক্টোবরে [riverqueue.com-এর ডকস](https://riverqueue.com/docs) থেকে যাচাই করা। River সক্রিয়ভাবে বদলাচ্ছে, তাই আপনার ভার্সনের ডকস আর চেঞ্জলগ দেখে নিন।

</Callout>

## জবের আকার: কী কী জব লাগে

<Mermaid
title="একটা অ্যাসেটের জব"
code={`graph TD
  UP["upload finished<br/>tx: asset to processing + insert"] --> I["ingest<br/>probe + decode check + plan"]
  I -->|"InsertManyTx, one per rung"| E1["encode 1080p"]
  I --> E2["encode 720p"]
  I --> E3["encode 480p"]
  I --> E4["encode 360p"]
  I --> T["thumbnails"]
  E1 --> F{"last rendition done?"}
  E2 --> F
  E3 --> F
  E4 --> F
  F -->|"yes, same tx"| P["package HLS + DASH"]
  P --> R["publish<br/>asset ready + webhook job"]`}
/>

| জব | কিউ | কত সময় | ব্যর্থ হলে |
| --- | --- | --- | --- |
| `ingest` | `ingest` | সেকেন্ড | ক্ষণস্থায়ী হলে রিট্রাই, ফাইল ভাঙা হলে ক্যানসেল |
| `encode` (রেন্ডিশন-প্রতি একটা) | `encode` | মিনিট থেকে ঘণ্টা | শুধু ওই রেন্ডিশন আবার |
| `thumbnails` | `light` | সেকেন্ড | রিট্রাই; অ্যাসেট `ready` হওয়া আটকায় না |
| `package` | `light` | সেকেন্ড থেকে মিনিট | রিট্রাই; এনকোড আবার লাগে না |
| `webhook` | `notify` | মিলিসেকেন্ড | অনেকবার রিট্রাই, ব্যাকঅফসহ |

আলাদা কিউয়ের কারণ সরল: একটা এক ঘণ্টার ৪K এনকোড যেন একটা ৫০ মিলিসেকেন্ডের webhook-কে আটকে না রাখে। প্রতিটা কিউয়ের নিজস্ব ওয়ার্কার সংখ্যা।

## ধাপ ১: অ্যাসেট আর জব একই ট্রানজ্যাকশনে

আপলোড শেষের হুক (চ্যাপ্টার ২) এই কাজটা করে:

```go
type IngestArgs struct {
	AssetID uuid.UUID `json:"asset_id"`
}

func (IngestArgs) Kind() string { return "ingest" }

func (IngestArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       "ingest",
		MaxAttempts: 5,
		// A second "upload finished" event for the same asset is a no-op.
		UniqueOpts: river.UniqueOpts{ByArgs: true},
	}
}

func (s *Service) MarkUploaded(ctx context.Context, assetID uuid.UUID, key string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE assets SET status = 'processing', source_key = $2, updated_at = now()
		WHERE id = $1 AND status IN ('created', 'uploading')`, assetID, key)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return nil // already moved on by an earlier delivery of this event
	}

	if _, err := s.river.InsertTx(ctx, tx, IngestArgs{AssetID: assetID}, nil); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
```

এখানে তিনটা সুরক্ষা একসাথে কাজ করছে:

1. **`InsertTx`**: জবটা ট্রানজ্যাকশন কমিট হওয়ার আগে কোনো ওয়ার্কার দেখতে পায় না, আর রোলব্যাক হলে জবটাও উধাও। "অ্যাসেট processing কিন্তু কোনো জব নেই" বা "জব চলছে কিন্তু অ্যাসেট এখনো uploading", এই দুই অবস্থা অসম্ভব।
2. **`WHERE status IN (...)`**: একই ইভেন্ট দুবার এলে দ্বিতীয়বার কিছুই বদলায় না।
3. **`UniqueOpts{ByArgs: true}`**: কোনো কারণে দুটো ইনসার্ট হলেও River একই আর্গুমেন্টের দ্বিতীয় জব ঢোকাবে না।

শেষ দুটো একই কাজ দুবার করছে মনে হতে পারে। করছে, ইচ্ছা করেই: প্রথমটা ডেটার সুরক্ষা, দ্বিতীয়টা কিউয়ের। একটায় বাগ থাকলে অন্যটা বাঁচায়।

## ধাপ ২: ইনজেস্ট জব, আর স্থায়ী বনাম ক্ষণস্থায়ী এরর

```go
type IngestWorker struct {
	river.WorkerDefaults[IngestArgs]
	svc *Service
}

func (w *IngestWorker) Timeout(*river.Job[IngestArgs]) time.Duration { return 15 * time.Minute }

func (w *IngestWorker) Work(ctx context.Context, job *river.Job[IngestArgs]) error {
	src, cleanup, err := w.svc.Download(ctx, job.Args.AssetID)
	if err != nil {
		return err // storage hiccup: let River retry with backoff
	}
	defer cleanup()

	probe, err := ingest.Run(ctx, src)
	if errors.Is(err, ingest.ErrUnreadable) {
		return w.fail(ctx, job, "source_unreadable", err)
	}
	if err != nil {
		return err
	}
	if probe.Video() == nil {
		return w.fail(ctx, job, "source_no_video_stream", nil)
	}
	if err := ingest.DecodeCheck(ctx, src, probe.DurationSeconds()); err != nil {
		return w.fail(ctx, job, "source_corrupt", err)
	}

	plan := ladder.Plan(probe) // which rungs, which filters (see chapter 3)
	return w.svc.StartEncoding(ctx, job.Args.AssetID, probe, plan)
}

// fail records a permanent error and cancels: retrying a broken file only burns CPU.
func (w *IngestWorker) fail(ctx context.Context, job *river.Job[IngestArgs], code string, cause error) error {
	if err := w.svc.MarkErrored(ctx, job.Args.AssetID, code); err != nil {
		return err // could not record it; retry so the asset doesn't stay "processing"
	}
	return river.JobCancel(fmt.Errorf("%s: %v", code, cause))
}
```

মূল নিয়মটা হলো **এরর দুই রকম, আর দুটোকে আলাদা রাস্তায় পাঠাতে হয়**:

| এরর | উদাহরণ | কী ফেরত দেবেন |
| --- | --- | --- |
| ক্ষণস্থায়ী | স্টোরেজ টাইমআউট, ডিস্ক সাময়িক ভরা, DB কানেকশন কাটা | সাধারণ `error`: River ব্যাকঅফ দিয়ে আবার চেষ্টা করে |
| স্থায়ী | ফাইল ভাঙা, ভিডিও স্ট্রিম নেই, অসমর্থিত কোডেক | `river.JobCancel(err)`: আর কখনো চেষ্টা হবে না, এরর জবের ইতিহাসে থেকে যায় |
| "এখন না, পরে" | GPU ওয়ার্কার ব্যস্ত, একটা নির্ভরশীল আউটপুট এখনো তৈরি হয়নি | `river.JobSnooze(30 * time.Second)`: এটা ব্যর্থতা হিসেবে গোনা হয় না |

River-এর ডিফল্ট রিট্রাই নীতি ডকস অনুযায়ী মোটামুটি `attempt^4` সেকেন্ড ব্যাকঅফ (সাথে ±১০% এলোমেলো), আর সর্বোচ্চ ২৫ বার চেষ্টা। ২৫তম চেষ্টাটা প্রায় তিন সপ্তাহ পরে, যা একটা ইনজেস্টের জন্য অনেক বেশি; তাই উপরে `MaxAttempts: 5`। সব চেষ্টা শেষ হলে জবটা **discarded** অবস্থায় যায়। এটাই আপনার "লাল ফাইল": নিয়মিত দেখুন, আর discarded জবের অ্যাসেটকে `errored` করার একটা পিরিয়ডিক চেক রাখুন, নইলে অ্যাসেট চিরকাল `processing` দেখাবে।

<Callout type="danger">

সবচেয়ে ব্যয়বহুল ভুল: ভাঙা ফাইলে সাধারণ `error` ফেরত দেওয়া। একটা দুই ঘণ্টার ভাঙা ৪K ফাইল প্রতিটা চেষ্টায় অর্ধেক এনকোড হয়ে তারপর ভাঙে। ২৫ বার রিট্রাই মানে পঞ্চাশ ঘণ্টার CPU নষ্ট, আর রিট্রাইয়ের মাঝে সেই ওয়ার্কার স্লট অন্য কারো কাজে লাগে না। স্থায়ী এরর চিনতে পারলেই ক্যানসেল করুন।

</Callout>

## ধাপ ৩: ফ্যান-আউট, রেন্ডিশন-প্রতি একটা জব

ইনজেস্ট শেষে পরিকল্পনা জানা আছে: কোন কোন রেন্ডিশন। প্রতিটার জন্য আলাদা জব, সব এক ট্রানজ্যাকশনে:

```go
type EncodeArgs struct {
	AssetID   uuid.UUID `json:"asset_id"`
	Rendition string    `json:"rendition"` // "1080p", "720p", ...
	PlanHash  string    `json:"plan_hash"` // changes if the ladder definition changes
}

func (EncodeArgs) Kind() string { return "encode" }

func (EncodeArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: "encode", MaxAttempts: 3, UniqueOpts: river.UniqueOpts{ByArgs: true}}
}

func (s *Service) StartEncoding(ctx context.Context, id uuid.UUID, probe *ingest.Probe, plan ladder.Plan) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	probeJSON, _ := json.Marshal(probe)
	planJSON, _ := json.Marshal(plan)
	if _, err := tx.Exec(ctx, `
		UPDATE assets SET probe = $2, plan = $3, renditions_left = $4, updated_at = now()
		WHERE id = $1 AND status = 'processing'`,
		id, probeJSON, planJSON, len(plan.Rungs)); err != nil {
		return err
	}

	params := make([]river.InsertManyParams, 0, len(plan.Rungs)+1)
	for _, r := range plan.Rungs {
		params = append(params, river.InsertManyParams{
			Args: EncodeArgs{AssetID: id, Rendition: r.Name, PlanHash: plan.Hash},
		})
	}
	params = append(params, river.InsertManyParams{Args: ThumbnailArgs{AssetID: id}})

	if _, err := s.river.InsertManyTx(ctx, tx, params); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
```

`PlanHash` আর্গুমেন্টে থাকার কারণ: ইউনিক জব আর্গুমেন্ট দিয়ে চেনা হয়। পরে যদি আপনি ladder বদলান (ধরুন ৭২০p-এর বিটরেট বাড়ালেন) আর পুরনো অ্যাসেট আবার এনকোড করতে চান, হ্যাশ বদলে যাওয়ায় নতুন জব ঢুকতে পারবে; একই পরিকল্পনার দ্বিতীয় জব ঢুকবে না।

### রেন্ডিশন-প্রতি নাকি সেগমেন্ট-প্রতি

রেন্ডিশন-প্রতি জব সরল আর বেশিরভাগ প্ল্যাটফর্মের জন্য যথেষ্ট: চারটা রেন্ডিশন মানে চারটা মেশিনে একসাথে কাজ। কিন্তু একটা তিন ঘণ্টার ভিডিওর ১০৮০p রেন্ডিশন একাই অনেকক্ষণ চলে। তখন একটা রেন্ডিশনকে সময় ধরে কয়েক টুকরো করে আলাদা জবে এনকোড করে পরে জোড়া লাগানো যায়। এর বিস্তারিত (কীফ্রেমে কাটা, জোড়ার জায়গায় কোয়ালিটি, stitch ধাপ) আছে [segment-parallel encoding](/notes/video/04-transcoding-pipeline) অংশে। নিয়ম: প্রথমে রেন্ডিশন-প্রতি দিয়ে শুরু করুন, আর লম্বা ভিডিওর অপেক্ষার সময় সত্যিই সমস্যা হলে তবেই সেগমেন্টে যান।

## ধাপ ৪: এনকোড ওয়ার্কার, আর আইডেম্পোটেন্ট আউটপুট

```go
type EncodeWorker struct {
	river.WorkerDefaults[EncodeArgs]
	svc *Service
}

// A rendition of a long video can take a while; the timeout is a ceiling, not a target.
func (w *EncodeWorker) Timeout(*river.Job[EncodeArgs]) time.Duration { return 4 * time.Hour }

func (w *EncodeWorker) Work(ctx context.Context, job *river.Job[EncodeArgs]) error {
	a := job.Args
	// Deterministic output key: a rerun overwrites the same object instead of leaving orphans.
	outKey := fmt.Sprintf("renditions/%s/%s/%s.mp4", a.AssetID, a.PlanHash, a.Rendition)

	if done, err := w.svc.ObjectExists(ctx, outKey); err != nil {
		return err
	} else if !done {
		local, err := w.svc.Encode(ctx, a, func(p float64) { w.svc.ReportProgress(a.AssetID, a.Rendition, p) })
		if err != nil {
			return err
		}
		if err := w.svc.Upload(ctx, local, outKey); err != nil {
			return err
		}
	}
	return w.svc.RenditionDone(ctx, job, outKey)
}
```

<Callout type="warning">

**River-এর দুটো ডিফল্ট লম্বা এনকোডকে মেরে ফেলে।** River v0.49-এর সোর্স অনুযায়ী (২০২৬ সালের অক্টোবরে দেখা) `Timeout` না দিলে প্রতিটা জব ডিফল্টে এক মিনিট পর বাতিল হয়, তাই উপরের মতো প্রতিটা worker-এ নিজের `Timeout` দিন। দ্বিতীয়টা কম চোখে পড়ে: যে জব অনেকক্ষণ `running` থাকে তাকে River "আটকে গেছে" ধরে আবার চালায় (`RescueStuckJobsAfter`, ডিফল্ট এক ঘণ্টা)। চার ঘণ্টার এনকোড এক ঘণ্টা পর দ্বিতীয় একটা কপিতে চলতে শুরু করবে, যদি না `RescueStuckJobsAfter` আপনার সবচেয়ে লম্বা `Timeout`-এর চেয়ে বড় রাখেন। নিজের River ভার্সনের ডকসে দুটো মান মিলিয়ে নিন।

</Callout>

**আইডেম্পোটেন্সি এখানে তিন জায়গায়:**

- **নির্ধারিত আউটপুট কী:** `renditions/ASSET/PLANHASH/720p.mp4`। একই জব দুবার চললে একই অবজেক্টে লেখে; এলোমেলো নামে লিখলে প্রতিটা রিট্রাই একটা করে অনাথ ফাইল রেখে যেত।
- **আগে আছে কিনা দেখা:** আগের চেষ্টা এনকোড আর আপলোড শেষ করে ঠিক `RenditionDone`-এর আগে মরলে, রিট্রাই এক ঘণ্টা আবার এনকোড না করে সরাসরি শেষ ধাপে যায়।
- **লেখা শেষ হলে তবেই অবজেক্ট:** S3 PUT বা মাল্টিপার্ট complete অ্যাটমিক, অর্ধেক লেখা অবজেক্ট কখনো দেখা যায় না। তবু লোকালি এনকোড শেষ করে তারপর আপলোড করুন, এনকোডারকে সরাসরি স্টোরেজে স্ট্রিম করতে দেবেন না।

## ধাপ ৫: ফ্যান-ইন, শেষজন প্যাকেজিং ঢোকায়

চারটা রেন্ডিশন চারটা আলাদা সময়ে শেষ হয়। প্যাকেজিং শুরু হবে শুধু সবগুলো শেষ হলে, আর ঠিক একবার। সবচেয়ে সরল নির্ভরযোগ্য উপায়: একটা কাউন্টার কমানো, জব শেষ চিহ্নিত করা, আর দরকার হলে পরের জব ঢোকানো, সব এক ট্রানজ্যাকশনে।

```go
func (s *Service) RenditionDone(ctx context.Context, job *river.Job[EncodeArgs], outKey string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Idempotent per rendition: the insert is skipped if this rendition was already recorded.
	tag, err := tx.Exec(ctx, `
		INSERT INTO renditions (asset_id, name, object_key) VALUES ($1, $2, $3)
		ON CONFLICT (asset_id, name) DO NOTHING`, job.Args.AssetID, job.Args.Rendition, outKey)
	if err != nil {
		return err
	}

	if tag.RowsAffected() == 1 {
		var left int
		if err := tx.QueryRow(ctx, `
			UPDATE assets SET renditions_left = renditions_left - 1, updated_at = now()
			WHERE id = $1 RETURNING renditions_left`, job.Args.AssetID).Scan(&left); err != nil {
			return err
		}
		if left == 0 {
			if _, err := s.river.InsertTx(ctx, tx, PackageArgs{AssetID: job.Args.AssetID}, nil); err != nil {
				return err
			}
		}
	}

	// Mark this job complete in the same transaction: commit means it never reruns.
	if _, err := river.JobCompleteTx[*riverpgxv5.Driver](ctx, tx, job); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
```

দুটো সমান্তরাল রেন্ডিশন একই সময়ে শেষ হলেও এটা নিরাপদ: `UPDATE ... RETURNING` PostgreSQL-এ রো লক নেয়, তাই দুটো ট্রানজ্যাকশন পরপর চলে, একজন পায় ১, অন্যজন ০। শুধু শূন্য পাওয়া জন প্যাকেজিং ঢোকায়। আর `ON CONFLICT DO NOTHING` থাকায় একই রেন্ডিশনের রিট্রাই কাউন্টার দুবার কমায় না।

`river.JobCompleteTx` জবটাকে ঠিক এই ট্রানজ্যাকশনেই শেষ চিহ্নিত করে। কমিট হলে জব আর কখনো চলবে না; কমিট ব্যর্থ হলে সব কিছু, জব শেষ চিহ্নিত করা সহ, ফিরে যায়, আর River পরে আবার চালায়। এতে "কাউন্টার কমেছে কিন্তু জব আবার চলল" অবস্থা হয় না।

## ওয়ার্কারের আকার: CPU, মেমরি, GPU

| বিষয় | ব্যবহারিক নিয়ম |
| --- | --- |
| প্রতি মেশিনে কয়টা এনকোড জব | x264/x265 নিজেই অনেক থ্রেড ব্যবহার করে। ৮-কোরের মেশিনে চারটা জব একসাথে দিলে প্রতিটা ধীর হয়, মোট থ্রুপুট প্রায়ই বাড়ে না। শুরু করুন ১-২টা দিয়ে, মেপে বাড়ান |
| `-threads` | ডিফল্ট সাধারণত ভালো। একাধিক জব এক মেশিনে চালালে প্রতিটার থ্রেড সীমিত করুন, যাতে একে অপরকে ঠেলাঠেলি না করে |
| মেমরি | ৪K, বিশেষ করে HEVC আর 10-bit, অনেক মেমরি নেয়। OOM-killer জবকে চুপচাপ মেরে ফেলে, আর River সেটাকে টাইমআউট বা ক্র্যাশ হিসেবে দেখে রিট্রাই করে। `dmesg`-এ "Killed process" দেখলে বুঝবেন |
| ডিস্ক | সোর্স + আউটপুট লোকালি থাকে। ২০ GB সোর্স আর চারটা রেন্ডিশন মানে ৩০ GB+ খালি জায়গা প্রতি জবে |
| GPU (NVENC, QSV, VAAPI) | অনেক দ্রুত, সমান বিটরেটে কোয়ালিটি সাধারণত একটু কম। লাইভ বা জরুরি কাজে ভালো; VOD-এ যেখানে সময় আছে, CPU এনকোড প্রায়ই সমান বিটরেটে ভালো ফল দেয়। বিস্তারিত [হার্ডওয়্যার বনাম সফটওয়্যার এনকোডিং](/notes/video/04-transcoding-pipeline) |

River-এ প্রতিটা কিউয়ের ওয়ার্কার সংখ্যা ক্লায়েন্ট কনফিগে:

```go
client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{
	Queues: map[string]river.QueueConfig{
		"ingest": {MaxWorkers: 4},
		"encode": {MaxWorkers: 2}, // per process; one process per encode box
		"light":  {MaxWorkers: 10},
		"notify": {MaxWorkers: 20},
	},
	Workers: workers,
})
```

এনকোড মেশিন আর API মেশিন একই বাইনারি চালাতে পারে, শুধু আলাদা কিউ শোনে: এনকোড বক্সে শুধু `encode`, API বক্সে বাকিগুলো।

### অগ্রাধিকার

একজন শিক্ষক লাইভ ক্লাসের ঠিক পরে রেকর্ডিং আপলোড করেছেন, ছাত্ররা অপেক্ষা করছে। আরেকজন পুরনো ১০০টা ভিডিও একসাথে মাইগ্রেট করছেন। দ্বিতীয়জনের ১০০টা জব যেন প্রথমজনের একটা জবকে পেছনে না ফেলে। দুটো উপায়: `InsertOpts.Priority` (River-এ ছোট সংখ্যা মানে বেশি অগ্রাধিকার; সঠিক রেঞ্জ আপনার ভার্সনের ডকসে দেখুন), বা ব্যাকফিলের জন্য আলাদা একটা `encode_bulk` কিউ, কম ওয়ার্কার সহ। দ্বিতীয়টা বেশি অনুমানযোগ্য, কারণ বাল্ক কাজ কখনো সব ওয়ার্কার দখল করতে পারে না।

## প্রোগ্রেস: ffmpeg থেকে UI পর্যন্ত

ffmpeg `-progress` দিয়ে মেশিনে পড়ার মতো কী-ভ্যালু লাইন দেয়। আসল আউটপুটের শেষ অংশ:

```bash
ffmpeg -v error -i source.mp4 -c:v libx264 -preset veryfast ... -progress pipe:1 -nostats out.mp4
```

```text
frame=180
fps=0.00
bitrate=N/A
total_size=N/A
out_time_us=6000000
out_time=00:00:06.000000
dup_frames=0
drop_frames=0
speed=17.4x
progress=end
```

প্রতি ব্লকের শেষে `progress=continue`, একদম শেষে `progress=end`। শতাংশ বের করতে `out_time_us`-কে মোট দৈর্ঘ্য (ইনজেস্টের প্রোব থেকে) দিয়ে ভাগ:

```go
func parseProgress(r io.Reader, totalUS int64, report func(float64)) {
	sc := bufio.NewScanner(r)
	var last time.Time
	for sc.Scan() {
		k, v, ok := strings.Cut(sc.Text(), "=")
		if !ok || k != "out_time_us" {
			continue
		}
		us, err := strconv.ParseInt(v, 10, 64)
		if err != nil || totalUS <= 0 {
			continue
		}
		// Throttle: one write every few seconds, not one per frame.
		if time.Since(last) > 3*time.Second {
			report(min(float64(us)/float64(totalUS), 1))
			last = time.Now()
		}
	}
}
```

অ্যাসেটের মোট প্রোগ্রেস = রেন্ডিশনগুলোর গড় (বা পিক্সেল সংখ্যা দিয়ে ভারযুক্ত গড়, কারণ ১০৮০p এনকোড ৩৬০p-এর চেয়ে অনেক বেশি সময় নেয়)। প্রোগ্রেস DB-তে লেখার বদলে একটা ছোট আলাদা টেবিলে বা মেমরি স্টোরে রাখলে মূল অ্যাসেট রোতে লেখার চাপ কমে।

`speed=17.4x` লাইনটাও লগ করুন। এটা ওয়ার্কারের স্বাস্থ্যের সবচেয়ে সরল সূচক: একই ধরনের ফাইলে গতি হঠাৎ অর্ধেক হলে মেশিনে অন্য কিছু CPU খাচ্ছে।

## শেষ ধাপ: প্রকাশ আর জানানো

প্যাকেজ জব শেষ হলে (চ্যাপ্টার ৬) একটা শেষ ট্রানজ্যাকশন: অ্যাসেট `ready`, আর একটা webhook জব ঢোকানো, আবার একই ট্রানজ্যাকশনে। webhook জবের নিজস্ব কিউ আর অনেক বেশি `MaxAttempts`, কারণ ক্লায়েন্টের সার্ভার এক ঘণ্টা ডাউন থাকলেও ইভেন্টটা পৌঁছানো উচিত। পাঠানোর নিয়ম [Webhooks ট্র্যাকে](/notes/webhooks/03-sending)।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

River তার জব একটা সাধারণ PostgreSQL টেবিল `river_job`-এ রাখে, তাই বেশিরভাগ ডিবাগিং একটা SQL কুয়েরি দিয়ে শুরু।

```sql
-- What is stuck, failing, or given up on right now?
SELECT kind, queue, state, count(*), max(attempt) AS max_attempt
FROM river_job
WHERE state IN ('available', 'running', 'retryable', 'discarded')
GROUP BY kind, queue, state
ORDER BY kind, state;

-- The last errors of one asset's jobs.
SELECT id, kind, state, attempt, errors -> -1 ->> 'error' AS last_error
FROM river_job
WHERE args ->> 'asset_id' = '5b0e7c1a-2f3d-4c6e-9a1b-7d8e9f0a1b2c'
ORDER BY id;
```

(কলাম আর অবস্থার নাম River-এর ভার্সনভেদে বদলাতে পারে; নিজের ডেটাবেসে `\d river_job` দেখে নিন। River-এর একটা ওয়েব UI, River UI, এই একই তথ্য ব্রাউজারে দেখায়।)

| লক্ষণ | নিশ্চিত করুন | সমাধান |
| --- | --- | --- |
| অ্যাসেট `processing`-এ, কোনো জব নেই | উপরের দ্বিতীয় কুয়েরি; শূন্য রো | অ্যাসেট আপডেট আর জব ইনসার্ট আলাদা ট্রানজ্যাকশনে হচ্ছে; `InsertTx` ব্যবহার করুন |
| `encode` কিউতে `available` জব জমছে, কেউ নিচ্ছে না | এনকোড মেশিনে প্রসেস চলছে কিনা, আর তার কনফিগে `encode` কিউ আছে কিনা | ওয়ার্কার প্রসেস চালু করুন বা কিউয়ের নাম মেলান; ওয়ার্কার রেজিস্টার না থাকলে সেই kind-এর জব কেউ নেয় না |
| একই ভাঙা ফাইল বারবার রিট্রাই হচ্ছে | `attempt` বাড়ছে, `last_error` প্রতিবার একই ডিকোড এরর | স্থায়ী এরর চিনে `river.JobCancel` দিন; `MaxAttempts` কমান |
| প্যাকেজিং কখনো শুরু হয় না | `SELECT renditions_left FROM assets WHERE id = ...` শূন্যের উপরে আটকে আছে কিনা; কোনো `encode` জব `discarded` কিনা | একটা রেন্ডিশন হাল ছেড়ে দিয়েছে; discarded রেন্ডিশনকে অ্যাসেট `errored` করার পিরিয়ডিক চেক রাখুন, বা ঐচ্ছিক রেন্ডিশন বাদ দিয়ে এগোনোর নীতি নিন |
| প্যাকেজিং দুবার চলল | `river_job`-এ একই অ্যাসেটের দুটো `package` জব | কাউন্টার কমানো আর জব ইনসার্ট একই ট্রানজ্যাকশনে কিনা; `PackageArgs`-এ `UniqueOpts` যোগ করুন |
| এনকোড জব মাঝপথে উধাও, পরে রিট্রাই | এনকোড মেশিনে `dmesg -T` আউটপুটে "Killed process" লাইন | OOM; প্রতি মেশিনে জব সংখ্যা কমান বা মেমরি বাড়ান |
| জব `running` দেখায় কিন্তু ffmpeg চলছে না | মেশিনে `pgrep -af ffmpeg` | প্রসেস ক্র্যাশ করেছে; River-এর রেসকিউ মেকানিজম সময় পার হলে জবটা আবার `retryable` করে; জবের `Timeout` বাস্তবসম্মত রাখুন |
| স্টোরেজে একই রেন্ডিশনের অনেকগুলো ফাইল | `aws s3 ls --endpoint-url $S3_ENDPOINT s3://vod-out/renditions/ASSET/` | আউটপুট কী এলোমেলো; নির্ধারিত কী ব্যবহার করুন (`ASSET/PLANHASH/RENDITION`) |
| বাল্ক মাইগ্রেশনের সময় নতুন আপলোড ঘণ্টার পর ঘণ্টা অপেক্ষা করছে | কিউ অনুযায়ী `available` জবের সংখ্যা | বাল্ক কাজ আলাদা কিউতে কম ওয়ার্কার দিয়ে চালান |

## মূল শিক্ষা

1. **অ্যাসেট আর জব একই ট্রানজ্যাকশনে**: River-এর `InsertTx` আর `InsertManyTx` দিয়ে, যাতে ডেটা আর কিউ কখনো আলাদা কথা না বলে।
2. **ডুপ্লিকেট দুই স্তরে ঠেকান**: SQL-এ স্টেট গার্ড, আর কিউতে `UniqueOpts{ByArgs: true}`।
3. **ক্ষণস্থায়ী এররে রিট্রাই, স্থায়ী এররে ক্যানসেল, "এখন না"-তে স্নুজ**: ভাঙা ফাইল রিট্রাই করা সবচেয়ে ব্যয়বহুল ভুল।
4. **রেন্ডিশন-প্রতি ফ্যান-আউট দিয়ে শুরু করুন**; সেগমেন্ট-প্রতি ভাগ শুধু লম্বা ভিডিওর অপেক্ষা সমস্যা হলে।
5. **ফ্যান-ইন এক ট্রানজ্যাকশনে**: কাউন্টার কমানো, শূন্য হলে পরের জব ঢোকানো, আর `JobCompleteTx` দিয়ে জব শেষ চিহ্নিত করা।
6. **আউটপুট কী নির্ধারিত**, যাতে রিট্রাই একই জায়গায় লেখে আর আগের কাজ আবার না করে।
7. **আলাদা কিউ আলাদা কাজের জন্য**: এক ঘণ্টার এনকোড যেন ৫০ মিলিসেকেন্ডের webhook আটকে না রাখে, আর বাল্ক কাজ যেন নতুন আপলোড আটকে না রাখে।
8. **`river_job` একটা সাধারণ টেবিল**: ডিবাগিং শুরু হয় একটা SQL কুয়েরি দিয়ে।
