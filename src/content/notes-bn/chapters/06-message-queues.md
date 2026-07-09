---
title: 'মেসেজ কিউ'
subtitle: 'acknowledgment, retry আর dead letter queue সহ RabbitMQ/NATS দিয়ে producer আর consumer বানান।'
chapter: 6
level: 'intermediate'
readingTime: '20 মিনিট'
topics: ['message queue', 'RabbitMQ', 'NATS', 'async processing', 'dead letter queue']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## মেসেজ কিউ কেন?

একজন ইউজার যখন প্রোফাইল ছবি আপলোড করে, আপনি চান না সে বসে থাকুক যখন আপনি সেটাকে 5টা সাইজে resize করছেন, CDN-এ আপলোড করছেন, ডেটাবেস আপডেট করছেন আর একটা কনফার্মেশন ইমেইল পাঠাচ্ছেন। বরং, আপনি একটা কিউতে একটা মেসেজ রাখেন — "এই ইমেজটা resize করো" — আর সাথে সাথে ফিরে আসেন। একটা worker মেসেজটা তুলে নিয়ে ব্যাকগ্রাউন্ডে সেটা প্রসেস করে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা ব্যস্ত রেস্টুরেন্টের কিচেনের মতো — অর্ডার শেফদের রান্নার গতির চেয়ে দ্রুত আসে, তাই সেগুলো একটা টিকিট রেলে রাখা হয় আর একে একে ক্রমানুসারে প্রসেস করা হয়।

</Callout>

<Mermaid
title="Message Queue Architecture"
code={`graph LR
  P["API Server<br/>Producer"] --> Q["Message Queue<br/>RabbitMQ / NATS"]
  Q --> W1["Worker 1"]
  Q --> W2["Worker 2"]
  Q -- failed messages --> DLQ["Dead Letter Queue"]`}
/>

## মূল ধারণা

- **Producer** — কিউতে মেসেজ পাঠায়
- **Consumer** — মেসেজ টেনে নিয়ে প্রসেস করে
- **Acknowledgment (ACK)** — consumer কিউকে জানায় যে সে মেসেজটা সফলভাবে প্রসেস করেছে
- **NACK** — consumer মেসেজটা reject করে (এটা retry হতে পারে বা DLQ-তে যেতে পারে)
- **Dead Letter Queue (DLQ)** — সর্বোচ্চ retry-এর পরও ফেল করা মেসেজগুলো যেখানে যায়

<CodeTabs tsFile="queue.ts" goFile="queue.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import amqp from 'amqplib';

// --- Configuration ---
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const EXCHANGE = 'app.events';
const QUEUE = 'email.notifications';
const DLQ = 'email.notifications.dlq';
const MAX_RETRIES = 3;

// --- Types ---
interface EmailMessage {
	to: string;
	subject: string;
	template: string;
	data: Record<string, unknown>;
	userId: string;
	timestamp: string;
}

// --- Producer ---
class MessageProducer {
	private connection: amqp.Connection | null = null;
	private channel: amqp.Channel | null = null;

	async connect(): Promise<void> {
		this.connection = await amqp.connect(RABBITMQ_URL);
		this.channel = await this.connection.createConfirmChannel();

		// Declare exchange (topic type for routing key matching)
		await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });

		// Declare dead letter queue
		await this.channel.assertQueue(DLQ, {
			durable: true,
			arguments: { 'x-message-ttl': 7 * 24 * 60 * 60 * 1000 } // 7 day retention
		});

		// Declare main queue with DLQ binding
		await this.channel.assertQueue(QUEUE, {
			durable: true,
			arguments: {
				'x-dead-letter-exchange': '',
				'x-dead-letter-routing-key': DLQ
			}
		});

		// Bind queue to exchange with routing key
		await this.channel.bindQueue(QUEUE, EXCHANGE, 'user.#');

		console.log('Producer connected to RabbitMQ');
	}

	async publish(routingKey: string, message: EmailMessage): Promise<boolean> {
		if (!this.channel) throw new Error('Not connected');

		const payload = Buffer.from(JSON.stringify(message));

		return new Promise((resolve, reject) => {
			this.channel!.publish(
				EXCHANGE,
				routingKey,
				payload,
				{
					persistent: true, // survive broker restart
					contentType: 'application/json',
					messageId: crypto.randomUUID(),
					timestamp: Date.now(),
					headers: { 'x-retry-count': 0 }
				},
				(err) => {
					if (err) {
						console.error('Publish failed:', err);
						reject(err);
					} else {
						resolve(true);
					}
				}
			);
		});
	}

	async close(): Promise<void> {
		await this.channel?.close();
		await this.connection?.close();
	}
}

