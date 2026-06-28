---
title: "Case Study: Chat System at Scale"
subtitle: "Design and build a production chat system with message delivery, read receipts, typing indicators, and fan-out."
chapter: 18
level: "advanced"
readingTime: "25 min"
topics: ["chat system", "message delivery", "fan-out", "presence", "read receipts"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## What Does a Chat System at Scale Look Like?

A production chat system is far more than sending messages between two users. It involves **message ordering** across distributed servers, **fan-out** to deliver messages to all participants, **presence tracking** to know who is online, **read receipts** so senders know their message was seen, and **offline queues** to store messages for users who are not currently connected. These are the exact problems that WhatsApp, Telegram, and Slack solve at billions-of-messages-per-day scale.

Think of it like a postal service for a large office building. The mailroom (message router) receives every letter, checks the directory (presence service) to see if the recipient is at their desk, and either delivers it directly or puts it in their mailbox (offline queue). The sender gets a delivery receipt when the letter arrives, and a read receipt when the recipient opens it. Every letter has a timestamp and sequence number so they can be sorted correctly even if they arrive out of order.

<Mermaid
	title="Chat System Architecture"
	code={`
graph TD
  A["Client A<br/>WebSocket"] --> CM["Connection Manager<br/>Online Users"] --> MR["Message Router<br/>Fan-out"]
  MR --> MS["Message Store<br/>Conversations"] --> OQ["Offline Queue<br/>Pending Delivery"] --> PS["Presence Service<br/>Status Tracking"]
`}
/>

## Real-World Analogy

<Callout type="info">

**Real-World Analogy**

Like a messaging app's delivery system — single tick means sent to server, double tick means delivered to recipient, blue tick means read. Group messages fan out to all members.

</Callout>

WhatsApp handles over 100 billion messages per day. When you send a message, it goes to a message router that looks up the recipient's connection server, fans out the message, stores it, and returns a single checkmark (delivered to server). When the recipient's device receives it, you get a double checkmark. When they open the chat, you get blue checkmarks (read receipt). If the recipient is offline, the message sits in an offline queue and gets delivered the moment their phone reconnects. Telegram uses Lamport timestamps to ensure messages appear in the correct order even when sent from multiple devices simultaneously.

## Building a Chat System

Here's a complete chat system with message storage, fan-out on write, read receipts, typing indicators, Lamport timestamps for ordering, and offline message queues. This implements the core architecture used by production chat systems.

<CodeTabs tsFile="chat-system.ts" goFile="chat-system.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import crypto from "node:crypto";

// --- Lamport Clock for message ordering ---
class LamportClock {
  private counter: number = 0;

  tick(): number {
    return ++this.counter;
  }

  update(received: number): number {
    this.counter = Math.max(this.counter, received) + 1;
    return this.counter;
  }

  current(): number {
    return this.counter;
  }
}

// --- Types ---
interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: number;
  lamportTs: number;
  status: "sent" | "delivered" | "read";
}

interface Conversation {
  id: string;
  participants: string[];
  lastMessageAt: number;
  createdAt: number;
}

interface ReadReceipt {
  userId: string;
  conversationId: string;
  lastReadMessageId: string;
  lastReadTimestamp: number;
}

interface TypingEvent {
  userId: string;
  conversationId: string;
  isTyping: boolean;
  timestamp: number;
}

interface UserConnection {
  userId: string;
  online: boolean;
  lastSeen: number;
  send: (event: ChatEvent) => void;
}

type ChatEvent =
  | { type: "message"; data: Message }
  | { type: "delivered"; data: { messageId: string; conversationId: string } }
  | { type: "read_receipt"; data: ReadReceipt }
  | { type: "typing"; data: TypingEvent }
  | { type: "presence"; data: { userId: string; online: boolean } }
  | { type: "offline_messages"; data: Message[] };

// --- Message Store ---
class MessageStore {
  private messages = new Map<string, Message[]>(); // conversationId -> messages
  private conversations = new Map<string, Conversation>();
  private readReceipts = new Map<string, ReadReceipt>(); // `userId:convId` -> receipt

