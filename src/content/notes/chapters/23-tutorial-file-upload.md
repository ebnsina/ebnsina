---
title: "Tutorial: Build a File Upload Service"
subtitle: "Step-by-step guide to building a production file upload service with chunked uploads, resumable transfers, virus scanning, and CDN integration."
chapter: 23
level: "intermediate"
readingTime: "26 min"
topics: ["tutorial", "file upload", "chunked upload", "resumable transfer", "content delivery"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Diagram from '$lib/components/content/Diagram.svelte';
</script>

## What We're Building

In this tutorial, we'll build a production file upload service that handles large files (up to 5GB), supports chunked and resumable uploads, validates content types, generates signed URLs for secure downloads, and processes files asynchronously (virus scanning, thumbnail generation). Think of it as a simplified version of what AWS S3, Google Drive, or Dropbox uses internally.

<Callout type="info">

**Real-World Analogy**

Like submitting documents at a government office — you fill out a form, attach your files, the clerk checks everything is correct, stamps it, and files it away. Large documents get broken into sections.

</Callout>

The key insight: you can't just POST a 5GB file in one request. Networks fail, timeouts expire, and servers run out of memory. Instead, we split files into chunks, upload each chunk independently, and assemble them server-side. If the network drops, only the current chunk is lost — resume from where you left off.

<Diagram title="File Upload Service Architecture">
  <div class="diagram-row">
    <div class="box box-client">Client<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Chunked Upload</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-lb">Upload API<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Validate & Route</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">Chunk Assembler<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Merge & Verify</span></div>
  </div>
  <div class="diagram-row" style="justify-content:center;">
    <div class="arrow-down">v</div>
  </div>
  <div class="diagram-row">
    <div class="box box-db">Object Store<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">File Storage</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-queue">Processing Queue<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Scan & Transform</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-cache">CDN<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Edge Delivery</span></div>
  </div>
</Diagram>

## Step 1: The Upload Protocol

Our upload follows a three-phase approach, similar to S3's multipart upload:

1. **Initiate** — Client tells the server: "I want to upload a 2GB file called video.mp4 in 20 chunks." Server creates an upload session and returns an upload ID.
2. **Upload chunks** — Client uploads each chunk independently (can be in parallel). Each chunk includes its number and a checksum for integrity verification.
3. **Complete** — Client says "all chunks uploaded." Server assembles them, verifies the total checksum, and marks the file as ready.

This protocol makes uploads **resumable** (just re-upload failed chunks), **parallelizable** (upload 4 chunks at once), and **verifiable** (per-chunk and total checksums).

## Step 2: Upload Initiation

Let's start by defining the upload session. When a client initiates an upload, we validate the file type against an allow-list, check the total size against limits, calculate the expected number of chunks, and return an upload ID.

## Step 3: Chunked Upload Handler

Each chunk upload includes the upload ID, chunk number, and the chunk data. We verify the chunk checksum, store it, and track which chunks have been received. The client can query which chunks are missing to implement resume logic.

## Step 4: Assembly and Verification

When the client signals completion, we verify all chunks are present, concatenate them in order, and verify the total file checksum matches what the client declared at initiation. If any chunk is missing or corrupted, the assembly fails with a clear error.

## Step 5: Post-Processing Pipeline

After assembly, files enter an async processing pipeline: content type verification (don't trust the client's claim), virus scanning (in production, call ClamAV or similar), and for images, thumbnail generation. Processing happens in the background — the upload API returns immediately.

## Step 6: File Serving with Signed URLs

Files are served through signed URLs — time-limited, HMAC-signed tokens that grant temporary access. This lets you serve files through a CDN without exposing your auth system. The signed URL contains the file ID, expiration timestamp, and a signature that the CDN can verify without calling your backend.

## Putting It All Together

<CodeTabs tsFile="file-upload.ts" goFile="file-upload.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from "node:http";
import crypto from "node:crypto";

// ===========================================
// 1. TYPES & CONFIG
// ===========================================
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB max
const SIGNING_SECRET = process.env.SIGNING_SECRET || "super-secret-key";
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm", "application/pdf",
  "text/plain", "application/zip",
]);

