---
title: 'WebSockets ও Real-time'
subtitle: 'WebSocket connection, room, presence tracking এবং message history সহ একটি real-time chat server বানান।'
chapter: 16
level: 'intermediate'
readingTime: '20 মিনিট'
topics: ['WebSocket', 'real-time', 'chat', 'presence', 'pub/sub']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

সিনা আর খোয়ারিজমি দূরের দুই শহরে থাকে। যোগাযোগ করতে সিনা একটা চিঠি লেখে, ডাকে দেয়, তারপর জবাবের জন্য বসে থাকে। খোয়ারিজমির উত্তর জানতে হলে প্রতিবার নতুন করে চিঠি পাঠাতে হয় — একটা প্রশ্ন, একটা খাম, একটা জবাব। কিছু জানার আছে কিনা বারবার খোঁজ নিতে সিনা যদি ঘণ্টায় ঘণ্টায় "নতুন কিছু হলো?" লিখে চিঠি পাঠাতে থাকে, বেশিরভাগ সময়ই ফাঁকা "না, কিছু হয়নি" জবাব ফিরে আসে — অথচ ডাক খরচ আর অপেক্ষা দুটোই গুনতে হয়। এদিকে খোয়ারিজমির হঠাৎ জরুরি খবর দেওয়ার দরকার হলেও সে নিজে থেকে কিছু জানাতে পারে না, সিনার পরের চিঠির জন্য বসে থাকতে হয়।

একদিন সিনা খোয়ারিজমিকে সরাসরি ফোন করল। লাইন যুক্ত হওয়ার পর দুজনের কেউই আর ফোন রাখল না — লাইনটা খোলা থাকল। এখন সিনার কিছু বলার হলে সঙ্গে সঙ্গে বলে, আবার খোয়ারিজমির কোনো খবর এলে সে-ও সঙ্গে সঙ্গে জানিয়ে দেয়, কেউ জিজ্ঞেস করা পর্যন্ত অপেক্ষা করতে হয় না। কেউ আর বারবার ডায়াল করছে না, নতুন করে খাম পাঠাচ্ছে না — একটাই খোলা লাইনে দুজন যখন খুশি কথা বলছে। পাশ থেকে ফাতিমাও ঢুকলে সে-ও একই লাইনে সঙ্গে সঙ্গে যুক্ত হয়ে যায়।

গল্পের প্রতিটা চিঠি-আর-জবাব হলো একেকটা HTTP **request/response** — প্রতিবার আলাদা করে চাইতে হয়। বারবার "নতুন কিছু হলো?" চিঠি পাঠানোটা হলো **polling**, যা বেশিরভাগ সময় খালি জবাব নিয়ে ফেরে। খোলা ফোন লাইনটাই **WebSocket** — একটা persistent, দুই-মুখী connection যেখানে server নিজে থেকে যেকোনো মুহূর্তে client-কে খবর পাঠাতে পারে (**server push**), client-এর চাওয়ার অপেক্ষা না করেই। ঠিক এই কারণেই chat, live dashboard, বা multiplayer game-এ WebSocket ব্যবহার হয় — যেখানে দুই পক্ষকেই সঙ্গে সঙ্গে, লাইন খোলা রেখে কথা বলতে হয়।

## WebSocket কী?

**WebSocket** client আর server-এর মধ্যে full-duplex, persistent connection দেয়। HTTP-র request/response মডেলের বিপরীতে, WebSocket দুই পক্ষকেই request-এর জন্য অপেক্ষা না করে যেকোনো সময় message পাঠাতে দেয়। এটাই প্রতিদিন আপনার ব্যবহার করা প্রতিটি real-time feature-এর ভিত্তি — chat, live notification, collaborative editing এবং multiplayer game।

