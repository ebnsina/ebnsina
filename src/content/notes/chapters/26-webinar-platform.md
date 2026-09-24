---
title: 'কেস স্টাডি: ওয়েবিনার ও ভিডিও কনফারেন্সিং প্ল্যাটফর্ম'
subtitle: 'মাল্টি-পার্টি ভিডিও, স্ক্রিন শেয়ারিং, Q&A, পোল, ব্রেকআউট রুম আর রেকর্ডিং সহ একটা প্রোডাকশন ওয়েবিনার সিস্টেম ডিজাইন ও তৈরি করুন।'
chapter: 26
level: 'advanced'
readingTime: '33 মিনিট'
topics: ['webinar', 'video conferencing', 'WebRTC', 'SFU', 'breakout rooms', 'recording']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

একটা বড় হলে সেমিনার চলছে। মঞ্চে সিনা, খোয়ারিজমি আর ফাতিমা — তিনজন speaker হাতে মাইক নিয়ে একে অন্যের সাথে কথা চালাচালি করছেন, প্রশ্ন করছেন, উত্তর দিচ্ছেন। তাঁদের মধ্যে কথাটা প্রায় সঙ্গে সঙ্গে পৌঁছাতে হয়, একটু দেরি হলেই আলোচনা এলোমেলো হয়ে যায় — এটাই কয়েকজনের মধ্যে low-latency interactive conferencing। আর হলের চেয়ারে বসা কয়েকশ শ্রোতা বেশিরভাগ সময় শুধু দেখছেন আর শুনছেন — এটাই one-to-many broadcast।

এখন ভাবুন, প্রতিটা শ্রোতা যদি নিজের কথা হলের প্রত্যেকের কানে সরাসরি পৌঁছাতে চাইত, তাহলে চিৎকারে হল ভেঙে পড়ত — তাই সবার মাইকের অডিও যায় হলের মাঝখানের central sound desk-এ, আর সেই ডেস্ক ঠিক করে কার কণ্ঠ কোন speaker বা কোন সেকশনে পাঠানো দরকার, শুধু সেটুকুই ফরওয়ার্ড করে। এভাবে everyone-to-everyone হট্টগোল এড়ানো যায়। কোনো শ্রোতা প্রশ্ন করতে চাইলে হাত তোলেন, একজন ঘুরে বেড়ানো মাইক তাঁর হাতে ধরিয়ে দেয় — সেই মুহূর্তে তিনি শ্রোতা থেকে বক্তা হয়ে যান, প্রশ্ন শেষ হলে মাইক ফেরত, আবার শ্রোতা।

এই গল্পটাই একটা webinar platform। মঞ্চের মাইক-হাতে speaker-রা হলো interactive conferencing peer, আর বসা দর্শকেরা broadcast viewer — দুটো একসাথে চলে বলেই এটা conferencing আর broadcast-এর মিশ্রণ। central sound desk যেভাবে বেছে বেছে অডিও ফরওয়ার্ড করে, সেটাই **SFU (selective forwarding unit)** — প্রত্যেকে প্রত্যেকের কাছে সরাসরি পাঠানোর full mesh এড়িয়ে সার্ভার শুধু দরকারি stream রুট করে। আর হাত তুলে roving মাইক পাওয়াটা হলো Q&A আর attendee→speaker role change। বাস্তবে Zoom Webinars আর Google Meet ঠিক এভাবেই কয়েকজন speaker-এর interaction আর হাজার হাজার attendee-র broadcast একই session-এ চালায়।

## ভিডিও কনফারেন্সিং লাইভ স্ট্রিমিং থেকে আলাদা কীভাবে?

লাইভ স্ট্রিমিং হলো **one-to-many**: একজন ব্রডকাস্টার, লক্ষ লক্ষ প্যাসিভ ভিউয়ার। ভিডিও কনফারেন্সিং হলো **many-to-many**: প্রতিটা participant একসাথে ভিডিও পাঠাতে ও রিসিভ করতে পারে। ওয়েবিনার এই দুইয়ের মাঝখানে — কয়েকজন **presenter** অনেক **attendee**-র কাছে ব্রডকাস্ট করে, যারা Q&A, চ্যাট, পোল আর হ্যান্ড-রেইজিং দিয়ে ইন্টারঅ্যাক্ট করে। এই মাঝামাঝি মডেলটা কিছু অনন্য চ্যালেঞ্জ তৈরি করে: মিডিয়া আর্কিটেকচারকে presenter-দের জন্য bidirectional ভিডিও হ্যান্ডল করতে হবে, একই সাথে হাজার হাজার view-only attendee-র জন্য স্কেল করতে হবে — সবটাই sub-200ms অডিও latency-তে।

এটাকে একটা টাউন হল মিটিং বনাম একটা টিভি ব্রডকাস্টের মতো ভাবুন।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা টাউন হল মিটিংয়ের মতো — বক্তারা মঞ্চে উপস্থাপন করেন, দর্শক হাত তুলতে পারে, একজন মডারেটরের মাধ্যমে প্রশ্ন করতে পারে, আর ভোট দিতে পারে। টিভি ব্রডকাস্টের বিপরীতে, এখানে ইন্টারঅ্যাকশন দুই দিকেই প্রবাহিত হয়।

</Callout>

একটা টিভি ব্রডকাস্ট (লাইভ স্ট্রিমিং) এক দিকে যায় — স্টুডিও থেকে আপনার স্ক্রিনে। একটা টাউন হলে (ওয়েবিনার) মঞ্চে বক্তারা থাকেন, কিন্তু দর্শক হাত তুলতে পারে, একজন মডারেটরের মাধ্যমে প্রশ্ন করতে পারে, আর প্রস্তাবের ওপর ভোট দিতে পারে। ইনফ্রাস্ট্রাকচারকে ব্রডকাস্ট আর ইন্টারঅ্যাকশন — দুটোই একসাথে হ্যান্ডল করতে হবে।