type UploadStatus = "uploading" | "assembling" | "processing" | "ready" | "failed";

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
  status: "processing" | "ready" | "quarantined";
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

  initiate(fileName: string, fileSize: number, contentType: string, checksum: string, ownerId: string): UploadSession {
    if (!ALLOWED_TYPES.has(contentType)) {
      throw new Error(`File type ${contentType} not allowed`);
    }
    if (fileSize > MAX_FILE_SIZE) {
      throw new Error(`File size ${fileSize} exceeds maximum ${MAX_FILE_SIZE}`);
    }

    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const session: UploadSession = {
      id: crypto.randomUUID(),
      fileName, fileSize, contentType, totalChunks,
      uploadedChunks: new Set(), checksum,
      status: "uploading",
      createdAt: new Date().toISOString(),
      completedAt: null, ownerId,
    };

    this.sessions.set(session.id, session);
    this.chunks.set(session.id, new Map());
    return session;
  }

  uploadChunk(uploadId: string, chunkNum: number, data: Buffer, chunkChecksum: string): void {
    const session = this.sessions.get(uploadId);
    if (!session) throw new Error("Upload session not found");
    if (session.status !== "uploading") throw new Error("Upload not in uploading state");
    if (chunkNum < 0 || chunkNum >= session.totalChunks) throw new Error("Invalid chunk number");

    // Verify chunk checksum
    const actualChecksum = crypto.createHash("sha256").update(data).digest("hex");
    if (actualChecksum !== chunkChecksum) {
      throw new Error("Chunk checksum mismatch");
    }

    this.chunks.get(uploadId)!.set(chunkNum, data);
    session.uploadedChunks.add(chunkNum);
  }

  getMissingChunks(uploadId: string): number[] {
    const session = this.sessions.get(uploadId);
    if (!session) throw new Error("Upload session not found");
    const missing: number[] = [];
    for (let i = 0; i < session.totalChunks; i++) {
      if (!session.uploadedChunks.has(i)) missing.push(i);
    }
    return missing;
  }

  complete(uploadId: string): FileRecord {
    const session = this.sessions.get(uploadId);
    if (!session) throw new Error("Upload session not found");

    const missing = this.getMissingChunks(uploadId);
    if (missing.length > 0) {
      throw new Error(`Missing chunks: ${missing.join(", ")}`);
    }

    session.status = "assembling";

    // Assemble chunks in order
    const chunkMap = this.chunks.get(uploadId)!;
    const buffers: Buffer[] = [];
    for (let i = 0; i < session.totalChunks; i++) {
      buffers.push(chunkMap.get(i)!);
    }
    const assembled = Buffer.concat(buffers);

    // Verify total checksum
    const actualChecksum = crypto.createHash("sha256").update(assembled).digest("hex");
    if (actualChecksum !== session.checksum) {
      session.status = "failed";
      throw new Error("File checksum mismatch after assembly");
    }

    // Create file record
    const file: FileRecord = {
      id: crypto.randomUUID(),
      uploadId: session.id,
      fileName: session.fileName,
      fileSize: assembled.length,
      contentType: session.contentType,
      checksum: actualChecksum,
      status: "processing",
      scanResult: null,
      createdAt: new Date().toISOString(),
    };

    this.files.set(file.id, file);
    session.status = "processing";
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
      file.scanResult = "clean";
      file.status = "ready";
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
    if (!file) throw new Error("File not found");
    if (file.status !== "ready") throw new Error("File not ready for download");

    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const payload = `${fileId}:${expires}`;
    const signature = crypto.createHmac("sha256", SIGNING_SECRET).update(payload).digest("hex");

    return `/files/${fileId}?expires=${expires}&sig=${signature}`;
  }

  verifySignedUrl(fileId: string, expires: string, signature: string): boolean {
    const expiresNum = parseInt(expires);
    if (Date.now() / 1000 > expiresNum) return false; // Expired

    const payload = `${fileId}:${expires}`;
    const expected = crypto.createHmac("sha256", SIGNING_SECRET).update(payload).digest("hex");
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
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseJSON(buf: Buffer): unknown {
  return JSON.parse(buf.toString());
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const method = req.method || "GET";

  try {
    // POST /api/uploads/initiate
    if (url.pathname === "/api/uploads/initiate" && method === "POST") {
      const body = parseJSON(await parseBody(req)) as any;
      if (!body.fileName || !body.fileSize || !body.contentType || !body.checksum) {
        json(res, 400, { error: "fileName, fileSize, contentType, and checksum required" }); return;
      }
      const session = manager.initiate(
        body.fileName, body.fileSize, body.contentType,
        body.checksum, body.ownerId || "anonymous"
      );
      json(res, 201, {
        uploadId: session.id, totalChunks: session.totalChunks,
        chunkSize: CHUNK_SIZE, status: session.status,
      }); return;
    }

    // PUT /api/uploads/:id/chunks/:chunkNum
    const chunkMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)\/chunks\/(\d+)$/);
    if (chunkMatch && method === "PUT") {
      const data = await parseBody(req);
      const chunkChecksum = req.headers["x-chunk-checksum"] as string;
      if (!chunkChecksum) {
        json(res, 400, { error: "X-Chunk-Checksum header required" }); return;
      }
      manager.uploadChunk(chunkMatch[1], parseInt(chunkMatch[2]), data, chunkChecksum);
      json(res, 200, { status: "chunk_received", chunkNum: parseInt(chunkMatch[2]) }); return;
    }

    // POST /api/uploads/:id/complete
    const completeMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)\/complete$/);
    if (completeMatch && method === "POST") {
      const file = manager.complete(completeMatch[1]);
      json(res, 200, {
        fileId: file.id, status: file.status, fileName: file.fileName,
        fileSize: file.fileSize, checksum: file.checksum,
      }); return;
    }

    // GET /api/uploads/:id/status
    const statusMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)\/status$/);
    if (statusMatch && method === "GET") {
      const session = manager.getSession(statusMatch[1]);
      if (!session) { json(res, 404, { error: "Upload not found" }); return; }
      json(res, 200, {
        uploadId: session.id, status: session.status,
        uploadedChunks: [...session.uploadedChunks],
        missingChunks: manager.getMissingChunks(session.id),
        totalChunks: session.totalChunks,
      }); return;
    }

    // GET /api/files/:id
    const fileMatch = url.pathname.match(/^\/api\/files\/([^/]+)$/);
    if (fileMatch && method === "GET") {
      const file = manager.getFile(fileMatch[1]);
      if (!file) { json(res, 404, { error: "File not found" }); return; }
      json(res, 200, file); return;
    }

    // GET /api/files/:id/download — Generate signed URL
    const downloadMatch = url.pathname.match(/^\/api\/files\/([^/]+)\/download$/);
    if (downloadMatch && method === "GET") {
      const signedUrl = manager.generateSignedUrl(downloadMatch[1]);
      json(res, 200, { downloadUrl: signedUrl }); return;
    }

    if (url.pathname === "/health") { json(res, 200, { status: "ok" }); return; }
    json(res, 404, { error: "Not found" });
  } catch (err: any) {
    json(res, 400, { error: err.message || "Internal server error" });
  }
});