  createConversation(participants: string[]): Conversation {
    const id = `conv-${crypto.randomUUID().slice(0, 8)}`;
    const conv: Conversation = {
      id,
      participants: [...participants],
      lastMessageAt: 0,
      createdAt: Date.now(),
    };
    this.conversations.set(id, conv);
    this.messages.set(id, []);
    console.log(`[STORE] Created conversation ${id} with participants: ${participants.join(", ")}`);
    return conv;
  }

  storeMessage(msg: Message): void {
    const msgs = this.messages.get(msg.conversationId);
    if (!msgs) throw new Error(`Conversation ${msg.conversationId} not found`);

    msgs.push(msg);
    const conv = this.conversations.get(msg.conversationId);
    if (conv) conv.lastMessageAt = msg.timestamp;

    console.log(`[STORE] Stored message ${msg.id} in ${msg.conversationId} (lamport: ${msg.lamportTs})`);
  }

  getMessages(conversationId: string, limit: number = 50): Message[] {
    const msgs = this.messages.get(conversationId) || [];
    return msgs.slice(-limit).sort((a, b) => a.lamportTs - b.lamportTs);
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  getConversationsForUser(userId: string): Conversation[] {
    const result: Conversation[] = [];
    for (const conv of this.conversations.values()) {
      if (conv.participants.includes(userId)) {
        result.push(conv);
      }
    }
    return result.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }

  setReadReceipt(userId: string, conversationId: string, messageId: string): ReadReceipt {
    const key = `${userId}:${conversationId}`;
    const receipt: ReadReceipt = {
      userId,
      conversationId,
      lastReadMessageId: messageId,
      lastReadTimestamp: Date.now(),
    };
    this.readReceipts.set(key, receipt);

    // Mark messages as read
    const msgs = this.messages.get(conversationId) || [];
    let found = false;
    for (const msg of msgs) {
      if (msg.id === messageId) found = true;
      if (!found && msg.senderId !== userId && msg.status !== "read") {
        msg.status = "read";
      }
      if (msg.id === messageId) {
        msg.status = "read";
        break;
      }
    }

    return receipt;
  }

  getReadReceipt(userId: string, conversationId: string): ReadReceipt | undefined {
    return this.readReceipts.get(`${userId}:${conversationId}`);
  }

  markDelivered(conversationId: string, messageId: string): void {
    const msgs = this.messages.get(conversationId) || [];
    const msg = msgs.find((m) => m.id === messageId);
    if (msg && msg.status === "sent") {
      msg.status = "delivered";
    }
  }
}

// --- Offline Queue ---
class OfflineQueue {
  private queues = new Map<string, Message[]>(); // userId -> pending messages

  enqueue(userId: string, message: Message): void {
    if (!this.queues.has(userId)) {
      this.queues.set(userId, []);
    }
    this.queues.get(userId)!.push(message);
    console.log(`[OFFLINE] Queued message ${message.id} for offline user ${userId}`);
  }

  drain(userId: string): Message[] {
    const messages = this.queues.get(userId) || [];
    this.queues.delete(userId);
    if (messages.length > 0) {
      console.log(`[OFFLINE] Draining ${messages.length} messages for user ${userId}`);
    }
    return messages;
  }

  getQueueSize(userId: string): number {
    return (this.queues.get(userId) || []).length;
  }
}

// --- Connection Manager (Presence) ---
class ConnectionManager {
  private connections = new Map<string, UserConnection>();

  connect(userId: string, sendFn: (event: ChatEvent) => void): UserConnection {
    const conn: UserConnection = {
      userId,
      online: true,
      lastSeen: Date.now(),
      send: sendFn,
    };
    this.connections.set(userId, conn);
    console.log(`[PRESENCE] User ${userId} is now ONLINE`);
    return conn;
  }

  disconnect(userId: string): void {
    const conn = this.connections.get(userId);
    if (conn) {
      conn.online = false;
      conn.lastSeen = Date.now();
      console.log(`[PRESENCE] User ${userId} is now OFFLINE (last seen: ${new Date(conn.lastSeen).toISOString()})`);
    }
  }