<Mermaid
title="Webinar Platform Architecture"
code={`graph TD
  P["Presenters<br/>WebRTC"] --> S["SFU Server<br/>Media Routing"] --> A["Attendees<br/>View & Interact"]
  S --> SG["Signaling Server<br/>WebSocket"] --> SM["Session Manager<br/>Rooms & Roles"] --> R["Recording<br/>Composite & Store"]`}
/>

## রিকোয়ারমেন্ট

- **Functional**: মাল্টি-পার্টি ভিডিও (ক্যামেরায় সর্বোচ্চ ২৫ জন), স্ক্রিন শেয়ারিং, upvoting সহ Q&A, লাইভ রেজাল্ট সহ পোল, হ্যান্ড-রেইজিং, ব্রেকআউট রুম, রেকর্ডিং, ওয়েটিং রুম, attendee ম্যানেজমেন্ট (mute/kick), চ্যাট
- **Non-functional**: sub-200ms অডিও latency, প্রতি ওয়েবিনারে 10K attendee সাপোর্ট, 99.9% uptime, দুর্বল নেটওয়ার্কে গ্রেসফুল কোয়ালিটি ডিগ্রেডেশন
- **Scale**: 1000 concurrent ওয়েবিনার, 1M মোট concurrent attendee

## WebRTC ও মিডিয়া আর্কিটেকচার গভীরভাবে

### Mesh vs SFU vs MCU

**Mesh (Peer-to-Peer):** প্রতিটা participant তার ভিডিও সরাসরি অন্য প্রতিটা participant-কে পাঠায়। N participant থাকলে, প্রতিজন N-1 stream পাঠায় আর N-1 stream রিসিভ করে। এটা 2-4 জনের জন্য কাজ করে কিন্তু দ্রুত ভেঙে পড়ে — 10 participant মানে প্রতিজন 9 upload + 9 download stream ম্যানেজ করছে।

**SFU (Selective Forwarding Unit):** প্রতিটা participant সার্ভারে একটা upload stream পাঠায়, সার্ভার সেটা অন্য participant-দের কাছে ফরওয়ার্ড করে। সার্ভার ডিকোড বা re-encode করে না — শুধু প্যাকেট রুট করে। 10 participant থাকলে, প্রতিজন 1 stream আপলোড করে আর 9 ডাউনলোড করে। কে কথা বলছে, স্ক্রিন লেআউট, আর ভিউয়ারের bandwidth-এর ওপর ভিত্তি করে SFU সিদ্ধান্ত নেয় কোন stream ফরওয়ার্ড করবে।

**MCU (Multipoint Conferencing Unit):** সার্ভার সব incoming stream ডিকোড করে, একটা মিক্সড stream-এ কম্পোজিট করে, আর প্রতিটা participant-কে একটা করে stream পাঠায়। প্রতিজন 1 আপলোড আর 1 ডাউনলোড করে। কিন্তু সার্ভার ব্যয়বহুল real-time ভিডিও এনকোডিং করে, যা scalability সীমিত করে আর latency বাড়ায়।

**ওয়েবিনারের জন্য SFU হলো sweet spot।** presenter-রা (5-25 জন) প্রত্যেকে একটা করে stream আপলোড করে। SFU presenter-দের stream হাজার হাজার attendee-র কাছে ফরওয়ার্ড করে। কোনো ব্যয়বহুল server-side transcoding নেই। attendee-রা শুধু ডাউনলোড করে, আপলোড করে না।

### Simulcast

বিভিন্ন bandwidth-এর ভিউয়ারের জন্য SFU-কে ভিডিও transcode করানোর বদলে, **simulcast** কাজটা sender-এর ওপর ঠেলে দেয়। প্রতিটা presenter তার ভিডিও একসাথে 3টা কোয়ালিটি লেভেলে এনকোড করে (যেমন 720p, 360p, 180p)। এরপর SFU প্রতিটা ভিউয়ারের অ্যাভেইলেবল bandwidth-এর ওপর ভিত্তি করে সিলেক্ট করে কোন কোয়ালিটি ফরওয়ার্ড করবে। এটা server-side transcoding পুরোপুরি দূর করে দেয়।

### Signaling

WebRTC মিডিয়া প্রবাহিত হওয়ার আগে, peer-দের একটা **signaling server**-এর মাধ্যমে (সাধারণত WebSocket) কানেকশন ইনফরমেশন এক্সচেঞ্জ করতে হয়। এর মধ্যে থাকে SDP (Session Description Protocol) offer/answer (কোডেক, রেজোলিউশন বর্ণনা করে) আর ICE candidate (নেটওয়ার্ক পাথ)। signaling server কোনো মিডিয়া বহন করে না — এটা শুধু একটা rendezvous point।

## ওয়েবিনার ফিচার গভীরভাবে

**Roles:** Host (পূর্ণ নিয়ন্ত্রণ — যে কাউকে mute করা, session শেষ করা, সেটিংস ম্যানেজ করা), Presenter (ক্যামেরা/স্ক্রিন শেয়ার করতে পারে), Attendee (শুধু দেখা + Q&A/চ্যাট/পোলের মাধ্যমে ইন্টারঅ্যাক্ট করা)। role সিস্টেম নিশ্চিত করে যে attendee-রা প্রোমোট না হলে নিজেদের unmute করতে বা স্ক্রিন শেয়ার করতে পারবে না।

**Q&A:** attendee-রা প্রশ্ন সাবমিট করে, অন্যরা upvote করে। host ভোট অনুযায়ী সাজানো প্রশ্ন দেখতে পায়, inline উত্তর দিতে পারে, answered মার্ক করতে পারে, বা dismiss করতে পারে। এটা সবচেয়ে প্রাসঙ্গিক প্রশ্নগুলো সামনে আনে, host-কে ডুপ্লিকেটে ডুবিয়ে না দিয়ে।

**Polls:** host অপশন সহ একটা পোল তৈরি করে, attendee-রা real-time-এ ভোট দেয়, সবার জন্য রেজাল্ট লাইভ আপডেট হয়। পোল engagement বাড়ায় আর presenter-দের real-time দর্শক ফিডব্যাক দেয়।

