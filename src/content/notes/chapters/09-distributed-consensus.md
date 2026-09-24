---
title: 'ডিস্ট্রিবিউটেড কনসেনসাস'
subtitle: 'term ম্যানেজমেন্ট, vote request আর heartbeat সহ সরলীকৃত Raft leader election implement করুন।'
chapter: 9
level: 'advanced'
readingTime: '25 মিনিট'
topics: ['Raft', 'leader election', 'consensus', 'distributed systems']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

গ্রামের শালিস কমিটির সাত সদস্য বসেছে মেলার তারিখ ঠিক করতে। নিয়ম সোজা — কোনো সিদ্ধান্ত তখনই পাস, যখন সংখ্যাগরিষ্ঠ, মানে সাতজনের মধ্যে অন্তত চারজন একমত হয়। সেদিন সিনা আর ফাতিমা কাজে আটকে আসতে পারেনি, তবু বাকি পাঁচজন হাজির ছিল বলে বৈঠক থেমে থাকেনি — পাঁচজনের মধ্যে চারজন যেহেতু একটা তারিখে রাজি, তাই সিদ্ধান্ত পাকা হয়ে গেল, দুজন অনুপস্থিত থাকা সত্ত্বেও। প্রস্তাব কে তুলবে সেটা নিয়ে হুড়োহুড়ি এড়াতে ওরা আগেই খোয়ারিজমিকে সভাপতি বেছে নিয়েছিল; সেই একাই প্রস্তাব তোলে, বাকিরা কেবল হ্যাঁ-না ভোট দেয়।

মাঝপথে খোয়ারিজমিকে জরুরি কাজে গ্রামের বাইরে যেতে হলো, বৈঠক নেতৃত্বহীন। বাকিরা তখন আর অপেক্ষা না করে নতুন করে ভোট দিয়ে ফাতিমাকে সভাপতি বানাল, আর কাজ যেভাবে চলছিল সেভাবেই চলতে থাকল। গুরুত্বপূর্ণ ব্যাপার — প্রতিটা চূড়ান্ত সিদ্ধান্ত সবাই একই কার্যবিবরণী খাতায় (মিনিট-বুকে) হুবহু একই কথায় লিখে রাখে, যাতে যে-ই পরে খাতা খুলুক, সবার কাছে ঠিক একই ইতিহাস থাকে, কোনো গরমিল নয়।

এই গল্পটাই আসলে **distributed consensus**। কমিটির সদস্যরা হলো node, সংখ্যাগরিষ্ঠের রাজি হওয়াটাই **quorum** — কয়েকজন অনুপস্থিত বা যোগাযোগহীন থাকলেও সিস্টেম আটকায় না। এক সভাপতি বেছে নেওয়া হলো **leader election**, আর সভাপতি হারিয়ে গেলে নতুন সভাপতি বেছে নেওয়াটাই re-election; সবার একই মিনিট-বুক হলো replicated log। **Raft** ঠিক এভাবেই কাজ করে, আর এর উপরেই দাঁড়িয়ে আছে etcd, ZooKeeper-এর মতো সিস্টেম — যেখানে একগুচ্ছ সার্ভারকে ব্যর্থতা সত্ত্বেও একটাই সিদ্ধান্তে একমত থাকতে হয়।

## কনসেনসাস সমস্যা

একটা ডিস্ট্রিবিউটেড সিস্টেমে একাধিক সার্ভারকে একই মানে একমত হতে হয়, এমনকি যখন কিছু সার্ভার ক্র্যাশ করে বা নেটওয়ার্ক partition ঘটে। এটাই **কনসেনসাস সমস্যা** — আর এটা কম্পিউটার সায়েন্সের কঠিনতম সমস্যাগুলোর একটা।