// --- Consumer ---
class MessageConsumer {
	private connection: amqp.Connection | null = null;
	private channel: amqp.Channel | null = null;

	async connect(): Promise<void> {
		this.connection = await amqp.connect(RABBITMQ_URL);
		this.channel = await this.connection.createChannel();

		// Process 5 messages at a time (prevents one slow consumer from getting all messages)
		await this.channel.prefetch(5);

		console.log('Consumer connected to RabbitMQ');
	}

	async consume(handler: (msg: EmailMessage) => Promise<void>): Promise<void> {
		if (!this.channel) throw new Error('Not connected');

		await this.channel.consume(
			QUEUE,
			async (msg) => {
				if (!msg) return;

				const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;

				try {
					const payload: EmailMessage = JSON.parse(msg.content.toString());

					console.log(`Processing: ${payload.subject} (attempt ${retryCount + 1})`);

					// Process the message
					await handler(payload);

					// Acknowledge success
					this.channel!.ack(msg);
					console.log(`Processed: ${payload.subject}`);
				} catch (err) {
					console.error(`Failed to process message:`, err);

					if (retryCount < MAX_RETRIES) {
						// Retry: reject and requeue with incremented retry count
						this.channel!.nack(msg, false, false); // don't requeue

						// Re-publish with incremented retry count and delay
						const delay = Math.pow(2, retryCount) * 1000; // exponential backoff
						setTimeout(() => {
							this.channel!.publish('', QUEUE, msg.content, {
								...msg.properties,
								headers: {
									...msg.properties.headers,
									'x-retry-count': retryCount + 1
								}
							});
						}, delay);
					} else {
						// Max retries exceeded — send to DLQ
						console.error(
							`Message ${msg.properties.messageId} sent to DLQ after ${MAX_RETRIES} retries`
						);
						this.channel!.nack(msg, false, false); // goes to DLQ via exchange config
					}
				}
			},
			{ noAck: false }
		);
	}

	async close(): Promise<void> {
		await this.channel?.close();
		await this.connection?.close();
	}
}

// --- Email processing logic ---
async function sendEmail(msg: EmailMessage): Promise<void> {
	// Real implementation would use SendGrid, SES, etc.
	console.log(`Sending email to ${msg.to}: ${msg.subject}`);

	// Simulate occasional failures for demonstration
	if (Math.random() < 0.1) {
		throw new Error('SMTP connection failed');
	}

	// Simulate processing time
	await new Promise((resolve) => setTimeout(resolve, 100));
}

// --- Main ---
async function runProducer(): Promise<void> {
	const producer = new MessageProducer();
	await producer.connect();

	// Publish some messages
	await producer.publish('user.welcome', {
		to: 'user@example.com',
		subject: 'Welcome to the platform',
		template: 'welcome',
		data: { name: 'Ahmad' },
		userId: 'user-123',
		timestamp: new Date().toISOString()
	});

	await producer.publish('user.password-reset', {
		to: 'user@example.com',
		subject: 'Password Reset',
		template: 'password-reset',
		data: { resetLink: 'https://app.com/reset?token=abc' },
		userId: 'user-123',
		timestamp: new Date().toISOString()
	});

	console.log('Messages published');
	await producer.close();
}

async function runConsumer(): Promise<void> {
	const consumer = new MessageConsumer();
	await consumer.connect();
	await consumer.consume(sendEmail);
	console.log('Consumer waiting for messages...');

	process.on('SIGTERM', async () => {
		console.log('Shutting down consumer...');
		await consumer.close();
		process.exit(0);
	});
}