  isOnline(userId: string): boolean {
    const conn = this.connections.get(userId);
    return conn?.online ?? false;
  }

  getConnection(userId: string): UserConnection | undefined {
    const conn = this.connections.get(userId);
    return conn?.online ? conn : undefined;
  }

  getOnlineUsers(): string[] {
    const online: string[] = [];
    for (const [userId, conn] of this.connections) {
      if (conn.online) online.push(userId);
    }
    return online;
  }

  getLastSeen(userId: string): number | undefined {
    return this.connections.get(userId)?.lastSeen;
  }
}

// --- Fan-out Service (Message Router) ---
class FanOutService {
  constructor(
    private store: MessageStore,
    private connections: ConnectionManager,
    private offlineQueue: OfflineQueue,
    private clock: LamportClock
  ) {}

  sendMessage(senderId: string, conversationId: string, content: string): Message {
    const conv = this.store.getConversation(conversationId);
    if (!conv) throw new Error(`Conversation ${conversationId} not found`);
    if (!conv.participants.includes(senderId)) {
      throw new Error(`User ${senderId} is not in conversation ${conversationId}`);
    }

    const message: Message = {
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      conversationId,
      senderId,
      content: content.slice(0, 4096),
      timestamp: Date.now(),
      lamportTs: this.clock.tick(),
      status: "sent",
    };

    // Store the message
    this.store.storeMessage(message);

    // Fan-out to all participants
    console.log(`[FANOUT] Distributing message ${message.id} to ${conv.participants.length} participants`);

    for (const participantId of conv.participants) {
      if (participantId === senderId) continue; // Don't send to self

      const conn = this.connections.getConnection(participantId);
      if (conn) {
        // User is online -- deliver immediately
        conn.send({ type: "message", data: message });
        this.store.markDelivered(conversationId, message.id);
        console.log(`[FANOUT] Delivered ${message.id} to ${participantId} (online)`);

        // Send delivery receipt to sender
        const senderConn = this.connections.getConnection(senderId);
        if (senderConn) {
          senderConn.send({
            type: "delivered",
            data: { messageId: message.id, conversationId },
          });
        }
      } else {
        // User is offline -- queue for later delivery
        this.offlineQueue.enqueue(participantId, message);
      }
    }

    return message;
  }

  sendReadReceipt(userId: string, conversationId: string, messageId: string): void {
    const receipt = this.store.setReadReceipt(userId, conversationId, messageId);
    const conv = this.store.getConversation(conversationId);
    if (!conv) return;

    // Notify other participants about the read receipt
    for (const participantId of conv.participants) {
      if (participantId === userId) continue;
      const conn = this.connections.getConnection(participantId);
      if (conn) {
        conn.send({ type: "read_receipt", data: receipt });
        console.log(`[RECEIPT] Sent read receipt to ${participantId} (read by ${userId})`);
      }
    }
  }

  sendTypingIndicator(userId: string, conversationId: string, isTyping: boolean): void {
    const conv = this.store.getConversation(conversationId);
    if (!conv) return;

    const event: TypingEvent = {
      userId,
      conversationId,
      isTyping,
      timestamp: Date.now(),
    };

    for (const participantId of conv.participants) {
      if (participantId === userId) continue;
      const conn = this.connections.getConnection(participantId);
      if (conn) {
        conn.send({ type: "typing", data: event });
      }
    }
  }

  handleUserReconnect(userId: string): void {
    const pending = this.offlineQueue.drain(userId);
    if (pending.length === 0) return;

    const conn = this.connections.getConnection(userId);
    if (!conn) return;

    // Deliver all pending messages
    conn.send({ type: "offline_messages", data: pending });

    // Send delivery receipts to senders
    for (const msg of pending) {
      this.store.markDelivered(msg.conversationId, msg.id);
      const senderConn = this.connections.getConnection(msg.senderId);
      if (senderConn) {
        senderConn.send({
          type: "delivered",
          data: { messageId: msg.id, conversationId: msg.conversationId },
        });
      }
    }

    console.log(`[RECONNECT] Delivered ${pending.length} offline messages to ${userId}`);
  }

