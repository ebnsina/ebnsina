---
title: 'Cron & Scheduled Jobs'
subtitle: 'Running work on a schedule — cron syntax, leader election to avoid duplicate runs, and operational considerations.'
chapter: 5
level: 'intermediate'
readingTime: '8 min'
topics: ['cron', 'scheduled jobs', 'leader election', 'clock skew', 'distributed cron']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A timer on a coffee maker: it runs at the same time every morning regardless of who's home. In a distributed system with multiple servers, you need to make sure only one server is the "coffee maker" — otherwise you get three pots brewing at 7am.

</Callout>

## The Problem with Cron in Distributed Systems

Classic Unix cron runs on a single machine. When you run multiple application servers, every server runs its own crontab — meaning every job runs N times, once per server. This causes duplicate emails, double charges, and data corruption.

Solutions:

1. Run cron on a dedicated single machine (fragile — that machine becomes a SPOF)
2. Use a queue-backed scheduler (BullMQ repeatable jobs, pg-boss schedules)
3. Implement leader election so only one server schedules at a time

## Queue-Backed Cron

The cleanest approach: store the schedule in the queue, not in crontab. The queue handles deduplication across multiple workers.

**BullMQ repeatable jobs:**

```typescript
import { Queue } from 'bullmq';

const schedulerQueue = new Queue('scheduled', { connection });

// Add repeatable job — BullMQ deduplicates by cron pattern + job name
await schedulerQueue.add(
	'daily-report',
	{ reportType: 'revenue' },
	{
		repeat: {
			cron: '0 8 * * *', // 8am every day
			tz: 'America/New_York'
		},
		removeOnComplete: 10,
		removeOnFail: 50
	}
);

await schedulerQueue.add(
	'cleanup-sessions',
	{},
	{ repeat: { cron: '*/30 * * * *' } } // every 30 minutes
);

// Worker handles the actual work
const worker = new Worker(
	'scheduled',
	async (job) => {
		switch (job.name) {
			case 'daily-report':
				await generateDailyReport(job.data);
				break;
			case 'cleanup-sessions':
				await db.sessions.deleteExpired();
				break;
		}
	},
	{ connection }
);
```

**pg-boss schedules:**

```typescript
// Register the schedule
await boss.schedule(
	'send-weekly-digest',
	'0 10 * * 1',
	{},
	{
		tz: 'UTC',
		singletonKey: 'weekly-digest' // prevent duplicates
	}
);

// Register the handler
await boss.work('send-weekly-digest', async (job) => {
	const users = await db.users.findNewsletterSubscribers();
	for (const user of users) {
		await boss.send('send-email', {
			to: user.email,
			template: 'weekly-digest'
		});
	}
});
```

## Cron Syntax Reference

```
┌───────────── minute (0-59)
│ ┌─────────── hour (0-23)
│ │ ┌───────── day of month (1-31)
│ │ │ ┌─────── month (1-12)
│ │ │ │ ┌───── day of week (0-7, Sunday=0 or 7)
│ │ │ │ │
* * * * *

0 9 * * 1-5     → 9am Monday through Friday
0 */4 * * *     → every 4 hours
*/15 * * * *    → every 15 minutes
0 0 1 * *       → midnight on the 1st of every month
0 8 * * 1       → 8am every Monday
30 23 * * *     → 11:30pm every day
```

## Leader Election (When You Need It)

If you can't use a queue-backed scheduler, elect a leader among your servers. Only the leader runs scheduled tasks.

**Simple approach: Redis-based lock with heartbeat**