**Raft** এটা সমাধান করে একটা মাত্র leader নির্বাচন করে, যে সব সিদ্ধান্ত নেয়। leader মারা গেলে বাকি node-গুলো একটা নতুন leader নির্বাচন করে। এটা Paxos-এর মতো বিকল্পগুলোর চেয়ে সহজ কিন্তু সমানভাবে সঠিক।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা board of directors-এর ভোটের মতো — একাধিক সদস্যকে একটা সিদ্ধান্তে একমত হতে হয়, আর পাস হতে সংখ্যাগরিষ্ঠতা লাগে। চেয়ারম্যান পদত্যাগ করলে একটা নতুন নির্বাচন হয়।

</Callout>

<Mermaid
title="Raft Leader Election"
code={`graph LR
  L["Leader<br/>Term 3"] -- heartbeat --> F1["Follower 1"]
  L -- heartbeat --> F2["Follower 2"]
  L -- heartbeat --> F3["Follower 3"]
  L -- heartbeat --> F4["Follower 4"]`}
/>

## Raft-এর মূল ধারণা

- **Term** — একটা লজিক্যাল ঘড়ি। প্রতিটা নির্বাচন term বাড়িয়ে দেয়। উচ্চতর term থাকা node বিরোধে জেতে।
- **Leader** — সব ক্লায়েন্ট রিকোয়েস্ট হ্যান্ডল করে আর follower-দের কাছে replicate করে
- **Candidate** — একটা follower যে leader-এর কাছ থেকে কিছু শোনেনি আর একটা নির্বাচন শুরু করে
- **Follower** — passive node যে leader/candidate-এর রিকোয়েস্টে সাড়া দেয়
- **Majority (quorum)** — leader হতে একটা candidate-কে সংখ্যাগরিষ্ঠ ভোট লাগে (যেমন 5-এর মধ্যে 3)

<CodeTabs tsFile="raft.ts" goFile="raft.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import dgram from 'node:dgram';

// --- Types ---
type NodeState = 'follower' | 'candidate' | 'leader';

interface VoteRequest {
	type: 'vote_request';
	term: number;
	candidateId: string;
	lastLogIndex: number;
	lastLogTerm: number;
}

interface VoteResponse {
	type: 'vote_response';
	term: number;
	voteGranted: boolean;
	voterId: string;
}

interface Heartbeat {
	type: 'heartbeat';
	term: number;
	leaderId: string;
}

interface HeartbeatResponse {
	type: 'heartbeat_response';
	term: number;
	nodeId: string;
	success: boolean;
}

type RaftMessage = VoteRequest | VoteResponse | Heartbeat | HeartbeatResponse;

interface Peer {
	id: string;
	host: string;
	port: number;
}

// --- Raft Node ---
class RaftNode {
	private state: NodeState = 'follower';
	private currentTerm = 0;
	private votedFor: string | null = null;
	private leaderId: string | null = null;
	private votesReceived = new Set<string>();

	private electionTimeout: ReturnType<typeof setTimeout> | null = null;
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

	private socket: dgram.Socket;

	// Timing (randomized to prevent split votes)
	private readonly ELECTION_TIMEOUT_MIN = 1500; // ms
	private readonly ELECTION_TIMEOUT_MAX = 3000;
	private readonly HEARTBEAT_INTERVAL = 500;

	constructor(
		private readonly id: string,
		private readonly port: number,
		private readonly peers: Peer[],
		private readonly logIndex: number = 0,
		private readonly logTerm: number = 0
	) {
		this.socket = dgram.createSocket('udp4');
		this.socket.on('message', (data) => this.handleMessage(data));
		this.socket.bind(port);
	}

	start(): void {
		console.log(`[${this.id}] Starting as follower (term ${this.currentTerm})`);
		this.resetElectionTimeout();
	}

	private randomElectionTimeout(): number {
		return (
			this.ELECTION_TIMEOUT_MIN +
			Math.random() * (this.ELECTION_TIMEOUT_MAX - this.ELECTION_TIMEOUT_MIN)
		);
	}

	private resetElectionTimeout(): void {
		if (this.electionTimeout) clearTimeout(this.electionTimeout);
		this.electionTimeout = setTimeout(() => this.startElection(), this.randomElectionTimeout());
	}