HTTP-কে ভাবুন একে অপরকে চিঠি পাঠানোর মতো। প্রতিটি চিঠি স্বাধীন, আর আপনি জবাবের জন্য অপেক্ষা করেন। WebSocket হলো একটা ফোন কলের মতো — একবার লাইন খুলে গেলে, দুই পক্ষই যখন খুশি তখনই, সঙ্গে সঙ্গে কথা বলতে পারে, যতক্ষণ না কেউ ফোন রাখে।

<Mermaid
title="WebSocket Chat Architecture"
code={`graph LR
  A["Client A<br/>WebSocket"] --> WS1["WebSocket Server<br/>Connection Manager"] --> RM["Room Manager<br/>Pub/Sub"]
  B["Client B<br/>WebSocket"] --> WS2["WebSocket Server<br/>Connection Manager"] --> MS["Message Store<br/>Ring Buffer"]`}
/>

## বাস্তব জীবনের উদাহরণ

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

ফোন কল বনাম চিঠি পাঠানোর মতো — একবার কল যুক্ত হলে, দুই পক্ষই ফোন না রেখে অবাধে কথা বলতে পারে। HTTP হলো চিঠির মতো (প্রতি খামে একটা message), WebSocket হলো একটা ফোন কল (persistent connection)।

</Callout>

আপনি Slack খুললে, আপনার browser Slack-এর server-এর সাথে একটি WebSocket connection স্থাপন করে। সেই connection খোলা থাকে। কেউ আপনার channel-এ message টাইপ করলে, server সঙ্গে সঙ্গে সেটা আপনার browser-এ push করে — আপনাকে refresh বা poll করতে হয় না। একই connection typing indicator, presence update ("Fatima অনলাইনে") এবং read receipt সামলায়। Discord ঠিক এই architecture ব্যবহার করে 50 লক্ষেরও বেশি concurrent WebSocket connection সামলায়।

## একটি Real-Time Chat Server বানানো

এখানে একটি সম্পূর্ণ WebSocket chat server আছে — room, presence tracking, ring buffer দিয়ে message history এবং ping/pong heartbeat সহ। এটা production-grade architecture — কোনো toy উদাহরণ নয়।

<CodeTabs tsFile="chat-server.ts" goFile="chat-server.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import crypto from 'node:crypto';

// --- Types ---
interface ChatMessage {
	id: string;
	room: string;
	userId: string;
	content: string;
	timestamp: number;
}

interface ClientMessage {
	type: 'join' | 'leave' | 'message' | 'history';
	room?: string;
	content?: string;
	userId?: string;
}

interface ServerMessage {
	type: 'message' | 'join' | 'leave' | 'presence' | 'history' | 'error' | 'pong';
	room?: string;
	userId?: string;
	content?: string;
	messages?: ChatMessage[];
	users?: string[];
	timestamp?: number;
}

interface ConnectedClient {
	ws: WebSocket;
	userId: string;
	rooms: Set<string>;
	lastPing: number;
	isAlive: boolean;
}

// --- Ring Buffer for message history ---
class RingBuffer<T> {
	private buffer: (T | undefined)[];
	private head: number = 0;
	private count: number = 0;

	constructor(private capacity: number) {
		this.buffer = new Array(capacity);
	}

	push(item: T): void {
		this.buffer[this.head] = item;
		this.head = (this.head + 1) % this.capacity;
		if (this.count < this.capacity) this.count++;
	}

	getAll(): T[] {
		const result: T[] = [];
		if (this.count === 0) return result;

		const start = this.count < this.capacity ? 0 : this.head;

		for (let i = 0; i < this.count; i++) {
			const idx = (start + i) % this.capacity;
			const item = this.buffer[idx];
			if (item !== undefined) result.push(item);
		}
		return result;
	}
}

// --- Room Manager ---
class RoomManager {
	private rooms = new Map<string, Set<string>>(); // room -> set of userIds
	private history = new Map<string, RingBuffer<ChatMessage>>(); // room -> messages

	private static readonly MAX_HISTORY = 100;

