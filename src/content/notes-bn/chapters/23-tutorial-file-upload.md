---
title: 'Tutorial: একটি File Upload Service বানানো'
subtitle: 'chunked upload, resumable transfer, virus scanning এবং CDN integration সহ একটি প্রোডাকশন file upload service বানানোর ধাপে ধাপে গাইড।'
chapter: 23
level: 'intermediate'
readingTime: '26 মিনিট'
topics: ['tutorial', 'file upload', 'chunked upload', 'resumable transfer', 'content delivery']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

রহিমের একটা কুরিয়ার কাউন্টার, যেখানে পার্সেল জমা নেওয়া হয়। একদিন এক দোকানদার বিশাল একটা চালান পাঠাতে এলো — এত বড় যে একটা আস্ত ক্রেটে করে আনলে দরজা দিয়েই ঢোকে না, মাঝপথে ট্রাক থেকে পড়ে গেলে পুরোটাই নষ্ট। তাই রহিম বুদ্ধি করে চালানটাকে ছোট ছোট নম্বর দেওয়া বাক্সে ভাগ করে নিল — ১ থেকে ২০ — আর একটা একটা করে ভেতরে আনতে বলল। প্রতিটা বাক্স আসার সময় সে গায়ে লেখা নম্বর আর ওজন মিলিয়ে টুকে রাখে, যাতে কোনটা এসেছে আর কোনটা বাকি সেটা সবসময় জানা থাকে।

মাঝপথে দেখা গেল ৩ নম্বর বাক্সটা রাস্তায় হারিয়ে গেছে। রহিম পুরো চালান আবার আনতে বলল না — শুধু ৩ নম্বর বাক্সটাই আবার পাঠাতে বলল, বাকি ১৯টা তো কাউন্টারেই সাজানো আছে। সব বাক্স এসে গেলে সে নম্বর অনুযায়ী ক্রমে সাজিয়ে চালানটা আবার জোড়া লাগায়, গুদামের একটা নম্বর দেওয়া তাকে তুলে রাখে, আর দোকানদারের হাতে একটা ছোট রসিদ ধরিয়ে দেয় — যাতে শুধু তাকের নম্বরটা লেখা, পুরো মালটা নয়। আর গেটেই একটা নিয়ম — ওজনের সীমা পেরোনো বা নিষিদ্ধ কিছু হলে ভেতরেই ঢুকতে দেওয়া হয় না, গেট থেকেই ফেরত।

এই গল্পটাই আসলে একটা **file upload service**। নম্বর দেওয়া বাক্সে চালান ভাগ করাটাই বড় ফাইলকে **chunk**-এ ভাগ করে **multipart upload** করা, হারানো ৩ নম্বর বাক্সটা শুধু আবার পাঠানোটাই **resumable** upload-এ শুধু ফেল করা chunk-টা retry করা, আর বাক্সগুলো ক্রমে জোড়া লাগানোটাই chunk-গুলো assemble করা। গুদামের নম্বর দেওয়া তাক হলো **object storage** (S3, MinIO), রসিদটা হলো ফাইলের reference URL, আর গেটের নিয়মটাই size ও type-এর **validation** — বাস্তবে বড় ভিডিও বা ব্যাকআপ আপলোডে ঠিক এভাবেই কাজ হয়।

## আমরা কী বানাচ্ছি

এই টিউটোরিয়ালে আমরা একটা প্রোডাকশন file upload service বানাবো যেটা বড় ফাইল (5GB পর্যন্ত) হ্যান্ডল করবে, chunked ও resumable upload সাপোর্ট করবে, content type ভ্যালিডেট করবে, নিরাপদ download-এর জন্য signed URL জেনারেট করবে, এবং ফাইলগুলো asynchronously প্রসেস করবে (virus scanning, thumbnail generation)। এটাকে AWS S3, Google Drive বা Dropbox যা internally ব্যবহার করে তার একটা সরলীকৃত সংস্করণ হিসেবে ভাবতে পারেন।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

সরকারি অফিসে ডকুমেন্ট জমা দেওয়ার মতো — আপনি একটা ফর্ম পূরণ করেন, ফাইল সংযুক্ত করেন, কেরানি সব ঠিক আছে কিনা যাচাই করে, স্ট্যাম্প মারে, এবং ফাইল করে রাখে। বড় ডকুমেন্টগুলোকে সেকশনে ভাগ করা হয়।

</Callout>