**Breakout Rooms:** host attendee-দের ছোট ছোট গ্রুপে ভাগ করে, প্রতিটার নিজস্ব আলাদা SFU session, চ্যাট আর মিডিয়া থাকে। ব্রেকআউট টাইম শেষ হলে, সবাই মূল রুমে ফিরে আসে। ব্রেকআউট রুম আসলে ephemeral সাব-session ছাড়া কিছু নয়।

**Hand Raising:** attendee-রা একটা queue-তে যোগ দেয়। host queue দেখতে পায় আর একটা লাইভ Q&A সেগমেন্টের জন্য একজন attendee-কে presenter-এ প্রোমোট করতে পারে (সাময়িকভাবে ক্যামেরা/মাইক অ্যাক্সেস দিয়ে)।

## ওয়েবিনার প্ল্যাটফর্ম তৈরি করা

<CodeTabs tsFile="webinar-platform.ts" goFile="webinar-platform.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';
import crypto from 'node:crypto';

// ===========================================
// 1. TYPES
// ===========================================
type Role = 'host' | 'presenter' | 'attendee';
type WebinarStatus = 'waiting' | 'live' | 'ended';

interface Participant {
	id: string;
	name: string;
	role: Role;
	joinedAt: string;
	isMuted: boolean;
	isCameraOn: boolean;
	isScreenSharing: boolean;
	isHandRaised: boolean;
	handRaisedAt: number | null;
}

interface Question {
	id: string;
	authorId: string;
	authorName: string;
	content: string;
	votes: Set<string>;
	isAnswered: boolean;
	createdAt: string;
}

interface Poll {
	id: string;
	question: string;
	options: string[];
	votes: Map<string, number>; // optionIndex -> count
	voters: Set<string>;
	isOpen: boolean;
	createdAt: string;
}

interface BreakoutRoom {
	id: string;
	name: string;
	participantIds: Set<string>;
	createdAt: string;
}

interface WebinarSession {
	id: string;
	title: string;
	hostId: string;
	status: WebinarStatus;
	participants: Map<string, Participant>;
	waitingRoom: Map<string, Participant>;
	questions: Map<string, Question>;
	polls: Map<string, Poll>;
	breakoutRooms: Map<string, BreakoutRoom>;
	chat: Array<{ id: string; userId: string; name: string; content: string; timestamp: number }>;
	isRecording: boolean;
	createdAt: string;
	startedAt: string | null;
}

// ===========================================
// 2. WEBINAR MANAGER
// ===========================================
class WebinarManager {
	private sessions = new Map<string, WebinarSession>();

	create(hostId: string, hostName: string, title: string): WebinarSession {
		const session: WebinarSession = {
			id: crypto.randomUUID().slice(0, 8),
			title,
			hostId,
			status: 'waiting',
			participants: new Map(),
			waitingRoom: new Map(),
			questions: new Map(),
			polls: new Map(),
			breakoutRooms: new Map(),
			chat: [],
			isRecording: false,
			createdAt: new Date().toISOString(),
			startedAt: null
		};

		// Add host as first participant
		session.participants.set(hostId, {
			id: hostId,
			name: hostName,
			role: 'host',
			joinedAt: new Date().toISOString(),
			isMuted: false,
			isCameraOn: true,
			isScreenSharing: false,
			isHandRaised: false,
			handRaisedAt: null
		});

		this.sessions.set(session.id, session);
		return session;
	}

	join(
		webinarId: string,
		userId: string,
		name: string
	): { admitted: boolean; session?: WebinarSession } {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');

		const participant: Participant = {
			id: userId,
			name,
			role: 'attendee',
			joinedAt: new Date().toISOString(),
			isMuted: true,
			isCameraOn: false,
			isScreenSharing: false,
			isHandRaised: false,
			handRaisedAt: null
		};

		if (session.status === 'waiting') {
			// Add to waiting room
			session.waitingRoom.set(userId, participant);
			return { admitted: false };
		}

		// Direct join if session is live
		session.participants.set(userId, participant);
		return { admitted: true, session };
	}

	admitFromWaiting(webinarId: string, userId: string): void {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		const participant = session.waitingRoom.get(userId);
		if (!participant) throw new Error('User not in waiting room');
		session.waitingRoom.delete(userId);
		session.participants.set(userId, participant);
	}

	leave(webinarId: string, userId: string): void {
		const session = this.sessions.get(webinarId);
		if (!session) return;
		session.participants.delete(userId);
		session.waitingRoom.delete(userId);
	}

	start(webinarId: string, hostId: string): WebinarSession {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		if (session.hostId !== hostId) throw new Error('Only host can start');
		session.status = 'live';
		session.startedAt = new Date().toISOString();

		// Admit all waiting room participants
		for (const [id, p] of session.waitingRoom) {
			session.participants.set(id, p);
		}
		session.waitingRoom.clear();
		return session;
	}

	end(webinarId: string, hostId: string): WebinarSession {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		if (session.hostId !== hostId) throw new Error('Only host can end');
		session.status = 'ended';
		return session;
	}

	// Role management
	promoteToPresenter(webinarId: string, userId: string): void {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		const p = session.participants.get(userId);
		if (!p) throw new Error('Participant not found');
		p.role = 'presenter';
		p.isMuted = false;
		p.isCameraOn = true;
		p.isHandRaised = false;
		p.handRaisedAt = null;
	}

	demoteToAttendee(webinarId: string, userId: string): void {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		const p = session.participants.get(userId);
		if (!p) throw new Error('Participant not found');
		p.role = 'attendee';
		p.isMuted = true;
		p.isCameraOn = false;
		p.isScreenSharing = false;
	}

	// Q&A
	submitQuestion(webinarId: string, userId: string, name: string, content: string): Question {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		const q: Question = {
			id: crypto.randomUUID().slice(0, 8),
			authorId: userId,
			authorName: name,
			content,
			votes: new Set([userId]),
			isAnswered: false,
			createdAt: new Date().toISOString()
		};
		session.questions.set(q.id, q);
		return q;
	}