  broadcastPresence(userId: string, online: boolean): void {
    // Notify users in shared conversations
    const conversations = this.store.getConversationsForUser(userId);
    const notified = new Set<string>();

    for (const conv of conversations) {
      for (const participantId of conv.participants) {
        if (participantId === userId || notified.has(participantId)) continue;
        notified.add(participantId);

        const conn = this.connections.getConnection(participantId);
        if (conn) {
          conn.send({ type: "presence", data: { userId, online } });
        }
      }
    }
  }
}

// --- Demo simulation ---
function main(): void {
  const store = new MessageStore();
  const connMgr = new ConnectionManager();
  const offlineQueue = new OfflineQueue();
  const clock = new LamportClock();
  const fanout = new FanOutService(store, connMgr, offlineQueue, clock);

  // Simulate event handlers for users
  const eventLog: { user: string; event: ChatEvent }[] = [];
  function createSendFn(userId: string) {
    return (event: ChatEvent) => {
      eventLog.push({ user: userId, event });
      console.log(`  >> [${userId}] received ${event.type}`);
    };
  }

  // Create users
  console.log("=== Setup ===");
  connMgr.connect("fatima", createSendFn("fatima"));
  connMgr.connect("omar", createSendFn("omar"));
  // yusuf is offline

  // Create conversations
  const conv1 = store.createConversation(["fatima", "omar", "yusuf"]);

  // Fatima sends a message
  console.log("\n=== Fatima sends a message ===");
  const msg1 = fanout.sendMessage("fatima", conv1.id, "Hey team, how is everyone?");

  // Omar reads the message
  console.log("\n=== Omar reads the message ===");
  fanout.sendReadReceipt("omar", conv1.id, msg1.id);

  // Omar starts typing
  console.log("\n=== Omar types a reply ===");
  fanout.sendTypingIndicator("omar", conv1.id, true);

  // Omar sends a reply
  const msg2 = fanout.sendMessage("omar", conv1.id, "Doing great! Working on the new feature.");
  fanout.sendTypingIndicator("omar", conv1.id, false);

  // Yusuf comes online and gets pending messages
  console.log("\n=== Yusuf comes online ===");
  connMgr.connect("yusuf", createSendFn("yusuf"));
  fanout.handleUserReconnect("yusuf");
  fanout.broadcastPresence("yusuf", true);

  // Yusuf reads all messages
  console.log("\n=== Yusuf reads messages ===");
  fanout.sendReadReceipt("yusuf", conv1.id, msg2.id);

  // Print final state
  console.log("\n=== Final message history ===");
  const messages = store.getMessages(conv1.id);
  for (const msg of messages) {
    console.log(`  [${msg.lamportTs}] ${msg.senderId}: ${msg.content} (${msg.status})`);
  }

  console.log("\n=== Online users ===");
  console.log(`  ${connMgr.getOnlineUsers().join(", ")}`);

  console.log(`\n=== Event log (${eventLog.length} events) ===`);
  for (const entry of eventLog) {
    console.log(`  ${entry.user}: ${entry.event.type}`);
  }
}

main();
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"fmt"
	"math"
	"strings"
	"sync"
	"time"
)

// --- Lamport Clock ---
type LamportClock struct {
	mu      sync.Mutex
	counter int64
}

func (lc *LamportClock) Tick() int64 {
	lc.mu.Lock()
	defer lc.mu.Unlock()
	lc.counter++
	return lc.counter
}

func (lc *LamportClock) Update(received int64) int64 {
	lc.mu.Lock()
	defer lc.mu.Unlock()
	if received > lc.counter {
		lc.counter = received
	}
	lc.counter++
	return lc.counter
}

// --- Types ---
type MessageStatus string

const (
	StatusSent      MessageStatus = "sent"
	StatusDelivered MessageStatus = "delivered"
	StatusRead      MessageStatus = "read"
)

type Message struct {
	ID             string        `json:"id"`
	ConversationID string        `json:"conversationId"`
	SenderID       string        `json:"senderId"`
	Content        string        `json:"content"`
	Timestamp      int64         `json:"timestamp"`
	LamportTs      int64         `json:"lamportTs"`
	Status         MessageStatus `json:"status"`
}