মূল কথাটা হলো: আপনি একটা 5GB ফাইল এক রিকোয়েস্টেই POST করতে পারবেন না। নেটওয়ার্ক ফেল করে, timeout শেষ হয়ে যায়, আর সার্ভারের মেমরি ফুরিয়ে যায়। বদলে আমরা ফাইলগুলোকে chunk-এ ভাগ করি, প্রতিটা chunk আলাদাভাবে upload করি, এবং সার্ভার-সাইডে সেগুলো জোড়া দিই। নেটওয়ার্ক ড্রপ করলে শুধু বর্তমান chunk-টা হারায় — যেখানে থেমেছিলেন সেখান থেকেই resume করুন।

<Mermaid
title="File Upload Service Architecture"
code={`graph TD
  C["Client<br/>Chunked Upload"] --> U["Upload API<br/>Validate & Route"] --> A["Chunk Assembler<br/>Merge & Verify"]
  A --> O["Object Store<br/>File Storage"] --> Q["Processing Queue<br/>Scan & Transform"] --> CDN["CDN<br/>Edge Delivery"]`}
/>

## ধাপ 1: Upload Protocol

আমাদের upload একটা তিন-ধাপের approach মেনে চলে, S3-এর multipart upload-এর মতো:

1. **Initiate** — Client সার্ভারকে বলে: "আমি video.mp4 নামের একটা 2GB ফাইল 20টা chunk-এ upload করতে চাই।" সার্ভার একটা upload session তৈরি করে এবং একটা upload ID ফেরত দেয়।
2. **Upload chunks** — Client প্রতিটা chunk আলাদাভাবে upload করে (parallel-এ হতে পারে)। প্রতিটা chunk-এ থাকে তার নম্বর এবং integrity যাচাইয়ের জন্য একটা checksum।
3. **Complete** — Client বলে "সব chunk upload হয়ে গেছে।" সার্ভার সেগুলো জোড়া দেয়, মোট checksum যাচাই করে, এবং ফাইলটাকে ready হিসেবে মার্ক করে।

এই protocol upload-কে **resumable** করে (শুধু ফেল করা chunk আবার upload করুন), **parallelizable** করে (একসাথে 4টা chunk upload করুন), এবং **verifiable** করে (per-chunk এবং মোট checksum)।

## ধাপ 2: Upload Initiation

চলুন upload session সংজ্ঞায়িত করে শুরু করি। যখন কোনো client একটা upload শুরু করে, আমরা ফাইল টাইপটাকে একটা allow-list-এর বিপরীতে ভ্যালিডেট করি, মোট সাইজ লিমিটের বিপরীতে যাচাই করি, প্রত্যাশিত chunk সংখ্যা হিসাব করি, এবং একটা upload ID ফেরত দিই।

## ধাপ 3: Chunked Upload Handler

প্রতিটা chunk upload-এ থাকে upload ID, chunk নম্বর, এবং chunk-এর ডেটা। আমরা chunk-এর checksum যাচাই করি, সেটা store করি, এবং কোন chunk-গুলো পাওয়া গেছে তা ট্র্যাক করি। Client জিজ্ঞেস করতে পারে কোন chunk-গুলো missing, যাতে resume logic বাস্তবায়ন করা যায়।

## ধাপ 4: Assembly এবং Verification

যখন client completion সিগন্যাল দেয়, আমরা যাচাই করি সব chunk আছে কিনা, সেগুলোকে ক্রমানুসারে concatenate করি, এবং মোট ফাইলের checksum client যা initiation-এ ঘোষণা করেছিল তার সাথে মেলে কিনা তা যাচাই করি। কোনো chunk missing বা corrupted হলে, assembly একটা পরিষ্কার error দিয়ে ফেল করে।

## ধাপ 5: Post-Processing Pipeline

Assembly-র পরে, ফাইলগুলো একটা async processing pipeline-এ ঢোকে: content type verification (client-এর দাবি বিশ্বাস করবেন না), virus scanning (প্রোডাকশনে ClamAV বা সমতুল্য কিছু call করুন), এবং ছবির ক্ষেত্রে thumbnail generation। প্রসেসিং ব্যাকগ্রাউন্ডে হয় — upload API সাথে সাথেই ফেরত আসে।

## ধাপ 6: Signed URL দিয়ে File Serving