	upvoteQuestion(webinarId: string, questionId: string, userId: string): void {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		const q = session.questions.get(questionId);
		if (!q) throw new Error('Question not found');
		q.votes.add(userId);
	}

	getQuestions(webinarId: string): object[] {
		const session = this.sessions.get(webinarId);
		if (!session) return [];
		return [...session.questions.values()]
			.map((q) => ({ ...q, votes: q.votes.size }))
			.sort((a, b) => b.votes - a.votes);
	}

	// Polls
	createPoll(webinarId: string, question: string, options: string[]): Poll {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		const poll: Poll = {
			id: crypto.randomUUID().slice(0, 8),
			question,
			options,
			votes: new Map(options.map((_, i) => [i, 0] as [number, number])),
			voters: new Set(),
			isOpen: true,
			createdAt: new Date().toISOString()
		};
		// Initialize vote counts
		for (let i = 0; i < options.length; i++) poll.votes.set(i, 0);
		session.polls.set(poll.id, poll);
		return poll;
	}

	votePoll(webinarId: string, pollId: string, userId: string, optionIndex: number): void {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		const poll = session.polls.get(pollId);
		if (!poll) throw new Error('Poll not found');
		if (!poll.isOpen) throw new Error('Poll is closed');
		if (poll.voters.has(userId)) throw new Error('Already voted');
		poll.voters.add(userId);
		poll.votes.set(optionIndex, (poll.votes.get(optionIndex) || 0) + 1);
	}

	getPollResults(webinarId: string, pollId: string): object {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		const poll = session.polls.get(pollId);
		if (!poll) throw new Error('Poll not found');
		return {
			...poll,
			votes: Object.fromEntries(poll.votes),
			totalVotes: poll.voters.size,
			voters: undefined
		};
	}

	// Hand raising
	raiseHand(webinarId: string, userId: string): void {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		const p = session.participants.get(userId);
		if (!p) throw new Error('Not a participant');
		p.isHandRaised = true;
		p.handRaisedAt = Date.now();
	}

	lowerHand(webinarId: string, userId: string): void {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		const p = session.participants.get(userId);
		if (p) {
			p.isHandRaised = false;
			p.handRaisedAt = null;
		}
	}

	getHandRaisedQueue(webinarId: string): object[] {
		const session = this.sessions.get(webinarId);
		if (!session) return [];
		return [...session.participants.values()]
			.filter((p) => p.isHandRaised)
			.sort((a, b) => (a.handRaisedAt || 0) - (b.handRaisedAt || 0))
			.map((p) => ({ id: p.id, name: p.name, raisedAt: p.handRaisedAt }));
	}

	// Breakout rooms
	createBreakoutRooms(webinarId: string, count: number): BreakoutRoom[] {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		const rooms: BreakoutRoom[] = [];
		const attendees = [...session.participants.values()].filter((p) => p.role === 'attendee');
		const perRoom = Math.ceil(attendees.length / count);

		for (let i = 0; i < count; i++) {
			const room: BreakoutRoom = {
				id: `room_${i + 1}`,
				name: `Room ${i + 1}`,
				participantIds: new Set(),
				createdAt: new Date().toISOString()
			};
			const start = i * perRoom;
			const end = Math.min(start + perRoom, attendees.length);
			for (let j = start; j < end; j++) room.participantIds.add(attendees[j].id);
			session.breakoutRooms.set(room.id, room);
			rooms.push(room);
		}
		return rooms;
	}

	closeBreakoutRooms(webinarId: string): void {
		const session = this.sessions.get(webinarId);
		if (session) session.breakoutRooms.clear();
	}

	// Chat
	sendChat(webinarId: string, userId: string, name: string, content: string): object {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		const msg = {
			id: crypto.randomUUID().slice(0, 8),
			userId,
			name,
			content,
			timestamp: Date.now()
		};
		session.chat.push(msg);
		if (session.chat.length > 500) session.chat.shift();
		return msg;
	}

	// Recording
	toggleRecording(webinarId: string): boolean {
		const session = this.sessions.get(webinarId);
		if (!session) throw new Error('Webinar not found');
		session.isRecording = !session.isRecording;
		console.log(`[RECORDING] ${session.isRecording ? 'Started' : 'Stopped'} for ${webinarId}`);
		return session.isRecording;
	}

	getSession(id: string): WebinarSession | null {
		return this.sessions.get(id) || null;
	}

	getSessionInfo(id: string): object | null {
		const s = this.sessions.get(id);
		if (!s) return null;
		return {
			id: s.id,
			title: s.title,
			status: s.status,
			participantCount: s.participants.size,
			waitingRoomCount: s.waitingRoom.size,
			isRecording: s.isRecording,
			presenters: [...s.participants.values()]
				.filter((p) => p.role !== 'attendee')
				.map((p) => ({ id: p.id, name: p.name, role: p.role })),
			questionCount: s.questions.size,
			activePollCount: [...s.polls.values()].filter((p) => p.isOpen).length,
			breakoutRoomCount: s.breakoutRooms.size
		};
	}
}

// ===========================================
// 3. HTTP SERVER
// ===========================================
const manager = new WebinarManager();