type Conversation struct {
	ID            string   `json:"id"`
	Participants  []string `json:"participants"`
	LastMessageAt int64    `json:"lastMessageAt"`
	CreatedAt     int64    `json:"createdAt"`
}

type ReadReceipt struct {
	UserID            string `json:"userId"`
	ConversationID    string `json:"conversationId"`
	LastReadMessageID string `json:"lastReadMessageId"`
	LastReadTimestamp  int64  `json:"lastReadTimestamp"`
}

type TypingEvent struct {
	UserID         string `json:"userId"`
	ConversationID string `json:"conversationId"`
	IsTyping       bool   `json:"isTyping"`
	Timestamp      int64  `json:"timestamp"`
}

type ChatEvent struct {
	Type string
	Data interface{}
}

// --- User Connection ---
type UserConnection struct {
	UserID   string
	Online   bool
	LastSeen int64
	SendFn   func(ChatEvent)
}

// --- Message Store ---
type MessageStore struct {
	mu            sync.RWMutex
	messages      map[string][]Message      // conversationId -> messages
	conversations map[string]*Conversation
	readReceipts  map[string]*ReadReceipt   // "userId:convId" -> receipt
	nextConvID    int
}

func NewMessageStore() *MessageStore {
	return &MessageStore{
		messages:      make(map[string][]Message),
		conversations: make(map[string]*Conversation),
		readReceipts:  make(map[string]*ReadReceipt),
	}
}

func (ms *MessageStore) CreateConversation(participants []string) *Conversation {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	ms.nextConvID++
	id := fmt.Sprintf("conv-%d", ms.nextConvID)
	conv := &Conversation{
		ID:            id,
		Participants:  append([]string{}, participants...),
		LastMessageAt: 0,
		CreatedAt:     time.Now().UnixMilli(),
	}
	ms.conversations[id] = conv
	ms.messages[id] = []Message{}
	fmt.Printf("[STORE] Created conversation %s with participants: %s\n", id, strings.Join(participants, ", "))
	return conv
}

func (ms *MessageStore) StoreMessage(msg Message) {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	ms.messages[msg.ConversationID] = append(ms.messages[msg.ConversationID], msg)
	if conv, ok := ms.conversations[msg.ConversationID]; ok {
		conv.LastMessageAt = msg.Timestamp
	}
	fmt.Printf("[STORE] Stored message %s in %s (lamport: %d)\n", msg.ID, msg.ConversationID, msg.LamportTs)
}

func (ms *MessageStore) GetMessages(conversationID string, limit int) []Message {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	msgs := ms.messages[conversationID]
	if len(msgs) == 0 {
		return nil
	}

	start := 0
	if len(msgs) > limit {
		start = len(msgs) - limit
	}

	result := make([]Message, len(msgs[start:]))
	copy(result, msgs[start:])

	// Sort by Lamport timestamp
	for i := 0; i < len(result)-1; i++ {
		for j := i + 1; j < len(result); j++ {
			if result[i].LamportTs > result[j].LamportTs {
				result[i], result[j] = result[j], result[i]
			}
		}
	}
	return result
}

func (ms *MessageStore) GetConversation(id string) *Conversation {
	ms.mu.RLock()
	defer ms.mu.RUnlock()
	return ms.conversations[id]
}

func (ms *MessageStore) GetConversationsForUser(userID string) []*Conversation {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	var result []*Conversation
	for _, conv := range ms.conversations {
		for _, p := range conv.Participants {
			if p == userID {
				result = append(result, conv)
				break
			}
		}
	}
	return result
}

func (ms *MessageStore) SetReadReceipt(userID, conversationID, messageID string) *ReadReceipt {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	key := fmt.Sprintf("%s:%s", userID, conversationID)
	receipt := &ReadReceipt{
		UserID:            userID,
		ConversationID:    conversationID,
		LastReadMessageID: messageID,
		LastReadTimestamp:  time.Now().UnixMilli(),
	}
	ms.readReceipts[key] = receipt

	// Mark messages as read
	msgs := ms.messages[conversationID]
	for i := range msgs {
		if msgs[i].SenderID != userID && msgs[i].Status != StatusRead {
			msgs[i].Status = StatusRead
		}
		if msgs[i].ID == messageID {
			msgs[i].Status = StatusRead
			break
		}
	}
	return receipt
}