ফাইলগুলো signed URL-এর মাধ্যমে serve করা হয় — সময়-সীমিত, HMAC-signed token যা সাময়িক access দেয়। এটা আপনাকে auth system এক্সপোজ না করেই CDN-এর মাধ্যমে ফাইল serve করতে দেয়। Signed URL-এ থাকে file ID, expiration timestamp, এবং একটা signature যা CDN আপনার backend-কে call না করেই যাচাই করতে পারে।

## সব একসাথে জোড়া দেওয়া

<CodeTabs tsFile="file-upload.ts" goFile="file-upload.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';
import crypto from 'node:crypto';

// ===========================================
// 1. TYPES & CONFIG
// ===========================================
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB max
const SIGNING_SECRET = process.env.SIGNING_SECRET || 'super-secret-key';
const ALLOWED_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'video/mp4',
	'video/webm',
	'application/pdf',
	'text/plain',
	'application/zip'
]);

type UploadStatus = 'uploading' | 'assembling' | 'processing' | 'ready' | 'failed';

interface UploadSession {
	id: string;
	fileName: string;
	fileSize: number;
	contentType: string;
	totalChunks: number;
	uploadedChunks: Set<number>;
	checksum: string; // expected SHA-256 of complete file
	status: UploadStatus;
	createdAt: string;
	completedAt: string | null;
	ownerId: string;
}

interface FileRecord {
	id: string;
	uploadId: string;
	fileName: string;
	fileSize: number;
	contentType: string;
	checksum: string;
	status: 'processing' | 'ready' | 'quarantined';
	scanResult: string | null;
	createdAt: string;
}

// ===========================================
// 2. UPLOAD SESSION MANAGER
// ===========================================
class UploadManager {
	private sessions = new Map<string, UploadSession>();
	private chunks = new Map<string, Map<number, Buffer>>(); // uploadId -> chunkNum -> data
	private files = new Map<string, FileRecord>();

	initiate(
		fileName: string,
		fileSize: number,
		contentType: string,
		checksum: string,
		ownerId: string
	): UploadSession {
		if (!ALLOWED_TYPES.has(contentType)) {
			throw new Error(`File type ${contentType} not allowed`);
		}
		if (fileSize > MAX_FILE_SIZE) {
			throw new Error(`File size ${fileSize} exceeds maximum ${MAX_FILE_SIZE}`);
		}

		const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
		const session: UploadSession = {
			id: crypto.randomUUID(),
			fileName,
			fileSize,
			contentType,
			totalChunks,
			uploadedChunks: new Set(),
			checksum,
			status: 'uploading',
			createdAt: new Date().toISOString(),
			completedAt: null,
			ownerId
		};

		this.sessions.set(session.id, session);
		this.chunks.set(session.id, new Map());
		return session;
	}

	uploadChunk(uploadId: string, chunkNum: number, data: Buffer, chunkChecksum: string): void {
		const session = this.sessions.get(uploadId);
		if (!session) throw new Error('Upload session not found');
		if (session.status !== 'uploading') throw new Error('Upload not in uploading state');
		if (chunkNum < 0 || chunkNum >= session.totalChunks) throw new Error('Invalid chunk number');

		// Verify chunk checksum
		const actualChecksum = crypto.createHash('sha256').update(data).digest('hex');
		if (actualChecksum !== chunkChecksum) {
			throw new Error('Chunk checksum mismatch');
		}

		this.chunks.get(uploadId)!.set(chunkNum, data);
		session.uploadedChunks.add(chunkNum);
	}

	getMissingChunks(uploadId: string): number[] {
		const session = this.sessions.get(uploadId);
		if (!session) throw new Error('Upload session not found');
		const missing: number[] = [];
		for (let i = 0; i < session.totalChunks; i++) {
			if (!session.uploadedChunks.has(i)) missing.push(i);
		}
		return missing;
	}

	complete(uploadId: string): FileRecord {
		const session = this.sessions.get(uploadId);
		if (!session) throw new Error('Upload session not found');

		const missing = this.getMissingChunks(uploadId);
		if (missing.length > 0) {
			throw new Error(`Missing chunks: ${missing.join(', ')}`);
		}

		session.status = 'assembling';

		// Assemble chunks in order
		const chunkMap = this.chunks.get(uploadId)!;
		const buffers: Buffer[] = [];
		for (let i = 0; i < session.totalChunks; i++) {
			buffers.push(chunkMap.get(i)!);
		}
		const assembled = Buffer.concat(buffers);

		// Verify total checksum
		const actualChecksum = crypto.createHash('sha256').update(assembled).digest('hex');
		if (actualChecksum !== session.checksum) {
			session.status = 'failed';
			throw new Error('File checksum mismatch after assembly');
		}

		// Create file record
		const file: FileRecord = {
			id: crypto.randomUUID(),
			uploadId: session.id,
			fileName: session.fileName,
			fileSize: assembled.length,
			contentType: session.contentType,
			checksum: actualChecksum,
			status: 'processing',
			scanResult: null,
			createdAt: new Date().toISOString()
		};

		this.files.set(file.id, file);
		session.status = 'processing';
		session.completedAt = new Date().toISOString();

		// Clean up chunks from memory
		this.chunks.delete(uploadId);

		// Async post-processing
		this.postProcess(file);

		return file;
	}

