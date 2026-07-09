---
title: 'Request & Response Transformation'
subtitle: 'Header manipulation, payload reshaping, protocol translation — client যা পাঠায় তা backend যা আশা করে তার সাথে মানিয়ে নেওয়া।'
chapter: 5
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['transformation', 'headers', 'payload', 'versioning', 'protocol translation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা কূটনৈতিক মিটিংয়ের অনুবাদক — দুই পক্ষই নিজের ভাষায় সাবলীলভাবে কথা বলে, অনুবাদক রিয়েল টাইমে তাদের মধ্যে রূপান্তর করে দেয়। কোনো পক্ষই নিজের কাজের ধরন বদলায় না; মাঝের স্তরটাই রূপান্তর সামলায়।

</Callout>

## Header Manipulation

সবচেয়ে সাধারণ transformation। forward করার আগে header যোগ, বাদ, বা নাম বদল করা:

```nginx
location /api/ {
    proxy_pass http://notes;

    # Add headers to backend request
    proxy_set_header X-Request-ID   $request_id;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP       $remote_addr;

    # Remove headers from client request before forwarding
    proxy_set_header Authorization "";  # backend doesn't need raw JWT

    # Remove headers from backend response before returning to client
    proxy_hide_header X-Powered-By;
    proxy_hide_header Server;

    # Add headers to the response
    add_header X-Gateway-Version "1.0";
    add_header Strict-Transport-Security "max-age=31536000";
}
```

**Node.js middleware-এ:**

```typescript
function transformRequest(req: Request, _res: Response, next: NextFunction): void {
	// Enrich with request ID for distributed tracing
	req.headers['x-request-id'] = req.headers['x-request-id'] ?? crypto.randomUUID();
	req.headers['x-forwarded-for'] = req.socket.remoteAddress;

	// Strip sensitive client headers
	delete req.headers['authorization']; // replaced by x-user-id from auth middleware
	delete req.headers['cookie']; // don't forward cookies to APIs

	next();
}

function transformResponse(req: Request, res: Response, next: NextFunction): void {
	// Remove internal headers from response
	res.on('finish', () => {
		res.removeHeader('x-powered-by');
		res.removeHeader('x-internal-service');
	});
	next();
}
```

## Path Rewriting

external path-কে internal path-এ ম্যাপ করা। client পরিষ্কার URL ব্যবহার করে; backend যা খুশি ব্যবহার করে:

```nginx
# Strip /api/v1 prefix before forwarding
location /api/v1/users/ {
    rewrite ^/api/v1/(.*)$ /$1 break;
    proxy_pass http://user-service;
}
# GET /api/v1/users/123 → GET /users/123 on user-service
```

```typescript
// In Express gateway
app.use('/api/v1/users', (req, res, next) => {
	// Rewrite path: /api/v1/users/123 → /123
	req.url = req.url.replace(/^\/api\/v1\/users/, '');
	proxy.web(req, res, { target: 'http://user-service:3001' });
});
```

## Payload Transformation

request বা response body নতুন করে সাজানো। API version migrate করার সময় বা অমিল schema-র third-party service integrate করার সময় কাজে লাগে:

```typescript
// v1 clients send snake_case; new backend expects camelCase
function transformV1Request(body: Record<string, unknown>): Record<string, unknown> {
	return {
		userId: body.user_id,
		firstName: body.first_name,
		lastName: body.last_name,
		emailAddr: body.email_address
	};
}

// Middleware that transforms request body
app.use('/api/v1/', async (req, res, next) => {
	if (req.method !== 'GET' && req.body) {
		req.body = transformV1Request(req.body);
	}
	next();
});
```

**Response transformation** — client-এ ফেরত দেওয়ার আগে backend response মানিয়ে নেওয়া:

```typescript
function transformUserResponse(backendResponse: BackendUser): ClientUser {
	return {
		id: backendResponse.userId,
		first_name: backendResponse.firstName, // client expects snake_case
		last_name: backendResponse.lastName,
		email: backendResponse.emailAddr
		// Strip internal fields
		// (no: internalFlags, createdBySystem, etc.)
	};
}
```

## Gateway-তে API Versioning

সার্ভিসে পুরনো code না রেখেই পুরনো API version চালু রাখা:

```typescript
// Route v1 and v2 to different backends
const versionRoutes = {
	v1: 'http://api-v1:3000',
	v2: 'http://api-v2:3000'
};

// Version from URL: /api/v1/users
app.use('/api/:version/*', (req, res) => {
	const version = req.params.version;
	const target = versionRoutes[version];

	if (!target) {
		return res.status(404).json({ error: `API version ${version} not found` });
	}

	proxy.web(req, res, { target });
});

// Version from header: X-API-Version: 2
app.use('/api/', (req, res) => {
	const version = req.headers['x-api-version'] ?? 'v1';
	proxy.web(req, res, { target: versionRoutes[version] });
});
```

**Deprecation notice:**

```typescript
function addDeprecationHeaders(req: Request, res: Response, next: NextFunction): void {
	if (req.path.startsWith('/api/v1')) {
		res.set('Deprecation', 'true');
		res.set('Sunset', 'Sat, 31 Dec 2026 23:59:59 GMT');
		res.set('Link', '</api/v2>; rel="successor-version"');
	}
	next();
}
```

## Protocol Translation

gateway-তে protocol-এর মধ্যে রূপান্তর করা — client REST বলে, backend gRPC বলে:

```typescript
import * as grpc from '@grpc/grpc-js';

// Gateway translates REST → gRPC
app.get('/api/users/:id', async (req, res) => {
	const client = new UserServiceClient('user-service:50051', grpc.credentials.createInsecure());

	// REST request → gRPC call
	client.getUser({ userId: req.params.id }, (err, response) => {
		if (err) {
			return res.status(503).json({ error: 'Service unavailable' });
		}

		// gRPC response → REST JSON response
		res.json({
			id: response.userId,
			name: response.name,
			email: response.email
		});
	});
});
```

এতে আপনি client-দের REST ব্যবহার চালু রাখতে দিয়ে backend-গুলোকে ধাপে ধাপে gRPC-তে migrate করতে পারেন।

## Kong Transformation Plugin

```yaml
plugins:
  # Add/remove/rename headers
  - name: request-transformer
    config:
      add:
        headers:
          - 'x-request-source:gateway'
      remove:
        headers:
          - authorization
      rename:
        headers:
          - 'x-custom-id:x-user-id'

  # Rewrite path
  - name: request-transformer
    config:
      replace:
        uri: '/$(uri_captures.version)/$(uri_captures.path)'

  # Response transformation
  - name: response-transformer
    config:
      remove:
        headers:
          - x-powered-by
          - server
```