func (ms *MessageStore) MarkDelivered(conversationID, messageID string) {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	msgs := ms.messages[conversationID]
	for i := range msgs {
		if msgs[i].ID == messageID && msgs[i].Status == StatusSent {
			msgs[i].Status = StatusDelivered
			return
		}
	}
}

// --- Offline Queue ---
type OfflineQueue struct {
	mu     sync.Mutex
	queues map[string][]Message // userId -> pending messages
}

func NewOfflineQueue() *OfflineQueue {
	return &OfflineQueue{queues: make(map[string][]Message)}
}

func (oq *OfflineQueue) Enqueue(userID string, msg Message) {
	oq.mu.Lock()
	defer oq.mu.Unlock()
	oq.queues[userID] = append(oq.queues[userID], msg)
	fmt.Printf("[OFFLINE] Queued message %s for offline user %s\n", msg.ID, userID)
}

func (oq *OfflineQueue) Drain(userID string) []Message {
	oq.mu.Lock()
	defer oq.mu.Unlock()
	msgs := oq.queues[userID]
	delete(oq.queues, userID)
	if len(msgs) > 0 {
		fmt.Printf("[OFFLINE] Draining %d messages for user %s\n", len(msgs), userID)
	}
	return msgs
}

// --- Connection Manager ---
type ConnectionMgr struct {
	mu    sync.RWMutex
	conns map[string]*UserConnection
}

func NewConnectionMgr() *ConnectionMgr {
	return &ConnectionMgr{conns: make(map[string]*UserConnection)}
}

func (cm *ConnectionMgr) Connect(userID string, sendFn func(ChatEvent)) *UserConnection {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	conn := &UserConnection{
		UserID:   userID,
		Online:   true,
		LastSeen: time.Now().UnixMilli(),
		SendFn:   sendFn,
	}
	cm.conns[userID] = conn
	fmt.Printf("[PRESENCE] User %s is now ONLINE\n", userID)
	return conn
}

func (cm *ConnectionMgr) Disconnect(userID string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	if conn, ok := cm.conns[userID]; ok {
		conn.Online = false
		conn.LastSeen = time.Now().UnixMilli()
		fmt.Printf("[PRESENCE] User %s is now OFFLINE\n", userID)
	}
}

func (cm *ConnectionMgr) GetConnection(userID string) *UserConnection {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	conn := cm.conns[userID]
	if conn != nil && conn.Online {
		return conn
	}
	return nil
}

func (cm *ConnectionMgr) IsOnline(userID string) bool {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	conn := cm.conns[userID]
	return conn != nil && conn.Online
}

func (cm *ConnectionMgr) GetOnlineUsers() []string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	var online []string
	for uid, conn := range cm.conns {
		if conn.Online {
			online = append(online, uid)
		}
	}
	return online
}

// --- Fan-out Service ---
type FanOutService struct {
	store        *MessageStore
	connMgr      *ConnectionMgr
	offlineQueue *OfflineQueue
	clock        *LamportClock
	nextMsgID    int
	mu           sync.Mutex
}

func NewFanOutService(store *MessageStore, connMgr *ConnectionMgr, oq *OfflineQueue, clock *LamportClock) *FanOutService {
	return &FanOutService{
		store:        store,
		connMgr:      connMgr,
		offlineQueue: oq,
		clock:        clock,
	}
}

func (fs *FanOutService) genMsgID() string {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	fs.nextMsgID++
	return fmt.Sprintf("msg-%d", fs.nextMsgID)
}