function parseBody(req: http.IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString()));
			} catch {
				reject(new Error('Invalid JSON'));
			}
		});
	});
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const method = req.method || 'GET';

	try {
		// POST /api/webinars — Create
		if (url.pathname === '/api/webinars' && method === 'POST') {
			const body = (await parseBody(req)) as any;
			const session = manager.create(
				body.hostId || 'host',
				body.hostName || 'Host',
				body.title || 'Untitled Webinar'
			);
			json(res, 201, manager.getSessionInfo(session.id));
			return;
		}

		const idMatch = url.pathname.match(/^\/api\/webinars\/([^/]+)(?:\/(.+))?$/);
		if (!idMatch) {
			if (url.pathname === '/health') {
				json(res, 200, { status: 'ok' });
				return;
			}
			json(res, 404, { error: 'Not found' });
			return;
		}

		const [, webinarId, action] = idMatch;

		// GET /api/webinars/:id
		if (!action && method === 'GET') {
			const info = manager.getSessionInfo(webinarId);
			if (!info) {
				json(res, 404, { error: 'Not found' });
				return;
			}
			json(res, 200, info);
			return;
		}

		const body = method !== 'GET' ? ((await parseBody(req)) as any) : {};

		switch (action) {
			case 'join':
				if (method !== 'POST') break;
				const result = manager.join(webinarId, body.userId, body.name);
				json(res, 200, result);
				return;

			case 'leave':
				if (method !== 'POST') break;
				manager.leave(webinarId, body.userId);
				json(res, 200, { left: true });
				return;

			case 'start':
				if (method !== 'POST') break;
				manager.start(webinarId, body.hostId);
				json(res, 200, manager.getSessionInfo(webinarId));
				return;

			case 'end':
				if (method !== 'POST') break;
				manager.end(webinarId, body.hostId);
				json(res, 200, manager.getSessionInfo(webinarId));
				return;

			case 'promote':
				if (method !== 'POST') break;
				manager.promoteToPresenter(webinarId, body.userId);
				json(res, 200, { promoted: body.userId });
				return;

			case 'demote':
				if (method !== 'POST') break;
				manager.demoteToAttendee(webinarId, body.userId);
				json(res, 200, { demoted: body.userId });
				return;

			case 'questions':
				if (method === 'GET') {
					json(res, 200, { questions: manager.getQuestions(webinarId) });
					return;
				}
				if (method === 'POST') {
					const q = manager.submitQuestion(webinarId, body.userId, body.name, body.content);
					json(res, 201, { ...q, votes: q.votes.size });
					return;
				}
				break;

			case 'polls':
				if (method !== 'POST') break;
				const poll = manager.createPoll(webinarId, body.question, body.options);
				json(res, 201, { id: poll.id, question: poll.question, options: poll.options });
				return;

			case 'hand-raise':
				if (method !== 'POST') break;
				if (body.action === 'lower') {
					manager.lowerHand(webinarId, body.userId);
				} else {
					manager.raiseHand(webinarId, body.userId);
				}
				json(res, 200, { queue: manager.getHandRaisedQueue(webinarId) });
				return;

			case 'breakout-rooms':
				if (method === 'POST') {
					const rooms = manager.createBreakoutRooms(webinarId, body.count || 4);
					json(res, 201, {
						rooms: rooms.map((r) => ({
							id: r.id,
							name: r.name,
							participantCount: r.participantIds.size
						}))
					});
					return;
				}
				if (method === 'DELETE') {
					manager.closeBreakoutRooms(webinarId);
					json(res, 200, { closed: true });
					return;
				}
				break;

			case 'chat':
				if (method === 'POST') {
					const msg = manager.sendChat(webinarId, body.userId, body.name, body.content);
					json(res, 201, msg);
					return;
				}
				if (method === 'GET') {
					const s = manager.getSession(webinarId);
					json(res, 200, { messages: s?.chat.slice(-50) || [] });
					return;
				}
				break;

			case 'recording/start':
				json(res, 200, { recording: manager.toggleRecording(webinarId) });
				return;

			case 'recording/stop':
				json(res, 200, { recording: manager.toggleRecording(webinarId) });
				return;
		}

		// Handle question upvote and poll vote
		const qUpvote = url.pathname.match(/^\/api\/webinars\/([^/]+)\/questions\/([^/]+)\/upvote$/);
		if (qUpvote && method === 'POST') {
			manager.upvoteQuestion(qUpvote[1], qUpvote[2], body.userId);
			json(res, 200, { upvoted: true });
			return;
		}

		const pVote = url.pathname.match(/^\/api\/webinars\/([^/]+)\/polls\/([^/]+)\/vote$/);
		if (pVote && method === 'POST') {
			manager.votePoll(pVote[1], pVote[2], body.userId, body.optionIndex);
			json(res, 200, manager.getPollResults(pVote[1], pVote[2]));
			return;
		}

		json(res, 404, { error: 'Not found' });
	} catch (err: any) {
		json(res, 400, { error: err.message || 'Internal server error' });
	}
});

const PORT = parseInt(process.env.PORT || '3000');
server.listen(PORT, () => console.log(`Webinar Platform on http://localhost:${PORT}`));
process.on('SIGTERM', () => server.close());
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"sort"
	"sync"
	"syscall"
	"time"
)

// ===========================================
// 1. TYPES
// ===========================================
type Participant struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Role           string `json:"role"`
	JoinedAt       string `json:"joinedAt"`
	IsMuted        bool   `json:"isMuted"`
	IsCameraOn     bool   `json:"isCameraOn"`
	IsHandRaised   bool   `json:"isHandRaised"`
	HandRaisedAt   int64  `json:"handRaisedAt,omitempty"`
}

type Question struct {
	ID         string          `json:"id"`
	AuthorName string          `json:"authorName"`
	Content    string          `json:"content"`
	Votes      map[string]bool `json:"-"`
	VoteCount  int             `json:"votes"`
	IsAnswered bool            `json:"isAnswered"`
}

type Poll struct {
	ID       string         `json:"id"`
	Question string         `json:"question"`
	Options  []string       `json:"options"`
	Votes    map[int]int    `json:"votes"`
	Voters   map[string]bool `json:"-"`
	IsOpen   bool           `json:"isOpen"`
	Total    int            `json:"totalVotes"`
}

