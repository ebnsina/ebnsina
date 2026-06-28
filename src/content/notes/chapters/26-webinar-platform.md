---
title: 'Case Study: Webinar & Video Conferencing Platform'
subtitle: 'Design and build a production webinar system with multi-party video, screen sharing, Q&A, polls, breakout rooms, and recording.'
chapter: 26
level: 'advanced'
readingTime: '33 min'
topics: ['webinar', 'video conferencing', 'WebRTC', 'SFU', 'breakout rooms', 'recording']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## What Makes Video Conferencing Different from Live Streaming?

Live streaming is **one-to-many**: one broadcaster, millions of passive viewers. Video conferencing is **many-to-many**: every participant can send and receive video simultaneously. Webinars sit in between — a few **presenters** broadcast to many **attendees** who interact through Q&A, chat, polls, and hand-raising. This in-between model creates unique challenges: the media architecture must handle bidirectional video for presenters while scaling to thousands of view-only attendees, all with sub-200ms audio latency.

Think of it like a town hall meeting versus a TV broadcast.

<Callout type="info">

**Real-World Analogy**

Like a town hall meeting — speakers present on stage, the audience can raise hands, ask questions through a moderator, and vote. Unlike a TV broadcast, interaction flows both ways.

</Callout>

A TV broadcast (live streaming) goes one direction — the studio to your screen. A town hall (webinar) has speakers on stage, but the audience can raise their hand, ask questions through a moderator, and vote on proposals. The infrastructure must handle both the broadcast and the interaction simultaneously.

<Mermaid
title="Webinar Platform Architecture"
code={`graph TD
  P["Presenters<br/>WebRTC"] --> S["SFU Server<br/>Media Routing"] --> A["Attendees<br/>View & Interact"]
  S --> SG["Signaling Server<br/>WebSocket"] --> SM["Session Manager<br/>Rooms & Roles"] --> R["Recording<br/>Composite & Store"]`}
/>

## Requirements

- **Functional**: Multi-party video (up to 25 on camera), screen sharing, Q&A with upvoting, polls with live results, hand-raising, breakout rooms, recording, waiting room, attendee management (mute/kick), chat
- **Non-functional**: Sub-200ms audio latency, support 10K attendees per webinar, 99.9% uptime, graceful quality degradation on poor networks
- **Scale**: 1000 concurrent webinars, 1M total concurrent attendees

## WebRTC & Media Architecture Deep Dive

### Mesh vs SFU vs MCU

**Mesh (Peer-to-Peer):** Every participant sends their video directly to every other participant. With N participants, each person sends N-1 streams and receives N-1 streams. This works for 2-4 people but falls apart quickly — 10 participants means each person manages 9 upload + 9 download streams.

**SFU (Selective Forwarding Unit):** Each participant sends one upload stream to the server, which forwards it to other participants. The server doesn't decode or re-encode — it just routes packets. With 10 participants, each person uploads 1 stream and downloads 9. The SFU decides which streams to forward based on who's speaking, screen layout, and viewer bandwidth.

**MCU (Multipoint Conferencing Unit):** The server decodes all incoming streams, composites them into a single mixed stream, and sends one stream to each participant. Each person uploads 1 and downloads 1. But the server does expensive real-time video encoding, limiting scalability and adding latency.

**For webinars, SFU is the sweet spot.** Presenters (5-25 people) each upload one stream. The SFU forwards presenter streams to thousands of attendees. No expensive server-side transcoding. Attendees only download, they don't upload.

### Simulcast

Instead of the SFU transcoding video for different bandwidth viewers, **simulcast** pushes the work to the sender. Each presenter encodes their video at 3 quality levels simultaneously (e.g., 720p, 360p, 180p). The SFU then selects which quality to forward to each viewer based on their available bandwidth. This eliminates server-side transcoding entirely.

### Signaling

Before WebRTC media can flow, peers must exchange connection information via a **signaling server** (usually WebSocket). This includes SDP (Session Description Protocol) offers/answers (describing codecs, resolutions) and ICE candidates (network paths). The signaling server doesn't carry any media — it's just a rendezvous point.