func (fs *FanOutService) SendMessage(senderID, conversationID, content string) *Message {
	conv := fs.store.GetConversation(conversationID)
	if conv == nil {
		fmt.Printf("[ERROR] Conversation %s not found\n", conversationID)
		return nil
	}

	// Truncate content
	if len(content) > 4096 {
		content = content[:4096]
	}

	msg := Message{
		ID:             fs.genMsgID(),
		ConversationID: conversationID,
		SenderID:       senderID,
		Content:        content,
		Timestamp:      time.Now().UnixMilli(),
		LamportTs:      fs.clock.Tick(),
		Status:         StatusSent,
	}

	fs.store.StoreMessage(msg)

	fmt.Printf("[FANOUT] Distributing message %s to %d participants\n", msg.ID, len(conv.Participants))

	for _, participantID := range conv.Participants {
		if participantID == senderID {
			continue
		}

		conn := fs.connMgr.GetConnection(participantID)
		if conn != nil {
			conn.SendFn(ChatEvent{Type: "message", Data: msg})
			fs.store.MarkDelivered(conversationID, msg.ID)
			fmt.Printf("[FANOUT] Delivered %s to %s (online)\n", msg.ID, participantID)

			if senderConn := fs.connMgr.GetConnection(senderID); senderConn != nil {
				senderConn.SendFn(ChatEvent{
					Type: "delivered",
					Data: map[string]string{"messageId": msg.ID, "conversationId": conversationID},
				})
			}
		} else {
			fs.offlineQueue.Enqueue(participantID, msg)
		}
	}

	return &msg
}

func (fs *FanOutService) SendReadReceipt(userID, conversationID, messageID string) {
	receipt := fs.store.SetReadReceipt(userID, conversationID, messageID)
	conv := fs.store.GetConversation(conversationID)
	if conv == nil {
		return
	}

	for _, participantID := range conv.Participants {
		if participantID == userID {
			continue
		}
		if conn := fs.connMgr.GetConnection(participantID); conn != nil {
			conn.SendFn(ChatEvent{Type: "read_receipt", Data: receipt})
			fmt.Printf("[RECEIPT] Sent read receipt to %s (read by %s)\n", participantID, userID)
		}
	}
}

func (fs *FanOutService) SendTypingIndicator(userID, conversationID string, isTyping bool) {
	conv := fs.store.GetConversation(conversationID)
	if conv == nil {
		return
	}

	event := TypingEvent{
		UserID:         userID,
		ConversationID: conversationID,
		IsTyping:       isTyping,
		Timestamp:      time.Now().UnixMilli(),
	}

	for _, participantID := range conv.Participants {
		if participantID == userID {
			continue
		}
		if conn := fs.connMgr.GetConnection(participantID); conn != nil {
			conn.SendFn(ChatEvent{Type: "typing", Data: event})
		}
	}
}

func (fs *FanOutService) HandleReconnect(userID string) {
	pending := fs.offlineQueue.Drain(userID)
	if len(pending) == 0 {
		return
	}

	conn := fs.connMgr.GetConnection(userID)
	if conn == nil {
		return
	}

	conn.SendFn(ChatEvent{Type: "offline_messages", Data: pending})

	for _, msg := range pending {
		fs.store.MarkDelivered(msg.ConversationID, msg.ID)
		if senderConn := fs.connMgr.GetConnection(msg.SenderID); senderConn != nil {
			senderConn.SendFn(ChatEvent{
				Type: "delivered",
				Data: map[string]string{"messageId": msg.ID, "conversationId": msg.ConversationID},
			})
		}
	}
	fmt.Printf("[RECONNECT] Delivered %d offline messages to %s\n", len(pending), userID)
}

func (fs *FanOutService) BroadcastPresence(userID string, online bool) {
	conversations := fs.store.GetConversationsForUser(userID)
	notified := make(map[string]bool)

	for _, conv := range conversations {
		for _, participantID := range conv.Participants {
			if participantID == userID || notified[participantID] {
				continue
			}
			notified[participantID] = true

			if conn := fs.connMgr.GetConnection(participantID); conn != nil {
				conn.SendFn(ChatEvent{
					Type: "presence",
					Data: map[string]interface{}{"userId": userID, "online": online},
				})
			}
		}
	}
}

// Suppress unused import warning
var _ = math.MaxFloat64