	// --- State transitions ---
	private startElection(): void {
		this.state = 'candidate';
		this.currentTerm++;
		this.votedFor = this.id;
		this.votesReceived.clear();
		this.votesReceived.add(this.id); // vote for self

		console.log(`[${this.id}] Starting election for term ${this.currentTerm}`);

		// Request votes from all peers
		const request: VoteRequest = {
			type: 'vote_request',
			term: this.currentTerm,
			candidateId: this.id,
			lastLogIndex: this.logIndex,
			lastLogTerm: this.logTerm
		};

		for (const peer of this.peers) {
			this.send(peer, request);
		}

		this.resetElectionTimeout();
	}

	private becomeLeader(): void {
		if (this.state !== 'candidate') return;

		this.state = 'leader';
		this.leaderId = this.id;
		console.log(`[${this.id}] Became LEADER for term ${this.currentTerm}`);

		// Stop election timer
		if (this.electionTimeout) clearTimeout(this.electionTimeout);

		// Start sending heartbeats
		this.sendHeartbeats();
		this.heartbeatInterval = setInterval(() => this.sendHeartbeats(), this.HEARTBEAT_INTERVAL);
	}

	private stepDown(newTerm: number): void {
		console.log(`[${this.id}] Stepping down. Old term: ${this.currentTerm}, new term: ${newTerm}`);
		this.state = 'follower';
		this.currentTerm = newTerm;
		this.votedFor = null;
		this.leaderId = null;

		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}

		this.resetElectionTimeout();
	}

	// --- Message handling ---
	private handleMessage(data: Buffer): void {
		const msg: RaftMessage = JSON.parse(data.toString());

		switch (msg.type) {
			case 'vote_request':
				this.handleVoteRequest(msg);
				break;
			case 'vote_response':
				this.handleVoteResponse(msg);
				break;
			case 'heartbeat':
				this.handleHeartbeat(msg);
				break;
			case 'heartbeat_response':
				this.handleHeartbeatResponse(msg);
				break;
		}
	}

	private handleVoteRequest(req: VoteRequest): void {
		// If request has higher term, step down
		if (req.term > this.currentTerm) {
			this.stepDown(req.term);
		}

		let granted = false;

		if (
			req.term >= this.currentTerm &&
			(this.votedFor === null || this.votedFor === req.candidateId) &&
			(req.lastLogTerm > this.logTerm ||
				(req.lastLogTerm === this.logTerm && req.lastLogIndex >= this.logIndex))
		) {
			granted = true;
			this.votedFor = req.candidateId;
			this.resetElectionTimeout(); // reset since we granted a vote
		}

		const response: VoteResponse = {
			type: 'vote_response',
			term: this.currentTerm,
			voteGranted: granted,
			voterId: this.id
		};

		const peer = this.peers.find((p) => p.id === req.candidateId);
		if (peer) this.send(peer, response);
	}

	private handleVoteResponse(res: VoteResponse): void {
		if (res.term > this.currentTerm) {
			this.stepDown(res.term);
			return;
		}

		if (this.state !== 'candidate' || res.term !== this.currentTerm) return;

		if (res.voteGranted) {
			this.votesReceived.add(res.voterId);
			const majority = Math.floor((this.peers.length + 1) / 2) + 1;

			console.log(
				`[${this.id}] Got vote from ${res.voterId} (${this.votesReceived.size}/${majority} needed)`
			);

			if (this.votesReceived.size >= majority) {
				this.becomeLeader();
			}
		}
	}

	private handleHeartbeat(hb: Heartbeat): void {
		if (hb.term >= this.currentTerm) {
			if (this.state !== 'follower') {
				this.stepDown(hb.term);
			}
			this.currentTerm = hb.term;
			this.leaderId = hb.leaderId;
			this.resetElectionTimeout();
		}

		const peer = this.peers.find((p) => p.id === hb.leaderId);
		if (peer) {
			const response: HeartbeatResponse = {
				type: 'heartbeat_response',
				term: this.currentTerm,
				nodeId: this.id,
				success: hb.term >= this.currentTerm
			};
			this.send(peer, response);
		}
	}

	private handleHeartbeatResponse(_res: HeartbeatResponse): void {
		// In a full implementation, track which followers are up-to-date
	}

	// --- Communication ---
	private sendHeartbeats(): void {
		const hb: Heartbeat = {
			type: 'heartbeat',
			term: this.currentTerm,
			leaderId: this.id
		};
		for (const peer of this.peers) {
			this.send(peer, hb);
		}
	}

	private send(peer: Peer, msg: RaftMessage): void {
		const data = Buffer.from(JSON.stringify(msg));
		this.socket.send(data, peer.port, peer.host);
	}

	getStatus(): object {
		return {
			id: this.id,
			state: this.state,
			term: this.currentTerm,
			leader: this.leaderId,
			votedFor: this.votedFor
		};
	}
}