	join(room: string, userId: string): string[] {
		if (!this.rooms.has(room)) {
			this.rooms.set(room, new Set());
			this.history.set(room, new RingBuffer(RoomManager.MAX_HISTORY));
		}
		this.rooms.get(room)!.add(userId);
		return Array.from(this.rooms.get(room)!);
	}

	leave(room: string, userId: string): string[] {
		const members = this.rooms.get(room);
		if (!members) return [];
		members.delete(userId);
		if (members.size === 0) {
			this.rooms.delete(room);
			this.history.delete(room);
			return [];
		}
		return Array.from(members);
	}

	getMembers(room: string): string[] {
		const members = this.rooms.get(room);
		return members ? Array.from(members) : [];
	}

	addMessage(room: string, message: ChatMessage): void {
		const buf = this.history.get(room);
		if (buf) buf.push(message);
	}

	getHistory(room: string): ChatMessage[] {
		const buf = this.history.get(room);
		return buf ? buf.getAll() : [];
	}

	getRoomsForUser(userId: string): string[] {
		const result: string[] = [];
		for (const [room, members] of this.rooms) {
			if (members.has(userId)) result.push(room);
		}
		return result;
	}
}

// --- Connection Manager ---
class ConnectionManager {
	private clients = new Map<WebSocket, ConnectedClient>();
	private userConnections = new Map<string, Set<WebSocket>>();

	add(ws: WebSocket, userId: string): ConnectedClient {
		const client: ConnectedClient = {
			ws,
			userId,
			rooms: new Set(),
			lastPing: Date.now(),
			isAlive: true
		};
		this.clients.set(ws, client);

		if (!this.userConnections.has(userId)) {
			this.userConnections.set(userId, new Set());
		}
		this.userConnections.get(userId)!.add(ws);

		return client;
	}

	remove(ws: WebSocket): ConnectedClient | undefined {
		const client = this.clients.get(ws);
		if (!client) return undefined;

		this.clients.delete(ws);
		const conns = this.userConnections.get(client.userId);
		if (conns) {
			conns.delete(ws);
			if (conns.size === 0) this.userConnections.delete(client.userId);
		}
		return client;
	}

	get(ws: WebSocket): ConnectedClient | undefined {
		return this.clients.get(ws);
	}

	getByRoom(room: string): ConnectedClient[] {
		const result: ConnectedClient[] = [];
		for (const client of this.clients.values()) {
			if (client.rooms.has(room)) result.push(client);
		}
		return result;
	}

	getAllClients(): ConnectedClient[] {
		return Array.from(this.clients.values());
	}
}

// --- Broadcast helper ---
function broadcast(clients: ConnectedClient[], message: ServerMessage, exclude?: WebSocket): void {
	const data = JSON.stringify(message);
	for (const client of clients) {
		if (client.ws !== exclude && client.ws.readyState === WebSocket.OPEN) {
			client.ws.send(data);
		}
	}
}

function sendTo(ws: WebSocket, message: ServerMessage): void {
	if (ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(message));
	}
}

// --- Initialize server ---
const PORT = parseInt(process.env.PORT || '3000', 10);
const server = http.createServer((_req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/plain' });
	res.end('WebSocket Chat Server');
});

const wss = new WebSocketServer({ server });
const rooms = new RoomManager();
const connections = new ConnectionManager();