// --- Main ---
func main() {
	store := NewMessageStore()
	connMgr := NewConnectionMgr()
	offlineQueue := NewOfflineQueue()
	clock := &LamportClock{}
	fanout := NewFanOutService(store, connMgr, offlineQueue, clock)

	type eventEntry struct {
		User  string
		Event ChatEvent
	}
	var eventLog []eventEntry
	var logMu sync.Mutex

	makeSendFn := func(userID string) func(ChatEvent) {
		return func(e ChatEvent) {
			logMu.Lock()
			eventLog = append(eventLog, eventEntry{User: userID, Event: e})
			logMu.Unlock()
			fmt.Printf("  >> [%s] received %s\n", userID, e.Type)
		}
	}

	fmt.Println("=== Setup ===")
	connMgr.Connect("fatima", makeSendFn("fatima"))
	connMgr.Connect("omar", makeSendFn("omar"))
	// yusuf starts offline

	conv1 := store.CreateConversation([]string{"fatima", "omar", "yusuf"})

	fmt.Println("\n=== Fatima sends a message ===")
	msg1 := fanout.SendMessage("fatima", conv1.ID, "Hey team, how is everyone?")

	fmt.Println("\n=== Omar reads the message ===")
	fanout.SendReadReceipt("omar", conv1.ID, msg1.ID)

	fmt.Println("\n=== Omar types a reply ===")
	fanout.SendTypingIndicator("omar", conv1.ID, true)
	msg2 := fanout.SendMessage("omar", conv1.ID, "Doing great! Working on the new feature.")
	fanout.SendTypingIndicator("omar", conv1.ID, false)

	fmt.Println("\n=== Yusuf comes online ===")
	connMgr.Connect("yusuf", makeSendFn("yusuf"))
	fanout.HandleReconnect("yusuf")
	fanout.BroadcastPresence("yusuf", true)

	fmt.Println("\n=== Yusuf reads messages ===")
	fanout.SendReadReceipt("yusuf", conv1.ID, msg2.ID)

	fmt.Println("\n=== Final message history ===")
	messages := store.GetMessages(conv1.ID, 50)
	for _, msg := range messages {
		fmt.Printf("  [%d] %s: %s (%s)\n", msg.LamportTs, msg.SenderID, msg.Content, msg.Status)
	}

	fmt.Println("\n=== Online users ===")
	fmt.Printf("  %s\n", strings.Join(connMgr.GetOnlineUsers(), ", "))

	fmt.Printf("\n=== Event log (%d events) ===\n", len(eventLog))
	for _, entry := range eventLog {
		fmt.Printf("  %s: %s\n", entry.User, entry.Event.Type)
	}
}
```

</div>
</CodeTabs>

## What Makes This Production-Ready

- **Lamport timestamps** -- provides causal ordering of messages across distributed servers
- **Fan-out on write** -- pushes messages to recipients immediately rather than requiring them to poll
- **Offline message queue** -- stores messages for disconnected users with guaranteed delivery on reconnect
- **Read receipts** -- tracks per-user read state with receipts propagated to message senders
- **Typing indicators** -- ephemeral events broadcast to conversation participants without persistence
- **Connection manager** -- tracks online/offline status with last-seen timestamps for presence

<div class="takeaways">

### Key Takeaways

- Fan-out on write (push model) delivers messages instantly but requires tracking all recipient connections
- Lamport timestamps provide causal ordering without requiring synchronized clocks across servers
- Offline queues are essential -- mobile users frequently disconnect and reconnect throughout the day
- Read receipts require a separate tracking layer from message delivery status
- Typing indicators are fire-and-forget events that should never be persisted or queued
- Connection-level presence is different from application-level presence -- a user can have multiple devices

</div>

<div class="when-to-use">

### Real-World Usage

- **WhatsApp** processes 100+ billion messages per day using fan-out on write with offline queuing for mobile users
- **Telegram** uses a custom protocol (MTProto) with Lamport-style ordering for multi-device message sync
- **Discord** separates ephemeral events (typing, presence) from persistent data (messages) for different scaling strategies
- **Slack** uses a combination of WebSockets for real-time delivery and REST API for message history retrieval

</div>