	private async postProcess(file: FileRecord): Promise<void> {
		// Simulate virus scan
		console.log(`[SCAN] Scanning ${file.fileName}...`);
		setTimeout(() => {
			file.scanResult = 'clean';
			file.status = 'ready';
			console.log(`[SCAN] ${file.fileName} is clean — file ready`);
		}, 2000);
	}

	getFile(fileId: string): FileRecord | null {
		return this.files.get(fileId) || null;
	}

	getSession(uploadId: string): UploadSession | null {
		return this.sessions.get(uploadId) || null;
	}

	// Generate a signed URL for file download
	generateSignedUrl(fileId: string, expiresIn = 3600): string {
		const file = this.files.get(fileId);
		if (!file) throw new Error('File not found');
		if (file.status !== 'ready') throw new Error('File not ready for download');

		const expires = Math.floor(Date.now() / 1000) + expiresIn;
		const payload = `${fileId}:${expires}`;
		const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');

		return `/files/${fileId}?expires=${expires}&sig=${signature}`;
	}

	verifySignedUrl(fileId: string, expires: string, signature: string): boolean {
		const expiresNum = parseInt(expires);
		if (Date.now() / 1000 > expiresNum) return false; // Expired

		const payload = `${fileId}:${expires}`;
		const expected = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
		return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
	}
}

// ===========================================
// 3. HTTP SERVER
// ===========================================
const manager = new UploadManager();

function parseBody(req: http.IncomingMessage): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});
}

function parseJSON(buf: Buffer): unknown {
	return JSON.parse(buf.toString());
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const method = req.method || 'GET';

	try {
		// POST /api/uploads/initiate
		if (url.pathname === '/api/uploads/initiate' && method === 'POST') {
			const body = parseJSON(await parseBody(req)) as any;
			if (!body.fileName || !body.fileSize || !body.contentType || !body.checksum) {
				json(res, 400, { error: 'fileName, fileSize, contentType, and checksum required' });
				return;
			}
			const session = manager.initiate(
				body.fileName,
				body.fileSize,
				body.contentType,
				body.checksum,
				body.ownerId || 'anonymous'
			);
			json(res, 201, {
				uploadId: session.id,
				totalChunks: session.totalChunks,
				chunkSize: CHUNK_SIZE,
				status: session.status
			});
			return;
		}

		// PUT /api/uploads/:id/chunks/:chunkNum
		const chunkMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)\/chunks\/(\d+)$/);
		if (chunkMatch && method === 'PUT') {
			const data = await parseBody(req);
			const chunkChecksum = req.headers['x-chunk-checksum'] as string;
			if (!chunkChecksum) {
				json(res, 400, { error: 'X-Chunk-Checksum header required' });
				return;
			}
			manager.uploadChunk(chunkMatch[1], parseInt(chunkMatch[2]), data, chunkChecksum);
			json(res, 200, { status: 'chunk_received', chunkNum: parseInt(chunkMatch[2]) });
			return;
		}

		// POST /api/uploads/:id/complete
		const completeMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)\/complete$/);
		if (completeMatch && method === 'POST') {
			const file = manager.complete(completeMatch[1]);
			json(res, 200, {
				fileId: file.id,
				status: file.status,
				fileName: file.fileName,
				fileSize: file.fileSize,
				checksum: file.checksum
			});
			return;
		}

		// GET /api/uploads/:id/status
		const statusMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)\/status$/);
		if (statusMatch && method === 'GET') {
			const session = manager.getSession(statusMatch[1]);
			if (!session) {
				json(res, 404, { error: 'Upload not found' });
				return;
			}
			json(res, 200, {
				uploadId: session.id,
				status: session.status,
				uploadedChunks: [...session.uploadedChunks],
				missingChunks: manager.getMissingChunks(session.id),
				totalChunks: session.totalChunks
			});
			return;
		}

		// GET /api/files/:id
		const fileMatch = url.pathname.match(/^\/api\/files\/([^/]+)$/);
		if (fileMatch && method === 'GET') {
			const file = manager.getFile(fileMatch[1]);
			if (!file) {
				json(res, 404, { error: 'File not found' });
				return;
			}
			json(res, 200, file);
			return;
		}

		// GET /api/files/:id/download — Generate signed URL
		const downloadMatch = url.pathname.match(/^\/api\/files\/([^/]+)\/download$/);
		if (downloadMatch && method === 'GET') {
			const signedUrl = manager.generateSignedUrl(downloadMatch[1]);
			json(res, 200, { downloadUrl: signedUrl });
			return;
		}

		if (url.pathname === '/health') {
			json(res, 200, { status: 'ok' });
			return;
		}
		json(res, 404, { error: 'Not found' });
	} catch (err: any) {
		json(res, 400, { error: err.message || 'Internal server error' });
	}
});