// --- Handle connections ---
wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const userId = url.searchParams.get('userId') || `anon-${crypto.randomUUID().slice(0, 8)}`;

	console.log(`[CONNECT] User ${userId} connected`);
	const client = connections.add(ws, userId);

	// Setup ping/pong heartbeat
	ws.on('pong', () => {
		client.isAlive = true;
		client.lastPing = Date.now();
	});

	// Handle incoming messages
	ws.on('message', (raw: Buffer) => {
		let msg: ClientMessage;
		try {
			msg = JSON.parse(raw.toString('utf-8'));
		} catch {
			sendTo(ws, { type: 'error', content: 'Invalid JSON' });
			return;
		}

		switch (msg.type) {
			case 'join': {
				const room = msg.room;
				if (!room || typeof room !== 'string') {
					sendTo(ws, { type: 'error', content: 'room is required' });
					return;
				}
				client.rooms.add(room);
				const members = rooms.join(room, userId);
				console.log(`[JOIN] ${userId} joined room ${room} (${members.length} members)`);

				// Send presence update to room
				broadcast(connections.getByRoom(room), {
					type: 'join',
					room,
					userId,
					users: members,
					timestamp: Date.now()
				});

				// Send history to the joining user
				const history = rooms.getHistory(room);
				if (history.length > 0) {
					sendTo(ws, { type: 'history', room, messages: history });
				}
				break;
			}

			case 'leave': {
				const room = msg.room;
				if (!room) return;
				client.rooms.delete(room);
				const members = rooms.leave(room, userId);
				console.log(`[LEAVE] ${userId} left room ${room}`);

				broadcast(connections.getByRoom(room), {
					type: 'leave',
					room,
					userId,
					users: members,
					timestamp: Date.now()
				});
				break;
			}

			case 'message': {
				const room = msg.room;
				const content = msg.content;
				if (!room || !content || !client.rooms.has(room)) {
					sendTo(ws, { type: 'error', content: 'Must join room before sending messages' });
					return;
				}

				const chatMsg: ChatMessage = {
					id: crypto.randomUUID(),
					room,
					userId,
					content: content.slice(0, 4096), // Limit message size
					timestamp: Date.now()
				};

				rooms.addMessage(room, chatMsg);

				// Broadcast to all room members including sender
				broadcast(connections.getByRoom(room), {
					type: 'message',
					room,
					userId,
					content: chatMsg.content,
					timestamp: chatMsg.timestamp
				});
				break;
			}

			case 'history': {
				const room = msg.room;
				if (!room) return;
				const history = rooms.getHistory(room);
				sendTo(ws, { type: 'history', room, messages: history });
				break;
			}

			default:
				sendTo(ws, { type: 'error', content: `Unknown message type` });
		}
	});

	// Handle disconnection
	ws.on('close', () => {
		console.log(`[DISCONNECT] User ${userId} disconnected`);
		const client = connections.remove(ws);
		if (!client) return;

		// Leave all rooms and notify members
		for (const room of client.rooms) {
			const members = rooms.leave(room, userId);
			broadcast(connections.getByRoom(room), {
				type: 'leave',
				room,
				userId,
				users: members,
				timestamp: Date.now()
			});
		}
	});

	ws.on('error', (err: Error) => {
		console.error(`[WS_ERROR] User ${userId}:`, err.message);
	});
});

// --- Heartbeat interval: detect dead connections ---
const HEARTBEAT_INTERVAL = 30_000;
const heartbeat = setInterval(() => {
	for (const client of connections.getAllClients()) {
		if (!client.isAlive) {
			console.log(`[TIMEOUT] Terminating dead connection: ${client.userId}`);
			client.ws.terminate();
			continue;
		}
		client.isAlive = false;
		client.ws.ping();
	}
}, HEARTBEAT_INTERVAL);

wss.on('close', () => clearInterval(heartbeat));

// --- Start server ---
server.listen(PORT, () => {
	console.log(`Chat server listening on ws://localhost:${PORT}`);
});