type ChatMsg struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Name      string `json:"name"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
}

type BreakoutRoom struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Participants []string `json:"participants"`
}

type WebinarSession struct {
	ID            string
	Title         string
	HostID        string
	Status        string
	Participants  map[string]*Participant
	WaitingRoom   map[string]*Participant
	Questions     map[string]*Question
	Polls         map[string]*Poll
	BreakoutRooms map[string]*BreakoutRoom
	Chat          []ChatMsg
	IsRecording   bool
	CreatedAt     string
}

// ===========================================
// 2. WEBINAR MANAGER
// ===========================================
type WebinarManager struct {
	mu       sync.Mutex
	sessions map[string]*WebinarSession
	counter  int
}

func NewWebinarManager() *WebinarManager {
	return &WebinarManager{sessions: make(map[string]*WebinarSession)}
}

func (wm *WebinarManager) Create(hostID, hostName, title string) *WebinarSession {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	wm.counter++
	s := &WebinarSession{
		ID: fmt.Sprintf("webinar_%d", wm.counter), Title: title, HostID: hostID,
		Status: "waiting", Participants: make(map[string]*Participant),
		WaitingRoom: make(map[string]*Participant), Questions: make(map[string]*Question),
		Polls: make(map[string]*Poll), BreakoutRooms: make(map[string]*BreakoutRoom),
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	s.Participants[hostID] = &Participant{ID: hostID, Name: hostName, Role: "host",
		JoinedAt: time.Now().UTC().Format(time.RFC3339), IsCameraOn: true}
	wm.sessions[s.ID] = s
	return s
}

func (wm *WebinarManager) Join(id, userID, name string) (bool, error) {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	s := wm.sessions[id]
	if s == nil { return false, fmt.Errorf("not found") }
	p := &Participant{ID: userID, Name: name, Role: "attendee",
		JoinedAt: time.Now().UTC().Format(time.RFC3339), IsMuted: true}
	if s.Status == "waiting" { s.WaitingRoom[userID] = p; return false, nil }
	s.Participants[userID] = p
	return true, nil
}

func (wm *WebinarManager) Start(id, hostID string) error {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	s := wm.sessions[id]
	if s == nil { return fmt.Errorf("not found") }
	if s.HostID != hostID { return fmt.Errorf("not host") }
	s.Status = "live"
	for uid, p := range s.WaitingRoom { s.Participants[uid] = p }
	s.WaitingRoom = make(map[string]*Participant)
	return nil
}

func (wm *WebinarManager) End(id, hostID string) error {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	s := wm.sessions[id]
	if s == nil { return fmt.Errorf("not found") }
	if s.HostID != hostID { return fmt.Errorf("not host") }
	s.Status = "ended"
	return nil
}

func (wm *WebinarManager) Promote(id, userID string) error {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	s := wm.sessions[id]; if s == nil { return fmt.Errorf("not found") }
	p := s.Participants[userID]; if p == nil { return fmt.Errorf("not found") }
	p.Role = "presenter"; p.IsMuted = false; p.IsCameraOn = true; p.IsHandRaised = false
	return nil
}

func (wm *WebinarManager) SubmitQuestion(id, userID, name, content string) *Question {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	s := wm.sessions[id]; if s == nil { return nil }
	wm.counter++
	q := &Question{ID: fmt.Sprintf("q_%d", wm.counter), AuthorName: name, Content: content,
		Votes: map[string]bool{userID: true}, VoteCount: 1}
	s.Questions[q.ID] = q
	return q
}

func (wm *WebinarManager) UpvoteQuestion(id, qID, userID string) {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	s := wm.sessions[id]; if s == nil { return }
	q := s.Questions[qID]; if q == nil { return }
	q.Votes[userID] = true; q.VoteCount = len(q.Votes)
}

func (wm *WebinarManager) GetQuestions(id string) []Question {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	s := wm.sessions[id]; if s == nil { return nil }
	var qs []Question
	for _, q := range s.Questions { qs = append(qs, *q) }
	sort.Slice(qs, func(i, j int) bool { return qs[i].VoteCount > qs[j].VoteCount })
	return qs
}

func (wm *WebinarManager) CreatePoll(id, question string, options []string) *Poll {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	s := wm.sessions[id]; if s == nil { return nil }
	wm.counter++
	p := &Poll{ID: fmt.Sprintf("poll_%d", wm.counter), Question: question, Options: options,
		Votes: make(map[int]int), Voters: make(map[string]bool), IsOpen: true}
	for i := range options { p.Votes[i] = 0 }
	s.Polls[p.ID] = p
	return p
}

func (wm *WebinarManager) VotePoll(id, pollID, userID string, optIdx int) error {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	s := wm.sessions[id]; if s == nil { return fmt.Errorf("not found") }
	p := s.Polls[pollID]; if p == nil { return fmt.Errorf("poll not found") }
	if !p.IsOpen { return fmt.Errorf("closed") }
	if p.Voters[userID] { return fmt.Errorf("already voted") }
	p.Voters[userID] = true; p.Votes[optIdx]++; p.Total = len(p.Voters)
	return nil
}

func (wm *WebinarManager) RaiseHand(id, userID string) {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	s := wm.sessions[id]; if s == nil { return }
	p := s.Participants[userID]; if p == nil { return }
	p.IsHandRaised = true; p.HandRaisedAt = time.Now().UnixMilli()
}

func (wm *WebinarManager) CreateBreakoutRooms(id string, count int) []BreakoutRoom {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	s := wm.sessions[id]; if s == nil { return nil }
	var attendees []string
	for _, p := range s.Participants {
		if p.Role == "attendee" { attendees = append(attendees, p.ID) }
	}
	perRoom := (len(attendees) + count - 1) / count
	var rooms []BreakoutRoom
	for i := 0; i < count; i++ {
		start := i * perRoom; end := start + perRoom
		if end > len(attendees) { end = len(attendees) }
		var pids []string
		if start < len(attendees) { pids = attendees[start:end] }
		room := BreakoutRoom{ID: fmt.Sprintf("room_%d", i+1), Name: fmt.Sprintf("Room %d", i+1), Participants: pids}
		s.BreakoutRooms[room.ID] = &room
		rooms = append(rooms, room)
	}
	return rooms
}

func (wm *WebinarManager) SendChat(id, userID, name, content string) *ChatMsg {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	s := wm.sessions[id]; if s == nil { return nil }
	wm.counter++
	msg := ChatMsg{ID: fmt.Sprintf("chat_%d", wm.counter), UserID: userID, Name: name,
		Content: content, Timestamp: time.Now().UnixMilli()}
	s.Chat = append(s.Chat, msg)
	if len(s.Chat) > 500 { s.Chat = s.Chat[len(s.Chat)-500:] }
	return &msg
}

func (wm *WebinarManager) GetInfo(id string) map[string]interface{} {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	s := wm.sessions[id]; if s == nil { return nil }
	return map[string]interface{}{
		"id": s.ID, "title": s.Title, "status": s.Status,
		"participantCount": len(s.Participants), "isRecording": s.IsRecording,
		"questionCount": len(s.Questions), "breakoutRoomCount": len(s.BreakoutRooms),
	}
}

// ===========================================
// 3. HTTP SERVER
// ===========================================
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json"); w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func main() {
	wm := NewWebinarManager()
	webinarAction := regexp.MustCompile(`^/api/webinars/([^/]+)/(.+)$`)
	webinarGet := regexp.MustCompile(`^/api/webinars/([^/]+)$`)

	mux := http.NewServeMux()

	mux.HandleFunc("/api/webinars", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost { writeJSON(w, 405, map[string]string{"error": "Method not allowed"}); return }
		var body struct{ HostID, HostName, Title string }
		json.NewDecoder(r.Body).Decode(&body)
		s := wm.Create(body.HostID, body.HostName, body.Title)
		writeJSON(w, 201, wm.GetInfo(s.ID))
	})

	mux.HandleFunc("/api/webinars/", func(w http.ResponseWriter, r *http.Request) {
		if m := webinarGet.FindStringSubmatch(r.URL.Path); m != nil && r.Method == http.MethodGet {
			info := wm.GetInfo(m[1])
			if info == nil { writeJSON(w, 404, map[string]string{"error": "Not found"}); return }
			writeJSON(w, 200, info); return
		}

		m := webinarAction.FindStringSubmatch(r.URL.Path)
		if m == nil { writeJSON(w, 404, map[string]string{"error": "Not found"}); return }
		id, action := m[1], m[2]

		var body map[string]interface{}
		if r.Method != http.MethodGet { json.NewDecoder(r.Body).Decode(&body) }
		str := func(k string) string { if v, ok := body[k].(string); ok { return v }; return "" }

		switch action {
		case "join":
			admitted, err := wm.Join(id, str("userId"), str("name"))
			if err != nil { writeJSON(w, 400, map[string]string{"error": err.Error()}); return }
			writeJSON(w, 200, map[string]bool{"admitted": admitted})
		case "start":
			if err := wm.Start(id, str("hostId")); err != nil { writeJSON(w, 400, map[string]string{"error": err.Error()}); return }
			writeJSON(w, 200, wm.GetInfo(id))
		case "end":
			if err := wm.End(id, str("hostId")); err != nil { writeJSON(w, 400, map[string]string{"error": err.Error()}); return }
			writeJSON(w, 200, wm.GetInfo(id))
		case "promote":
			wm.Promote(id, str("userId"))
			writeJSON(w, 200, map[string]string{"promoted": str("userId")})
		case "questions":
			if r.Method == http.MethodGet { writeJSON(w, 200, map[string]interface{}{"questions": wm.GetQuestions(id)}); return }
			q := wm.SubmitQuestion(id, str("userId"), str("name"), str("content"))
			writeJSON(w, 201, q)
		case "polls":
			opts, _ := body["options"].([]interface{})
			var options []string
			for _, o := range opts { if s, ok := o.(string); ok { options = append(options, s) } }
			p := wm.CreatePoll(id, str("question"), options)
			writeJSON(w, 201, p)
		case "hand-raise":
			wm.RaiseHand(id, str("userId"))
			writeJSON(w, 200, map[string]string{"status": "raised"})
		case "breakout-rooms":
			if r.Method == http.MethodPost {
				count := 4
				if c, ok := body["count"].(float64); ok { count = int(c) }
				rooms := wm.CreateBreakoutRooms(id, count)
				writeJSON(w, 201, map[string]interface{}{"rooms": rooms})
			} else { writeJSON(w, 404, map[string]string{"error": "Not found"}) }
		case "chat":
			if r.Method == http.MethodPost {
				msg := wm.SendChat(id, str("userId"), str("name"), str("content"))
				writeJSON(w, 201, msg)
			}
		default:
			// Handle nested routes
			qUpvote := regexp.MustCompile(`^questions/([^/]+)/upvote$`)
			pVote := regexp.MustCompile(`^polls/([^/]+)/vote$`)
			if qm := qUpvote.FindStringSubmatch(action); qm != nil {
				wm.UpvoteQuestion(id, qm[1], str("userId"))
				writeJSON(w, 200, map[string]bool{"upvoted": true})
			} else if pm := pVote.FindStringSubmatch(action); pm != nil {
				optIdx := 0
				if o, ok := body["optionIndex"].(float64); ok { optIdx = int(o) }
				if err := wm.VotePoll(id, pm[1], str("userId"), optIdx); err != nil {
					writeJSON(w, 400, map[string]string{"error": err.Error()}); return
				}
				writeJSON(w, 200, map[string]string{"voted": "ok"})
			} else { writeJSON(w, 404, map[string]string{"error": "Not found"}) }
		}
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })

	port := os.Getenv("PORT"); if port == "" { port = "3000" }
	srv := &http.Server{Addr: ":" + port, Handler: mux, ReadTimeout: 5 * time.Second, WriteTimeout: 10 * time.Second}
	go func() {
		log.Printf("Webinar Platform on http://localhost:%s", port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed { log.Fatal(err) }
	}()
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit; srv.Close()
}
```