const PORT = parseInt(process.env.PORT || '3000');
server.listen(PORT, () => console.log(`File Upload Service on http://localhost:${PORT}`));
process.on('SIGTERM', () => server.close());
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"sync"
	"syscall"
	"time"
)

// ===========================================
// 1. TYPES & CONFIG
// ===========================================
const (
	ChunkSize    = 5 * 1024 * 1024             // 5MB
	MaxFileSize  = 5 * 1024 * 1024 * 1024      // 5GB
	SigningSecret = "super-secret-key"
)

var allowedTypes = map[string]bool{
	"image/jpeg": true, "image/png": true, "image/gif": true,
	"video/mp4": true, "video/webm": true, "application/pdf": true,
	"text/plain": true, "application/zip": true,
}

type UploadSession struct {
	ID             string         `json:"id"`
	FileName       string         `json:"fileName"`
	FileSize       int64          `json:"fileSize"`
	ContentType    string         `json:"contentType"`
	TotalChunks    int            `json:"totalChunks"`
	UploadedChunks map[int]bool   `json:"-"`
	Uploaded       []int          `json:"uploadedChunks"`
	Checksum       string         `json:"checksum"`
	Status         string         `json:"status"`
	CreatedAt      time.Time      `json:"createdAt"`
	OwnerID        string         `json:"ownerId"`
}

type FileRecord struct {
	ID          string    `json:"id"`
	UploadID    string    `json:"uploadId"`
	FileName    string    `json:"fileName"`
	FileSize    int64     `json:"fileSize"`
	ContentType string    `json:"contentType"`
	Checksum    string    `json:"checksum"`
	Status      string    `json:"status"`
	ScanResult  *string   `json:"scanResult"`
	CreatedAt   time.Time `json:"createdAt"`
}

// ===========================================
// 2. UPLOAD MANAGER
// ===========================================
type UploadManager struct {
	mu       sync.Mutex
	sessions map[string]*UploadSession
	chunks   map[string]map[int][]byte
	files    map[string]*FileRecord
	counter  int64
}

func NewUploadManager() *UploadManager {
	return &UploadManager{
		sessions: make(map[string]*UploadSession),
		chunks:   make(map[string]map[int][]byte),
		files:    make(map[string]*FileRecord),
	}
}

func (um *UploadManager) Initiate(fileName string, fileSize int64, contentType, checksum, ownerID string) (*UploadSession, error) {
	if !allowedTypes[contentType] {
		return nil, fmt.Errorf("file type %s not allowed", contentType)
	}
	if fileSize > MaxFileSize {
		return nil, fmt.Errorf("file size exceeds maximum")
	}

	um.mu.Lock()
	defer um.mu.Unlock()
	um.counter++
	totalChunks := int(math.Ceil(float64(fileSize) / float64(ChunkSize)))

	session := &UploadSession{
		ID: fmt.Sprintf("upload_%d", um.counter),
		FileName: fileName, FileSize: fileSize, ContentType: contentType,
		TotalChunks: totalChunks, UploadedChunks: make(map[int]bool),
		Checksum: checksum, Status: "uploading",
		CreatedAt: time.Now().UTC(), OwnerID: ownerID,
	}
	um.sessions[session.ID] = session
	um.chunks[session.ID] = make(map[int][]byte)
	return session, nil
}