// --- Run a node ---
const nodeId = process.argv[2] || 'node-1';
const port = parseInt(process.argv[3] || '4001');

const allNodes: Peer[] = [
	{ id: 'node-1', host: '127.0.0.1', port: 4001 },
	{ id: 'node-2', host: '127.0.0.1', port: 4002 },
	{ id: 'node-3', host: '127.0.0.1', port: 4003 }
];

const peers = allNodes.filter((n) => n.id !== nodeId);
const node = new RaftNode(nodeId, port, peers);
node.start();

// Print status periodically
setInterval(() => {
	console.log(`[${nodeId}] Status:`, node.getStatus());
}, 5000);

process.on('SIGINT', () => process.exit(0));
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net"
	"os"
	"sync"
	"time"
)

// --- Types ---
type NodeState int

const (
	Follower NodeState = iota
	Candidate
	Leader
)

func (s NodeState) String() string {
	return [...]string{"follower", "candidate", "leader"}[s]
}

type VoteRequest struct {
	Type         string `json:"type"`
	Term         int    `json:"term"`
	CandidateID  string `json:"candidateId"`
	LastLogIndex int    `json:"lastLogIndex"`
	LastLogTerm  int    `json:"lastLogTerm"`
}

type VoteResponse struct {
	Type        string `json:"type"`
	Term        int    `json:"term"`
	VoteGranted bool   `json:"voteGranted"`
	VoterID     string `json:"voterId"`
}

type Heartbeat struct {
	Type     string `json:"type"`
	Term     int    `json:"term"`
	LeaderID string `json:"leaderId"`
}

type Peer struct {
	ID   string
	Addr *net.UDPAddr
}

// --- Raft Node ---
type RaftNode struct {
	mu sync.Mutex

	id           string
	state        NodeState
	currentTerm  int
	votedFor     string
	leaderID     string
	votesReceived map[string]bool
	logIndex     int
	logTerm      int

	peers []*Peer
	conn  *net.UDPConn

	electionTimer  *time.Timer
	heartbeatTicker *time.Ticker

	stopCh chan struct{}
}

const (
	electionTimeoutMin = 1500 * time.Millisecond
	electionTimeoutMax = 3000 * time.Millisecond
	heartbeatInterval  = 500 * time.Millisecond
)

func NewRaftNode(id string, port int, peers []*Peer) (*RaftNode, error) {
	addr, err := net.ResolveUDPAddr("udp", fmt.Sprintf(":%d", port))
	if err != nil {
		return nil, err
	}

	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return nil, err
	}

	return &RaftNode{
		id:            id,
		state:         Follower,
		votesReceived: make(map[string]bool),
		peers:         peers,
		conn:          conn,
		stopCh:        make(chan struct{}),
	}, nil
}

func randomTimeout() time.Duration {
	return electionTimeoutMin +
		time.Duration(rand.Int63n(int64(electionTimeoutMax-electionTimeoutMin)))
}