</div>
</CodeTabs>

## ডিজাইন সিদ্ধান্তের ব্যাখ্যা

### MCU বা Mesh-এর বদলে SFU কেন?

Mesh: 25 presenter = প্রতিজন 24টা stream আপলোড করে। অসম্ভব। MCU: সার্ভার real-time-এ 25টা stream ডিকোড ও re-encode করে — অত্যন্ত CPU-ব্যয়বহুল, 200ms+ latency যোগ করে। SFU: প্রতিজন 1টা stream আপলোড করে, সার্ভার সেটা প্রসেসিং ছাড়াই অন্যদের কাছে ফরওয়ার্ড করে। 25 presenter আর 10K attendee-র একটা ওয়েবিনারে, SFU 25টা inbound stream হ্যান্ডল করে আর কোনো transcoding ছাড়াই 10K subscriber-এ ফ্যান-আউট করে।

### Simulcast কেন?

Simulcast ছাড়া, ভিন্ন bandwidth-এর ভিউয়ারদের জন্য SFU-কে ভিডিও transcode করতে হয় — ব্যয়বহুল আর latency যোগকারী। Simulcast দিয়ে, প্রতিটা presenter একসাথে 3টা কোয়ালিটি লেভেলে এনকোড করে। SFU শুধু বেছে নেয় প্রতি ভিউয়ারের জন্য কোন কোয়ালিটি ফরওয়ার্ড করবে। fiber-এ থাকা একজন ভিউয়ার 720p পায়, 3G-তে থাকা একজন 180p পায় — কোনো সার্ভার প্রসেসিং লাগে না।