func (um *UploadManager) UploadChunk(uploadID string, chunkNum int, data []byte, chunkChecksum string) error {
	um.mu.Lock()
	defer um.mu.Unlock()

	session := um.sessions[uploadID]
	if session == nil { return fmt.Errorf("upload not found") }
	if session.Status != "uploading" { return fmt.Errorf("upload not in uploading state") }
	if chunkNum < 0 || chunkNum >= session.TotalChunks { return fmt.Errorf("invalid chunk number") }

	hash := sha256.Sum256(data)
	actual := hex.EncodeToString(hash[:])
	if actual != chunkChecksum { return fmt.Errorf("chunk checksum mismatch") }

	um.chunks[uploadID][chunkNum] = data
	session.UploadedChunks[chunkNum] = true
	return nil
}

func (um *UploadManager) GetMissing(uploadID string) ([]int, error) {
	um.mu.Lock()
	defer um.mu.Unlock()
	session := um.sessions[uploadID]
	if session == nil { return nil, fmt.Errorf("upload not found") }
	var missing []int
	for i := 0; i < session.TotalChunks; i++ {
		if !session.UploadedChunks[i] { missing = append(missing, i) }
	}
	return missing, nil
}

func (um *UploadManager) Complete(uploadID string) (*FileRecord, error) {
	um.mu.Lock()
	session := um.sessions[uploadID]
	if session == nil { um.mu.Unlock(); return nil, fmt.Errorf("upload not found") }

	for i := 0; i < session.TotalChunks; i++ {
		if !session.UploadedChunks[i] {
			um.mu.Unlock()
			return nil, fmt.Errorf("missing chunk %d", i)
		}
	}

	session.Status = "assembling"
	chunkData := um.chunks[uploadID]

	h := sha256.New()
	var totalSize int64
	for i := 0; i < session.TotalChunks; i++ {
		h.Write(chunkData[i])
		totalSize += int64(len(chunkData[i]))
	}
	actual := hex.EncodeToString(h.Sum(nil))
	if actual != session.Checksum {
		session.Status = "failed"
		um.mu.Unlock()
		return nil, fmt.Errorf("file checksum mismatch")
	}

	um.counter++
	file := &FileRecord{
		ID: fmt.Sprintf("file_%d", um.counter), UploadID: uploadID,
		FileName: session.FileName, FileSize: totalSize,
		ContentType: session.ContentType, Checksum: actual,
		Status: "processing", CreatedAt: time.Now().UTC(),
	}
	um.files[file.ID] = file
	session.Status = "processing"
	delete(um.chunks, uploadID)
	um.mu.Unlock()

	// Async post-processing
	go func() {
		log.Printf("[SCAN] Scanning %s...", file.FileName)
		time.Sleep(2 * time.Second)
		um.mu.Lock()
		clean := "clean"
		file.ScanResult = &clean
		file.Status = "ready"
		um.mu.Unlock()
		log.Printf("[SCAN] %s is clean — file ready", file.FileName)
	}()

	return file, nil
}

func (um *UploadManager) GetFile(fileID string) *FileRecord {
	um.mu.Lock()
	defer um.mu.Unlock()
	return um.files[fileID]
}

func (um *UploadManager) GetSession(uploadID string) *UploadSession {
	um.mu.Lock()
	defer um.mu.Unlock()
	return um.sessions[uploadID]
}

func (um *UploadManager) GenerateSignedURL(fileID string, expiresIn int64) (string, error) {
	um.mu.Lock()
	file := um.files[fileID]
	um.mu.Unlock()
	if file == nil { return "", fmt.Errorf("file not found") }
	if file.Status != "ready" { return "", fmt.Errorf("file not ready") }

	expires := time.Now().Unix() + expiresIn
	payload := fmt.Sprintf("%s:%d", fileID, expires)
	mac := hmac.New(sha256.New, []byte(SigningSecret))
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))

	return fmt.Sprintf("/files/%s?expires=%d&sig=%s", fileID, expires, sig), nil
}