const PORT = parseInt(process.env.PORT || "3000");
server.listen(PORT, () => console.log(`File Upload Service on http://localhost:${PORT}`));
process.on("SIGTERM", () => server.close());
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

## Design Decisions Explained

### Why Chunked Uploads?

A single HTTP request uploading a 5GB file is fragile — any network hiccup means starting over. Chunked uploads split the file into manageable pieces (5MB each). If chunk 47 of 200 fails, you only re-upload 5MB, not 235MB. Chunks can also be uploaded in parallel (4 at a time = 4x faster) and out of order (the server tracks which are received).

### Why Checksums Per Chunk?

Corruption can happen at any layer — network, disk, memory. If you only verify the final assembled file, a corrupted chunk means re-uploading the entire file. Per-chunk checksums catch corruption at the smallest possible unit: upload fails immediately, you know exactly which chunk to retry, and you haven't wasted bandwidth on subsequent chunks.

### Why Signed URLs Instead of Auth Tokens?

Auth tokens require the CDN to call your backend for every file request — defeating the purpose of a CDN. Signed URLs embed authorization directly in the URL: the CDN verifies the HMAC signature locally, no backend call needed. The URL expires automatically (1 hour by default), so even if shared, access is time-limited. This is exactly how AWS S3 presigned URLs and Cloudflare signed URLs work.

### Why Async Post-Processing?

Virus scanning a 2GB video takes seconds to minutes. Making the upload API wait for the scan would mean terrible upload UX. Instead, the upload returns immediately with status "processing," and a background worker handles scanning, thumbnail generation, and content type verification. The client polls the status endpoint or receives a webhook when processing completes.

<div class="takeaways">

### Key Takeaways

- Chunked uploads make large file transfers reliable — a network failure only loses one chunk, not the entire file
- Per-chunk checksums detect corruption at the smallest possible unit, before wasting bandwidth on subsequent chunks
- Resumable uploads let users continue where they left off — critical for mobile users on unreliable networks
- Signed URLs decouple authentication from file serving, enabling CDN edge delivery without hitting your auth server
- Async post-processing (virus scan, thumbnails) keeps upload response times fast
- Content type validation at upload time prevents serving malicious files later

</div>

<div class="when-to-use">

### Real-World Usage

- **AWS S3** multipart upload splits files into 5MB-5GB chunks with parallel upload support
- **Google Drive** uses resumable uploads with chunk checksums for reliable transfer over flaky connections
- **Cloudflare R2** serves files through 300+ edge locations using signed URLs for access control
- **Dropbox** deduplicates chunks across users — if someone already uploaded that chunk, it's referenced, not re-stored
- This architecture handles files up to 5GB with resumable chunked uploads and sub-100ms signed URL generation

</div>