### Signaling-এর জন্য WebSocket কেন?

WebRTC-র SDP offer/answer আর ICE candidate এক্সচেঞ্জ করতে একটা signaling চ্যানেল দরকার। WebSocket low-latency, bidirectional কমিউনিকেশন দেয় যা এর জন্য পারফেক্ট। signaling server room-scoped ইভেন্টও (Q&A আপডেট, পোল রেজাল্ট, হ্যান্ড রেইজ) হ্যান্ডল করে — যা মিডিয়া নয় এমন সবকিছুর জন্য এটাই control plane।

### Composite রেকর্ডিং সার্ভার-সাইডে কেন?

Client-side রেকর্ডিং করতে হলে প্রতিটা ভিউয়ারকে নিজের স্ক্রিন রেকর্ড করতে হতো — অসামঞ্জস্যপূর্ণ কোয়ালিটি, missing participant, আর এটা যে ঘটবে তার কোনো গ্যারান্টি নেই। সার্ভার-সাইড composite রেকর্ডিং SFU-তে সব মিডিয়া stream ক্যাপচার করে, সেগুলোকে একটা single ভিডিওতে (স্ক্রিন শেয়ার সহ grid লেআউট) কম্পোজিট করে, আর একটা রেকর্ডিং তৈরি করে যা attendee-রা যা দেখেছে ঠিক তেমনই দেখায়।

### Q&A-কে চ্যাট থেকে আলাদা কেন?

চ্যাট হলো ephemeral, high-volume, আর conversational। Q&A হলো structured, persistent, আর প্রাসঙ্গিকতা অনুযায়ী (upvote দিয়ে) সাজানো। দুটো মিশিয়ে ফেললে গুরুত্বপূর্ণ প্রশ্নগুলো চ্যাট মেসেজের নিচে চাপা পড়ে যায়। আলাদা সিস্টেম host-কে "hi!" মেসেজ স্ক্রল না করে top-voted প্রশ্নগুলোতে ফোকাস করতে দেয়। চ্যাট কমিউনিটির জন্য; Q&A জ্ঞানের জন্য।

<div class="takeaways">

### মূল শিক্ষা

- SFU (Selective Forwarding Unit) ওয়েবিনারের জন্য sweet spot — এটা MCU mixing-এর CPU খরচ ছাড়াই 25+ ভিডিও stream হ্যান্ডল করে
- Simulcast প্রতিটা sender-কে একবার 3টা কোয়ালিটি লেভেলে এনকোড করতে দেয়, আর SFU প্রতি ভিউয়ারের জন্য সঠিক কোয়ালিটি বেছে নেয় — কোনো সার্ভার transcoding লাগে না
- Role-based অ্যাক্সেস (host/presenter/attendee) ওয়েবিনারকে গোছানো রাখে — প্রোমোশন ছাড়া attendee-রা নিজেদের unmute করতে বা স্ক্রিন শেয়ার করতে পারে না
- upvoting সহ Q&A সবচেয়ে প্রাসঙ্গিক প্রশ্নগুলো সামনে আনে, host-কে ডুপ্লিকেটে ডুবিয়ে না দিয়ে
- ব্রেকআউট রুম আসলে ephemeral সাব-session ছাড়া কিছু নয় — প্রতিটা তার নিজের SFU রাউটিং আর চ্যাট scope পায়
- সার্ভার-সাইড composite রেকর্ডিং একটা single ভিডিও ফাইল তৈরি করে যা attendee-রা যা দেখেছে তার মতোই দেখায় — client-side রেকর্ডিংয়ের চেয়ে অনেক সহজ

</div>

<div class="when-to-use">

### বাস্তব জগতে ব্যবহার

- **Zoom** simulcast সহ SFU সার্ভারের একটা গ্লোবাল নেটওয়ার্ক ব্যবহার করে, সর্বোচ্চ 1000 ভিডিও participant আর একসাথে 49 জন অন-স্ক্রিন সাপোর্ট করে
- **Google Meet** bandwidth-adaptive ফরওয়ার্ডিংয়ের জন্য simulcast আর VP9/AV1 SVC (Scalable Video Coding) সহ SFU ব্যবহার করে
- **Microsoft Teams** ওয়েবিনার মোডে role-based কন্ট্রোল আর Q&A সহ সর্বোচ্চ 10,000 attendee সাপোর্ট করে
- **Hopin** তাদের ভার্চুয়াল ইভেন্ট প্ল্যাটফর্ম WebRTC SFU আর্কিটেকচারের ওপর তৈরি করেছে, ব্রেকআউট রুম আর ইন্টারঅ্যাক্টিভ ফিচার সহ
- এই আর্কিটেকচার প্রতি ওয়েবিনারে 10K attendee সাপোর্ট করে, sub-200ms অডিও latency আর ইন্টারঅ্যাক্টিভ ফিচার সহ

</div>