## Webinar Features Deep Dive

**Roles:** Host (full control — mute anyone, end session, manage settings), Presenter (can share camera/screen), Attendee (view only + interact via Q&A/chat/polls). The role system ensures attendees can't unmute themselves or share their screen without being promoted.

**Q&A:** Attendees submit questions, others upvote. The host sees questions sorted by votes, can answer inline, mark as answered, or dismiss. This surfaces the most relevant questions without the host drowning in duplicates.

**Polls:** Host creates a poll with options, attendees vote in real-time, results update live for everyone. Polls drive engagement and give presenters real-time audience feedback.

**Breakout Rooms:** The host splits attendees into small groups, each with their own isolated SFU session, chat, and media. When breakout time ends, everyone returns to the main room. Breakout rooms are just ephemeral sub-sessions.

**Hand Raising:** Attendees join a queue. The host sees the queue and can promote an attendee to presenter (temporarily granting camera/mic access) for a live Q&A segment.

## Building the Webinar Platform

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

## Design Decisions Explained

### Why SFU Instead of MCU or Mesh?

Mesh: 25 presenters = each person uploads 24 streams. Impossible. MCU: server decodes and re-encodes 25 streams in real-time — extremely CPU expensive, adds 200ms+ latency. SFU: each person uploads 1 stream, server forwards it to others without processing. For a webinar with 25 presenters and 10K attendees, the SFU handles 25 inbound streams and fans out to 10K subscribers with zero transcoding.

### Why Simulcast?

Without simulcast, the SFU must transcode video for viewers with different bandwidths — expensive and latency-adding. With simulcast, each presenter encodes at 3 quality levels simultaneously. The SFU just picks which quality to forward per viewer. A viewer on fiber gets 720p, a viewer on 3G gets 180p — no server processing required.

### Why WebSocket for Signaling?

WebRTC requires a signaling channel to exchange SDP offers/answers and ICE candidates. WebSocket provides low-latency, bidirectional communication perfect for this. The signaling server also handles room-scoped events (Q&A updates, poll results, hand raises) — it's the control plane for everything that isn't media.

### Why Composite Recording Server-Side?

Client-side recording would require each viewer to record their own screen — inconsistent quality, missing participants, and no guarantee it happens. Server-side composite recording captures all media streams at the SFU, composites them into a single video (grid layout with screen share), and produces one recording that looks exactly like what attendees saw.

### Why Separate Q&A from Chat?

Chat is ephemeral, high-volume, and conversational. Q&A is structured, persistent, and sorted by relevance (upvotes). Mixing them means important questions get buried under chat messages. Separate systems let the host focus on the top-voted questions without scrolling through "hi!" messages. Chat is for community; Q&A is for knowledge.

<div class="takeaways">

### Key Takeaways

- SFU (Selective Forwarding Unit) is the sweet spot for webinars — it handles 25+ video streams without the CPU cost of MCU mixing
- Simulcast lets each sender encode once at 3 quality levels, and the SFU picks the right quality per viewer — no server transcoding needed
- Role-based access (host/presenter/attendee) keeps webinars organized — attendees can't unmute themselves or share screen without promotion
- Q&A with upvoting surfaces the most relevant questions without the host drowning in duplicates
- Breakout rooms are just ephemeral sub-sessions — each gets its own SFU routing and chat scope
- Server-side composite recording produces a single video file that looks like what attendees saw — much simpler than client-side recording

</div>

<div class="when-to-use">

### Real-World Usage

- **Zoom** uses a global network of SFU servers with simulcast, supporting up to 1000 video participants and 49 on-screen simultaneously
- **Google Meet** uses SFU with simulcast and VP9/AV1 SVC (Scalable Video Coding) for bandwidth-adaptive forwarding
- **Microsoft Teams** supports up to 10,000 attendees in webinar mode with role-based controls and Q&A
- **Hopin** built their virtual event platform on WebRTC SFU architecture with breakout rooms and interactive features
- This architecture supports 10K attendees per webinar with sub-200ms audio latency and interactive features

</div>