func (n *RaftNode) Start() {
	log.Printf("[%s] Starting as follower (term %d)", n.id, n.currentTerm)
	n.resetElectionTimer()
	go n.receiveMessages()
}

func (n *RaftNode) resetElectionTimer() {
	if n.electionTimer != nil {
		n.electionTimer.Stop()
	}
	n.electionTimer = time.AfterFunc(randomTimeout(), func() {
		n.mu.Lock()
		defer n.mu.Unlock()
		n.startElection()
	})
}

func (n *RaftNode) startElection() {
	n.state = Candidate
	n.currentTerm++
	n.votedFor = n.id
	n.votesReceived = map[string]bool{n.id: true}

	log.Printf("[%s] Starting election for term %d", n.id, n.currentTerm)

	req := VoteRequest{
		Type: "vote_request", Term: n.currentTerm,
		CandidateID: n.id, LastLogIndex: n.logIndex, LastLogTerm: n.logTerm,
	}

	for _, peer := range n.peers {
		n.sendTo(peer, req)
	}

	n.resetElectionTimer()
}

func (n *RaftNode) becomeLeader() {
	if n.state != Candidate {
		return
	}
	n.state = Leader
	n.leaderID = n.id
	log.Printf("[%s] Became LEADER for term %d", n.id, n.currentTerm)

	if n.electionTimer != nil {
		n.electionTimer.Stop()
	}

	// Start heartbeats
	n.sendHeartbeats()
	n.heartbeatTicker = time.NewTicker(heartbeatInterval)
	go func() {
		for range n.heartbeatTicker.C {
			n.mu.Lock()
			if n.state == Leader {
				n.sendHeartbeats()
			}
			n.mu.Unlock()
		}
	}()
}

func (n *RaftNode) stepDown(newTerm int) {
	log.Printf("[%s] Stepping down. Old term: %d, new: %d", n.id, n.currentTerm, newTerm)
	n.state = Follower
	n.currentTerm = newTerm
	n.votedFor = ""
	n.leaderID = ""

	if n.heartbeatTicker != nil {
		n.heartbeatTicker.Stop()
		n.heartbeatTicker = nil
	}
	n.resetElectionTimer()
}

// --- Message handling ---
func (n *RaftNode) receiveMessages() {
	buf := make([]byte, 4096)
	for {
		size, _, err := n.conn.ReadFromUDP(buf)
		if err != nil {
			continue
		}

		var raw map[string]interface{}
		json.Unmarshal(buf[:size], &raw)

		msgType, _ := raw["type"].(string)

		n.mu.Lock()
		switch msgType {
		case "vote_request":
			var req VoteRequest
			json.Unmarshal(buf[:size], &req)
			n.handleVoteRequest(req)
		case "vote_response":
			var res VoteResponse
			json.Unmarshal(buf[:size], &res)
			n.handleVoteResponse(res)
		case "heartbeat":
			var hb Heartbeat
			json.Unmarshal(buf[:size], &hb)
			n.handleHeartbeat(hb)
		}
		n.mu.Unlock()
	}
}

func (n *RaftNode) handleVoteRequest(req VoteRequest) {
	if req.Term > n.currentTerm {
		n.stepDown(req.Term)
	}

	granted := false
	if req.Term >= n.currentTerm &&
		(n.votedFor == "" || n.votedFor == req.CandidateID) &&
		(req.LastLogTerm > n.logTerm ||
			(req.LastLogTerm == n.logTerm && req.LastLogIndex >= n.logIndex)) {
		granted = true
		n.votedFor = req.CandidateID
		n.resetElectionTimer()
	}

	resp := VoteResponse{
		Type: "vote_response", Term: n.currentTerm,
		VoteGranted: granted, VoterID: n.id,
	}

	for _, p := range n.peers {
		if p.ID == req.CandidateID {
			n.sendTo(p, resp)
			break
		}
	}
}