```typescript
const LEADER_KEY = 'scheduler:leader';
const LEADER_TTL = 30; // seconds
const HEARTBEAT_INTERVAL = 10_000; // ms

let isLeader = false;

async function tryBecomeLeader(): Promise<boolean> {
	// NX = only set if key doesn't exist
	const acquired = await redis.set(LEADER_KEY, instanceId, 'NX', 'EX', LEADER_TTL);
	return acquired === 'OK';
}

async function refreshLeadership(): Promise<boolean> {
	// Only extend if we're still the current leader
	const script = `
    if redis.call('get', KEYS[1]) == ARGV[1] then
      return redis.call('expire', KEYS[1], ARGV[2])
    else
      return 0
    end
  `;
	const result = await redis.eval(script, 1, LEADER_KEY, instanceId, LEADER_TTL);
	return result === 1;
}

// Start leader election loop
async function startLeaderElection(): Promise<void> {
	isLeader = await tryBecomeLeader();

	setInterval(async () => {
		if (isLeader) {
			isLeader = await refreshLeadership();
			if (!isLeader) {
				logger.warn('Lost leadership');
			}
		} else {
			isLeader = await tryBecomeLeader();
			if (isLeader) {
				logger.info('Became leader');
			}
		}
	}, HEARTBEAT_INTERVAL);
}

// Only the leader schedules cron jobs
cron.schedule('0 8 * * *', async () => {
	if (!isLeader) return; // skip if not leader
	await generateDailyReport();
});
```

**pg-advisory-lock approach (Postgres):**

```typescript
// Each server competes for the same advisory lock
// The database ensures only one holder at a time
async function withSchedulerLock(fn: () => Promise<void>): Promise<void> {
	const LOCK_ID = 12345; // arbitrary constant — must be same across all servers

	const client = await pool.connect();
	try {
		const { rows } = await client.query('SELECT pg_try_advisory_lock($1)', [LOCK_ID]);

		if (!rows[0].pg_try_advisory_lock) {
			return; // another server holds the lock — skip
		}

		await fn();
	} finally {
		await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
		client.release();
	}
}

// Wrap your cron handler
cron.schedule('0 0 * * *', () => {
	withSchedulerLock(async () => {
		await runMidnightCleanup();
	});
});
```

## Clock Skew and Timezone Pitfalls

Server clocks drift. NTP corrects them, but two servers might disagree by up to a few seconds. For most cron jobs this doesn't matter, but for jobs that run at exactly midnight or month boundaries, account for it:

```typescript
// Prefer UTC internally — convert to user's timezone only for display
await queue.add(
	'month-end-report',
	{},
	{
		repeat: {
			cron: '0 0 1 * *', // midnight UTC on the 1st
			tz: 'UTC'
		}
	}
);

// For user-scoped jobs (send at 9am in each user's timezone):
// Don't use a single cron — query users by timezone and schedule per-user
async function scheduleTimezoneAwareEmails(): Promise<void> {
	const timezones = await db.users.distinctTimezones();

	for (const tz of timezones) {
		// Schedule for 9am in each timezone
		const now = new Date();
		const targetTime = DateTime.now().setZone(tz).set({ hour: 9, minute: 0, second: 0 }).toJSDate();
		const delay = targetTime.getTime() - now.getTime();

		if (delay > 0) {
			await queue.add('send-morning-digest', { timezone: tz }, { delay });
		}
	}
}
```

## Missed Runs

When a server is down during a scheduled time, the job doesn't run. Decide your policy:

**Skip missed runs** (default for most jobs — the next run will happen normally):

```typescript
// BullMQ default: if server is down at 3am, the 3am job is skipped
// Next run is 3am tomorrow — this is usually fine for daily reports
```

**Run missed jobs on startup** (critical jobs that must not be skipped):

```typescript
async function onStartup(): Promise<void> {
	const lastRun = await db.jobRuns.findLatest('midnight-billing');
	const expectedLastRun = getLastMidnightUtc();

	if (!lastRun || lastRun.completedAt < expectedLastRun) {
		logger.info('Running missed midnight billing job');
		await runMidnightBilling();
	}
}
```

## Operational Checklist

```
□ Scheduled jobs run in the queue (not OS crontab) on multi-server deployments
□ Leader election or queue-level dedup prevents concurrent runs
□ All cron expressions use explicit timezone (not server default)
□ Job run duration monitored — alert if a job takes longer than expected
□ Last-successful-run tracked — alert if a job hasn't run in 2x its interval
□ Missed-run policy documented for each job type
□ Cron jobs tested in staging on a sped-up schedule (1-minute instead of daily)
```