// Run based on CLI arg
const mode = process.argv[2];
if (mode === 'producer') {
	runProducer().catch(console.error);
} else {
	runConsumer().catch(console.error);
}
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"os"
	"os/signal"
	"syscall"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	rabbitURL  = "amqp://guest:guest@localhost:5672/"
	exchange   = "app.events"
	queue      = "email.notifications"
	dlq        = "email.notifications.dlq"
	maxRetries = 3
)

// --- Types ---
type EmailMessage struct {
	To        string                 `json:"to"`
	Subject   string                 `json:"subject"`
	Template  string                 `json:"template"`
	Data      map[string]interface{} `json:"data"`
	UserID    string                 `json:"userId"`
	Timestamp string                 `json:"timestamp"`
}

// --- Producer ---
type Producer struct {
	conn *amqp.Connection
	ch   *amqp.Channel
}

func NewProducer() (*Producer, error) {
	conn, err := amqp.Dial(rabbitURL)
	if err != nil {
		return nil, fmt.Errorf("dial: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		return nil, fmt.Errorf("channel: %w", err)
	}

	// Enable publisher confirms
	if err := ch.Confirm(false); err != nil {
		return nil, fmt.Errorf("confirm: %w", err)
	}

	// Declare exchange
	if err := ch.ExchangeDeclare(exchange, "topic", true, false, false, false, nil); err != nil {
		return nil, fmt.Errorf("exchange: %w", err)
	}

	// Declare DLQ
	if _, err := ch.QueueDeclare(dlq, true, false, false, false, amqp.Table{
		"x-message-ttl": int64(7 * 24 * 60 * 60 * 1000),
	}); err != nil {
		return nil, fmt.Errorf("dlq: %w", err)
	}

	// Declare main queue with DLQ
	if _, err := ch.QueueDeclare(queue, true, false, false, false, amqp.Table{
		"x-dead-letter-exchange":    "",
		"x-dead-letter-routing-key": dlq,
	}); err != nil {
		return nil, fmt.Errorf("queue: %w", err)
	}

	// Bind queue
	if err := ch.QueueBind(queue, "user.#", exchange, false, nil); err != nil {
		return nil, fmt.Errorf("bind: %w", err)
	}

	return &Producer{conn: conn, ch: ch}, nil
}

func (p *Producer) Publish(ctx context.Context, routingKey string, msg EmailMessage) error {
	body, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	confirmation, err := p.ch.PublishWithDeferredConfirmWithContext(ctx,
		exchange,
		routingKey,
		false, false,
		amqp.Publishing{
			DeliveryMode: amqp.Persistent,
			ContentType:  "application/json",
			Body:         body,
			Timestamp:    time.Now(),
			Headers:      amqp.Table{"x-retry-count": int32(0)},
		},
	)
	if err != nil {
		return fmt.Errorf("publish: %w", err)
	}

	if !confirmation.Wait() {
		return fmt.Errorf("publish not confirmed")
	}

	return nil
}

func (p *Producer) Close() {
	p.ch.Close()
	p.conn.Close()
}

// --- Consumer ---
type Consumer struct {
	conn *amqp.Connection
	ch   *amqp.Channel
}

func NewConsumer() (*Consumer, error) {
	conn, err := amqp.Dial(rabbitURL)
	if err != nil {
		return nil, fmt.Errorf("dial: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		return nil, fmt.Errorf("channel: %w", err)
	}

	// Prefetch limit
	if err := ch.Qos(5, 0, false); err != nil {
		return nil, fmt.Errorf("qos: %w", err)
	}

	return &Consumer{conn: conn, ch: ch}, nil
}

func (c *Consumer) Consume(ctx context.Context, handler func(EmailMessage) error) error {
	msgs, err := c.ch.Consume(queue, "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("consume: %w", err)
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case msg, ok := <-msgs:
			if !ok {
				return fmt.Errorf("channel closed")
			}

			retryCount := int32(0)
			if rc, ok := msg.Headers["x-retry-count"].(int32); ok {
				retryCount = rc
			}

			var email EmailMessage
			if err := json.Unmarshal(msg.Body, &email); err != nil {
				log.Printf("Invalid message body, sending to DLQ: %v", err)
				msg.Nack(false, false)
				continue
			}

			log.Printf("Processing: %s (attempt %d)", email.Subject, retryCount+1)

			if err := handler(email); err != nil {
				log.Printf("Handler error: %v", err)

				if retryCount < maxRetries {
					// Retry with exponential backoff
					delay := time.Duration(math.Pow(2, float64(retryCount))) * time.Second
					msg.Nack(false, false)

					time.AfterFunc(delay, func() {
						c.ch.Publish("", queue, false, false, amqp.Publishing{
							DeliveryMode: amqp.Persistent,
							ContentType:  "application/json",
							Body:         msg.Body,
							Headers:      amqp.Table{"x-retry-count": retryCount + 1},
						})
					})
				} else {
					log.Printf("Max retries exceeded, sending to DLQ")
					msg.Nack(false, false)
				}
			} else {
				msg.Ack(false)
				log.Printf("Processed: %s", email.Subject)
			}
		}
	}
}

func (c *Consumer) Close() {
	c.ch.Close()
	c.conn.Close()
}

// --- Email handler ---
func sendEmail(msg EmailMessage) error {
	log.Printf("Sending email to %s: %s", msg.To, msg.Subject)
	if rand.Float64() < 0.1 {
		return fmt.Errorf("SMTP connection failed")
	}
	time.Sleep(100 * time.Millisecond)
	return nil
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "producer" {
		producer, err := NewProducer()
		if err != nil {
			log.Fatal(err)
		}
		defer producer.Close()

		ctx := context.Background()
		producer.Publish(ctx, "user.welcome", EmailMessage{
			To: "user@example.com", Subject: "Welcome",
			Template: "welcome", Data: map[string]interface{}{"name": "Ahmad"},
			UserID: "user-123", Timestamp: time.Now().Format(time.RFC3339),
		})
		log.Println("Message published")
		return
	}

	consumer, err := NewConsumer()
	if err != nil {
		log.Fatal(err)
	}
	defer consumer.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit
		log.Println("Shutting down consumer...")
		cancel()
	}()

	log.Println("Consumer waiting for messages...")
	if err := consumer.Consume(ctx, sendEmail); err != nil {
		log.Fatal(err)
	}
}
```

</div>
</CodeTabs>

<div class="takeaways">

### মূল শিক্ষা

- কিউ producer আর consumer-কে আলাদা করে দেয় — তাদের একসাথে অনলাইন থাকার দরকার নেই
- সবসময় **manual acknowledgment** ব্যবহার করুন — auto-ack প্রসেসিংয়ের মাঝে consumer ক্র্যাশ করলে মেসেজ হারায়
- thundering herd এড়াতে retry-এর জন্য **exponential backoff** (1s, 2s, 4s, 8s) বসান
- **Dead letter queue** স্থায়ীভাবে ফেল করা মেসেজগুলো ডিবাগিং আর ম্যানুয়াল replay-এর জন্য ধরে রাখে
- **prefetch limit** সেট করুন যাতে একটা ধীর consumer বাকিদের অভুক্ত না রাখে

</div>

<div class="when-to-use">

### বাস্তব ব্যবহার

- **Uber** Apache Kafka-র মাধ্যমে প্রতি সেকেন্ডে লাখ লাখ ride event প্রসেস করে
- **Shopify** অর্ডার প্রসেসিং, inventory আপডেট আর webhook delivery-র জন্য মেসেজ কিউ ব্যবহার করে
- **Slack** মেসেজ delivery, push notification আর search indexing কিউতে রাখে
- কিউ ব্যবহার করুন যখন কাজটা asynchronously হতে পারে আর ইউজারের সাথে সাথে ফলাফল দরকার নেই

</div>