func (n *RaftNode) handleVoteResponse(res VoteResponse) {
	if res.Term > n.currentTerm {
		n.stepDown(res.Term)
		return
	}
	if n.state != Candidate || res.Term != n.currentTerm {
		return
	}
	if res.VoteGranted {
		n.votesReceived[res.VoterID] = true
		majority := (len(n.peers)+1)/2 + 1
		log.Printf("[%s] Got vote from %s (%d/%d)",
			n.id, res.VoterID, len(n.votesReceived), majority)
		if len(n.votesReceived) >= majority {
			n.becomeLeader()
		}
	}
}

func (n *RaftNode) handleHeartbeat(hb Heartbeat) {
	if hb.Term >= n.currentTerm {
		if n.state != Follower {
			n.stepDown(hb.Term)
		}
		n.currentTerm = hb.Term
		n.leaderID = hb.LeaderID
		n.resetElectionTimer()
	}
}

func (n *RaftNode) sendHeartbeats() {
	hb := Heartbeat{Type: "heartbeat", Term: n.currentTerm, LeaderID: n.id}
	for _, peer := range n.peers {
		n.sendTo(peer, hb)
	}
}

func (n *RaftNode) sendTo(peer *Peer, msg interface{}) {
	data, _ := json.Marshal(msg)
	n.conn.WriteToUDP(data, peer.Addr)
}

func main() {
	nodeID := "node-1"
	port := 4001
	if len(os.Args) > 1 {
		nodeID = os.Args[1]
	}
	if len(os.Args) > 2 {
		fmt.Sscanf(os.Args[2], "%d", &port)
	}

	allNodes := map[string]int{"node-1": 4001, "node-2": 4002, "node-3": 4003}

	var peers []*Peer
	for id, p := range allNodes {
		if id != nodeID {
			addr, _ := net.ResolveUDPAddr("udp", fmt.Sprintf("127.0.0.1:%d", p))
			peers = append(peers, &Peer{ID: id, Addr: addr})
		}
	}

	node, err := NewRaftNode(nodeID, port, peers)
	if err != nil {
		log.Fatal(err)
	}

	node.Start()

	// Print status
	ticker := time.NewTicker(5 * time.Second)
	for range ticker.C {
		node.mu.Lock()
		log.Printf("[%s] state=%s term=%d leader=%s",
			node.id, node.state, node.currentTerm, node.leaderID)
		node.mu.Unlock()
	}
}
```

</div>
</CodeTabs>

<div class="takeaways">

### মূল শিক্ষা

- Raft নিশ্চিত করে প্রতি term-এ শুধু একটাই leader থাকে — সংখ্যাগরিষ্ঠ ভোট বাধ্যতামূলক করে split-brain ঠেকানো হয়
- **Randomized election timeout** একাধিক node-এর একসাথে নির্বাচন শুরু করা ঠেকায়
- উচ্চতর term সবসময় জেতে — একটা node উচ্চতর term দেখলে সাথে সাথে step down করে
- একটা candidate-কে vote পেতে হলে up-to-date log থাকতে হবে — এটা বাসি node-কে leader হওয়া থেকে ঠেকায়
- leader-এর কাছ থেকে **heartbeat** অপ্রয়োজনীয় নির্বাচন ঠেকায়

</div>

<div class="when-to-use">

### বাস্তব ব্যবহার

- **etcd** (Kubernetes ব্যবহার করে) ডিস্ট্রিবিউটেড key-value কনসেনসাসের জন্য Raft implement করে
- **CockroachDB** node জুড়ে consistent replication-এর জন্য Raft ব্যবহার করে
- **HashiCorp Consul** service discovery কনসেনসাসের জন্য Raft ব্যবহার করে
- আপনি নিজে খুব কমই কনসেনসাস implement করবেন। etcd, ZooKeeper, বা Consul ব্যবহার করুন। কিন্তু Raft বোঝা এই সিস্টেমগুলো ডিবাগ আর অপারেট করতে সাহায্য করে।

</div>