function shutdown(signal: string): void {
	console.log(`\n${signal} received. Shutting down...`);
	clearInterval(heartbeat);
	for (const client of connections.getAllClients()) {
		client.ws.close(1001, 'Server shutting down');
	}
	wss.close(() => {
		server.close(() => {
			console.log('Server closed.');
			process.exit(0);
		});
	});
	setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
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
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// --- Types ---
type ChatMessage struct {
	ID        string `json:"id"`
	Room      string `json:"room"`
	UserID    string `json:"userId"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
}

type ClientMessage struct {
	Type    string `json:"type"`
	Room    string `json:"room,omitempty"`
	Content string `json:"content,omitempty"`
}

type ServerMessage struct {
	Type      string        `json:"type"`
	Room      string        `json:"room,omitempty"`
	UserID    string        `json:"userId,omitempty"`
	Content   string        `json:"content,omitempty"`
	Messages  []ChatMessage `json:"messages,omitempty"`
	Users     []string      `json:"users,omitempty"`
	Timestamp int64         `json:"timestamp,omitempty"`
}

// --- Ring Buffer ---
type RingBuffer struct {
	buf   []ChatMessage
	head  int
	count int
	cap   int
}

func NewRingBuffer(capacity int) *RingBuffer {
	return &RingBuffer{buf: make([]ChatMessage, capacity), cap: capacity}
}

func (rb *RingBuffer) Push(msg ChatMessage) {
	rb.buf[rb.head] = msg
	rb.head = (rb.head + 1) % rb.cap
	if rb.count < rb.cap {
		rb.count++
	}
}

func (rb *RingBuffer) GetAll() []ChatMessage {
	if rb.count == 0 {
		return nil
	}
	result := make([]ChatMessage, 0, rb.count)
	start := 0
	if rb.count == rb.cap {
		start = rb.head
	}
	for i := 0; i < rb.count; i++ {
		idx := (start + i) % rb.cap
		result = append(result, rb.buf[idx])
	}
	return result
}

// --- Connected Client ---
type ConnectedClient struct {
	conn    *websocket.Conn
	userID  string
	rooms   map[string]bool
	mu      sync.Mutex
	isAlive bool
}

func (c *ConnectedClient) Send(msg ServerMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return c.conn.WriteJSON(msg)
}

// --- Room Manager ---
type RoomManager struct {
	mu      sync.RWMutex
	members map[string]map[string]bool    // room -> set of userIDs
	history map[string]*RingBuffer        // room -> message history
}

func NewRoomManager() *RoomManager {
	return &RoomManager{
		members: make(map[string]map[string]bool),
		history: make(map[string]*RingBuffer),
	}
}

func (rm *RoomManager) Join(room, userID string) []string {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if rm.members[room] == nil {
		rm.members[room] = make(map[string]bool)
		rm.history[room] = NewRingBuffer(100)
	}
	rm.members[room][userID] = true
	return rm.memberList(room)
}

func (rm *RoomManager) Leave(room, userID string) []string {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if rm.members[room] == nil {
		return nil
	}
	delete(rm.members[room], userID)
	if len(rm.members[room]) == 0 {
		delete(rm.members, room)
		delete(rm.history, room)
		return nil
	}
	return rm.memberList(room)
}

func (rm *RoomManager) memberList(room string) []string {
	members := rm.members[room]
	list := make([]string, 0, len(members))
	for id := range members {
		list = append(list, id)
	}
	return list
}

func (rm *RoomManager) GetMembers(room string) []string {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	return rm.memberList(room)
}

func (rm *RoomManager) AddMessage(room string, msg ChatMessage) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if buf := rm.history[room]; buf != nil {
		buf.Push(msg)
	}
}

func (rm *RoomManager) GetHistory(room string) []ChatMessage {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	if buf := rm.history[room]; buf != nil {
		return buf.GetAll()
	}
	return nil
}

// --- Connection Manager ---
type ConnectionManager struct {
	mu      sync.RWMutex
	clients map[*websocket.Conn]*ConnectedClient
}

func NewConnectionManager() *ConnectionManager {
	return &ConnectionManager{
		clients: make(map[*websocket.Conn]*ConnectedClient),
	}
}

func (cm *ConnectionManager) Add(conn *websocket.Conn, userID string) *ConnectedClient {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	client := &ConnectedClient{
		conn:    conn,
		userID:  userID,
		rooms:   make(map[string]bool),
		isAlive: true,
	}
	cm.clients[conn] = client
	return client
}

func (cm *ConnectionManager) Remove(conn *websocket.Conn) *ConnectedClient {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	client := cm.clients[conn]
	delete(cm.clients, conn)
	return client
}

func (cm *ConnectionManager) GetByRoom(room string) []*ConnectedClient {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	var result []*ConnectedClient
	for _, c := range cm.clients {
		if c.rooms[room] {
			result = append(result, c)
		}
	}
	return result
}

func (cm *ConnectionManager) GetAll() []*ConnectedClient {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	result := make([]*ConnectedClient, 0, len(cm.clients))
	for _, c := range cm.clients {
		result = append(result, c)
	}
	return result
}

// --- Broadcast ---
func broadcast(clients []*ConnectedClient, msg ServerMessage, exclude *websocket.Conn) {
	for _, c := range clients {
		if c.conn != exclude {
			c.Send(msg)
		}
	}
}

// --- Globals ---
var (
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}
	roomMgr = NewRoomManager()
	connMgr = NewConnectionManager()
)

// --- WebSocket handler ---
func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ERROR] Upgrade failed: %v", err)
		return
	}

	userID := r.URL.Query().Get("userId")
	if userID == "" {
		userID = fmt.Sprintf("anon-%s", uuid.New().String()[:8])
	}

	log.Printf("[CONNECT] User %s connected", userID)
	client := connMgr.Add(conn, userID)

	// Configure connection
	conn.SetReadLimit(4096)
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		client.isAlive = true
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	defer func() {
		log.Printf("[DISCONNECT] User %s disconnected", userID)
		connMgr.Remove(conn)
		conn.Close()

		// Leave all rooms
		for room := range client.rooms {
			members := roomMgr.Leave(room, userID)
			broadcast(connMgr.GetByRoom(room), ServerMessage{
				Type:      "leave",
				Room:      room,
				UserID:    userID,
				Users:     members,
				Timestamp: time.Now().UnixMilli(),
			}, nil)
		}
	}()

	// Read loop
	for {
		_, rawMsg, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("[WS_ERROR] User %s: %v", userID, err)
			}
			return
		}

		var msg ClientMessage
		if err := json.Unmarshal(rawMsg, &msg); err != nil {
			client.Send(ServerMessage{Type: "error", Content: "Invalid JSON"})
			continue
		}

		switch msg.Type {
		case "join":
			if msg.Room == "" {
				client.Send(ServerMessage{Type: "error", Content: "room is required"})
				continue
			}
			client.rooms[msg.Room] = true
			members := roomMgr.Join(msg.Room, userID)
			log.Printf("[JOIN] %s joined room %s (%d members)", userID, msg.Room, len(members))

			broadcast(connMgr.GetByRoom(msg.Room), ServerMessage{
				Type:      "join",
				Room:      msg.Room,
				UserID:    userID,
				Users:     members,
				Timestamp: time.Now().UnixMilli(),
			}, nil)

			if history := roomMgr.GetHistory(msg.Room); len(history) > 0 {
				client.Send(ServerMessage{Type: "history", Room: msg.Room, Messages: history})
			}

		case "leave":
			if msg.Room == "" {
				continue
			}
			delete(client.rooms, msg.Room)
			members := roomMgr.Leave(msg.Room, userID)
			log.Printf("[LEAVE] %s left room %s", userID, msg.Room)

			broadcast(connMgr.GetByRoom(msg.Room), ServerMessage{
				Type:      "leave",
				Room:      msg.Room,
				UserID:    userID,
				Users:     members,
				Timestamp: time.Now().UnixMilli(),
			}, nil)

		case "message":
			if msg.Room == "" || msg.Content == "" || !client.rooms[msg.Room] {
				client.Send(ServerMessage{Type: "error", Content: "Must join room first"})
				continue
			}
			content := msg.Content
			if len(content) > 4096 {
				content = content[:4096]
			}

			chatMsg := ChatMessage{
				ID:        uuid.New().String(),
				Room:      msg.Room,
				UserID:    userID,
				Content:   content,
				Timestamp: time.Now().UnixMilli(),
			}
			roomMgr.AddMessage(msg.Room, chatMsg)

			broadcast(connMgr.GetByRoom(msg.Room), ServerMessage{
				Type:      "message",
				Room:      msg.Room,
				UserID:    userID,
				Content:   chatMsg.Content,
				Timestamp: chatMsg.Timestamp,
			}, nil)

		case "history":
			if msg.Room == "" {
				continue
			}
			history := roomMgr.GetHistory(msg.Room)
			client.Send(ServerMessage{Type: "history", Room: msg.Room, Messages: history})

		default:
			client.Send(ServerMessage{Type: "error", Content: "Unknown message type"})
		}
	}
}

// --- Heartbeat goroutine ---
func startHeartbeat(stop chan struct{}) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			for _, client := range connMgr.GetAll() {
				if !client.isAlive {
					log.Printf("[TIMEOUT] Terminating dead connection: %s", client.userID)
					client.conn.Close()
					continue
				}
				client.isAlive = false
				client.mu.Lock()
				client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				client.conn.WriteMessage(websocket.PingMessage, nil)
				client.mu.Unlock()
			}
		case <-stop:
			return
		}
	}
}

// --- Main ---
func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", handleWebSocket)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte("WebSocket Chat Server"))
	})

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	stopHeartbeat := make(chan struct{})
	go startHeartbeat(stopHeartbeat)

	go func() {
		log.Printf("Chat server listening on ws://localhost:%s/ws", port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down...")
	close(stopHeartbeat)

	// Close all WebSocket connections
	for _, client := range connMgr.GetAll() {
		client.conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseGoingAway, "Server shutting down"))
		client.conn.Close()
	}

	srv.Close()
	log.Println("Server closed.")
}
```

</div>
</CodeTabs>

## এটাকে যা Production-Ready করে

- **Ping/pong heartbeat** -- TCP keepalive যেসব dead connection মিস করতে পারে, সেগুলো শনাক্ত করে পরিষ্কার করে
- **Ring buffer history** -- নির্দিষ্ট memory-র message storage যা কখনো অসীমভাবে বাড়ে না
- **Room-scoped broadcast** -- message শুধু target room-এর member-দের কাছে যায়, সব connection-এ নয়
- **Message size limit** -- client-দের বড় payload পাঠানো আটকায় (4KB cap)
- **Graceful shutdown** -- connection বন্ধ করার আগে WebSocket close frame পাঠায়
- **Thread safety** (Go) -- mutex shared state-কে concurrent goroutine access থেকে রক্ষা করে

<div class="takeaways">

### মূল কথা

- WebSocket full-duplex communication দেয় -- client আর server দুজনেই যেকোনো সময় message পাঠাতে পারে
- Dead connection শনাক্ত করতে সবসময় ping/pong heartbeat implement করুন (30-সেকেন্ড interval standard)
- Server process-এ memory ব্যবহার সীমিত রাখতে message history-র জন্য একটি ring buffer ব্যবহার করুন
- Room-ভিত্তিক architecture সব connection-এ broadcast করার চেয়ে ভালো স্কেল করে
- Reconnection সুন্দরভাবে সামলান -- client-দের exponential backoff সহ auto-reconnect করা উচিত
- আটকে থাকা connection থেকে resource leak আটকাতে read/write deadline সেট করুন

</div>

<div class="when-to-use">

### বাস্তব ব্যবহার

- **Slack** real-time messaging, typing indicator এবং presence-এর জন্য persistent WebSocket connection বজায় রাখে
- **Discord** একটি room (guild/channel) architecture দিয়ে কয়েক লক্ষ concurrent WebSocket connection সামলায়
- **Figma** operational transform সহ real-time collaborative editing-এর জন্য WebSocket ব্যবহার করে
- Sub-second latency দরকার হলে, WebSocket latency আর server load দুই দিকেই HTTP polling-কে 10-100x ছাড়িয়ে যায়

</div>