// ===========================================
// 3. HTTP SERVER
// ===========================================
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func main() {
	mgr := NewUploadManager()
	chunkPattern := regexp.MustCompile(`^/api/uploads/([^/]+)/chunks/(\d+)$`)
	completePattern := regexp.MustCompile(`^/api/uploads/([^/]+)/complete$`)
	statusPattern := regexp.MustCompile(`^/api/uploads/([^/]+)/status$`)
	filePattern := regexp.MustCompile(`^/api/files/([^/]+)$`)
	downloadPattern := regexp.MustCompile(`^/api/files/([^/]+)/download$`)

	mux := http.NewServeMux()

	mux.HandleFunc("/api/uploads/initiate", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost { writeJSON(w, 405, map[string]string{"error": "Method not allowed"}); return }
		var body struct {
			FileName    string `json:"fileName"`
			FileSize    int64  `json:"fileSize"`
			ContentType string `json:"contentType"`
			Checksum    string `json:"checksum"`
			OwnerID     string `json:"ownerId"`
		}
		json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body)
		if body.FileName == "" || body.FileSize == 0 || body.ContentType == "" || body.Checksum == "" {
			writeJSON(w, 400, map[string]string{"error": "fileName, fileSize, contentType, checksum required"}); return
		}
		s, err := mgr.Initiate(body.FileName, body.FileSize, body.ContentType, body.Checksum, body.OwnerID)
		if err != nil { writeJSON(w, 400, map[string]string{"error": err.Error()}); return }
		writeJSON(w, 201, map[string]interface{}{"uploadId": s.ID, "totalChunks": s.TotalChunks, "chunkSize": ChunkSize})
	})

	mux.HandleFunc("/api/uploads/", func(w http.ResponseWriter, r *http.Request) {
		if m := chunkPattern.FindStringSubmatch(r.URL.Path); m != nil && r.Method == http.MethodPut {
			chunkNum, _ := strconv.Atoi(m[2])
			data, _ := io.ReadAll(http.MaxBytesReader(w, r.Body, ChunkSize+1024))
			checksum := r.Header.Get("X-Chunk-Checksum")
			if checksum == "" { writeJSON(w, 400, map[string]string{"error": "X-Chunk-Checksum required"}); return }
			if err := mgr.UploadChunk(m[1], chunkNum, data, checksum); err != nil {
				writeJSON(w, 400, map[string]string{"error": err.Error()}); return
			}
			writeJSON(w, 200, map[string]interface{}{"status": "chunk_received", "chunkNum": chunkNum}); return
		}
		if m := completePattern.FindStringSubmatch(r.URL.Path); m != nil && r.Method == http.MethodPost {
			file, err := mgr.Complete(m[1])
			if err != nil { writeJSON(w, 400, map[string]string{"error": err.Error()}); return }
			writeJSON(w, 200, file); return
		}
		if m := statusPattern.FindStringSubmatch(r.URL.Path); m != nil && r.Method == http.MethodGet {
			s := mgr.GetSession(m[1])
			if s == nil { writeJSON(w, 404, map[string]string{"error": "Upload not found"}); return }
			missing, _ := mgr.GetMissing(m[1])
			writeJSON(w, 200, map[string]interface{}{"uploadId": s.ID, "status": s.Status, "missingChunks": missing, "totalChunks": s.TotalChunks}); return
		}
		writeJSON(w, 404, map[string]string{"error": "Not found"})
	})

	mux.HandleFunc("/api/files/", func(w http.ResponseWriter, r *http.Request) {
		if m := downloadPattern.FindStringSubmatch(r.URL.Path); m != nil {
			url, err := mgr.GenerateSignedURL(m[1], 3600)
			if err != nil { writeJSON(w, 400, map[string]string{"error": err.Error()}); return }
			writeJSON(w, 200, map[string]string{"downloadUrl": url}); return
		}
		if m := filePattern.FindStringSubmatch(r.URL.Path); m != nil {
			f := mgr.GetFile(m[1])
			if f == nil { writeJSON(w, 404, map[string]string{"error": "File not found"}); return }
			writeJSON(w, 200, f); return
		}
		writeJSON(w, 404, map[string]string{"error": "Not found"})
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	port := os.Getenv("PORT"); if port == "" { port = "3000" }
	srv := &http.Server{Addr: ":" + port, Handler: mux, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second}

	go func() {
		log.Printf("File Upload Service on http://localhost:%s", port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed { log.Fatal(err) }
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	srv.Close()
}
```

</div>
</CodeTabs>

## ডিজাইন সিদ্ধান্তের ব্যাখ্যা

### কেন Chunked Upload?

একটা 5GB ফাইল upload করা single HTTP request ভঙ্গুর — সামান্য নেটওয়ার্ক সমস্যা মানেই আবার শুরু থেকে করা। Chunked upload ফাইলটাকে সামলানোর মতো টুকরোয় (প্রতিটা 5MB) ভাগ করে। 200-এর মধ্যে 47 নম্বর chunk ফেল করলে, আপনি শুধু 5MB আবার upload করেন, 235MB নয়। Chunk-গুলো parallel-এও upload হতে পারে (একসাথে 4টা = 4x দ্রুত) এবং ক্রম ছাড়াও (সার্ভার ট্র্যাক করে কোনগুলো পাওয়া গেছে)।

### কেন প্রতি Chunk-এ Checksum?

Corruption যেকোনো layer-এ হতে পারে — নেটওয়ার্ক, ডিস্ক, মেমরি। আপনি যদি শুধু চূড়ান্ত assembled ফাইলটা যাচাই করেন, তবে একটা corrupted chunk মানে পুরো ফাইল আবার upload করা। Per-chunk checksum সম্ভাব্য সবচেয়ে ছোট এককে corruption ধরে ফেলে: upload সাথে সাথেই ফেল করে, আপনি ঠিক জানেন কোন chunk retry করতে হবে, এবং পরবর্তী chunk-গুলোতে bandwidth নষ্ট করেননি।

### কেন Auth Token-এর বদলে Signed URL?

Auth token-এর জন্য CDN-কে প্রতিটা ফাইল রিকোয়েস্টের জন্য আপনার backend-কে call করতে হয় — যা CDN-এর উদ্দেশ্যই ব্যর্থ করে দেয়। Signed URL authorization সরাসরি URL-এর মধ্যে embed করে: CDN HMAC signature স্থানীয়ভাবে যাচাই করে, কোনো backend call লাগে না। URL স্বয়ংক্রিয়ভাবে expire হয়ে যায় (ডিফল্টে 1 ঘণ্টা), তাই শেয়ার করা হলেও access সময়-সীমিত। AWS S3-এর presigned URL এবং Cloudflare-এর signed URL ঠিক এভাবেই কাজ করে।

### কেন Async Post-Processing?

একটা 2GB ভিডিও virus scan করতে কয়েক সেকেন্ড থেকে মিনিট লাগে। Upload API-কে scan-এর জন্য অপেক্ষা করানো মানে ভয়ংকর upload UX। বদলে, upload সাথে সাথেই "processing" status নিয়ে ফেরত আসে, এবং একটা background worker scanning, thumbnail generation, এবং content type verification সামলায়। Client status endpoint poll করে বা প্রসেসিং শেষ হলে একটা webhook পায়।

<div class="takeaways">

### মূল শিক্ষা

- Chunked upload বড় ফাইল transfer-কে নির্ভরযোগ্য করে — একটা নেটওয়ার্ক ব্যর্থতা শুধু একটা chunk হারায়, পুরো ফাইল নয়
- Per-chunk checksum সম্ভাব্য সবচেয়ে ছোট এককে corruption শনাক্ত করে, পরবর্তী chunk-গুলোতে bandwidth নষ্ট হওয়ার আগেই
- Resumable upload ব্যবহারকারীদের যেখানে থেমেছিলেন সেখান থেকে চালিয়ে যেতে দেয় — অনির্ভরযোগ্য নেটওয়ার্কে থাকা মোবাইল ব্যবহারকারীদের জন্য অপরিহার্য
- Signed URL authentication-কে file serving থেকে আলাদা করে, আপনার auth server-কে না ছুঁয়েই CDN edge delivery সম্ভব করে
- Async post-processing (virus scan, thumbnail) upload response time দ্রুত রাখে
- Upload-এর সময় content type validation পরে ক্ষতিকর ফাইল serve করা প্রতিরোধ করে

</div>

<div class="when-to-use">

### বাস্তব জীবনে ব্যবহার

- **AWS S3** multipart upload ফাইলগুলোকে 5MB-5GB chunk-এ ভাগ করে parallel upload সাপোর্ট সহ
- **Google Drive** অস্থির connection-এ নির্ভরযোগ্য transfer-এর জন্য chunk checksum সহ resumable upload ব্যবহার করে
- **Cloudflare R2** access control-এর জন্য signed URL ব্যবহার করে 300+ edge location-এর মাধ্যমে ফাইল serve করে
- **Dropbox** ব্যবহারকারীদের মধ্যে chunk deduplicate করে — কেউ আগে সেই chunk upload করে থাকলে, সেটা রেফারেন্স করা হয়, আবার store করা হয় না
- এই architecture resumable chunked upload এবং sub-100ms signed URL generation সহ 5GB পর্যন্ত ফাইল হ্যান্ডল করে

</div>
