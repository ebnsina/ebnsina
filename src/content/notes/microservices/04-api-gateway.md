---
title: 'API Gateway'
subtitle: 'সব external traffic-এর entry point — routing, auth, rate limiting, request transformation, আর একটা gateway-এ কী রাখবেন না।'
chapter: 4
level: 'intermediate'
readingTime: '9 মিনিট'
topics:
  ['API gateway', 'nginx', 'Kong', 'routing', 'rate limiting', 'auth', 'request transformation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

শহরের বিশাল শপিং মলটার সামনে একটাই পাবলিক গেট, আর সেই গেটে বসানো একটা information-and-security ডেস্ক। প্রতিটা ক্রেতা — ইবনে সিনা হোক বা আল-খোয়ারিজমি — এই এক ডেস্ক দিয়েই ভেতরে ঢোকে, পাশের কোনো দরজা দিয়ে নয়। ডেস্কের দায়িত্বে ফাতিমা আল-ফিহরি। কেউ ঢুকলেই তিনি আগে তার মল-পাস দেখেন — পাস না থাকলে ভেতরে যাওয়া বন্ধ। পাস ঠিক থাকলে জিজ্ঞেস করেন, "কোন দোকান খুঁজছেন?" — জুতার দোকান তিনতলায়, বইয়ের দোকান বাঁ দিকে, খাবারের কোর্ট একদম শেষে — ঠিক দোকানটার দিকে তিনি ইশারা করে দেন।

ভেতরে কয়েকশো দোকান, কিন্তু ক্রেতাকে মনে রাখতে হয় না কোন দোকান কোথায়, কার ম্যানেজার কে। সে শুধু ডেস্কে গিয়ে নাম বলে, বাকিটা ফাতিমা সামলান। আবার কেউ যদি একই প্রশ্ন নিয়ে মিনিটে দশবার ডেস্কে এসে ভিড় বাড়ায়, ফাতিমা তাকে থামিয়ে দেন — "একটু দাঁড়ান, বারবার নয়" — যাতে ডেস্ক আর ভেতরের দোকানগুলো অযথা চাপে না পড়ে।

এই এক ডেস্কটাই হলো **API gateway**। মলের একমাত্র গেট মানে সব external request-এর single entry point; ভেতরের কয়েকশো দোকান হলো backend **microservice**; পাস দেখা হলো centralised **auth**; ঠিক দোকানে পাঠানো হলো **routing**; আর ঘনঘন-আসা লোককে থামানো হলো **rate limit** — কোনো দোকানকে আলাদা করে এসব সামলাতে হয় না। বাস্তবে nginx বা Kong ঠিক এই ডেস্কের কাজটাই করে: একটা door-এ auth, rate limit আর routing একজায়গায় রেখে দেয়, তাই client-কে কখনো জানতে হয় না ভেতরে কোন service কোথায় বসে আছে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন হোটেল concierge: প্রতিটা অতিথি (client) front desk দিয়ে ঢোকে। Concierge পরিচয় যাচাই করেন (auth), সঠিক বিভাগে পাঠান (routing), বিশেষ অনুরোধের ওপর সীমা রাখেন (rate limiting), আর প্রয়োজনগুলোকে হোটেলের internal ভাষায় অনুবাদ করেন (request transformation)। Staff floor অতিথিদের জন্য দুর্গম — concierge-ই একমাত্র ঢোকার পথ।

</Callout>

## একটা Gateway কী করে

একটা API gateway external client আর আপনার internal service-দের মাঝে বসে। বাইরের জগতের প্রতিটা request এর মধ্য দিয়ে যায়। Gateway cross-cutting concern গুলো সামলায় যাতে আলাদা আলাদা service-এর তা করতে না হয়:

- **Routing** — external path গুলোকে internal service address-এ map করা
- **Authentication** — request কোনো service-এ পৌঁছানোর আগে JWT বা API key যাচাই করা
- **Rate limiting** — service-দের অপব্যবহার থেকে রক্ষা করা
- **Request transformation** — header যোগ করা, protocol অনুবাদ করা, response থেকে sensitive data ছেঁটে ফেলা
- **SSL termination** — edge-এ TLS, internally plain HTTP

## Gateway হিসেবে nginx

ছোট setup-এর জন্য nginx সব gateway দায়িত্ব সামলায়:

```nginx
# /etc/nginx/conf.d/gateway.conf

# Rate limiting: 100 req/sec per IP
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;

# JWT auth via auth_request (delegates to auth service)
server {
    listen 443 ssl;
    server_name api.example.com;

    # Auth service handles validation
    location = /auth/verify {
        internal;
        proxy_pass http://auth-service:3000/verify;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-Original-URI $request_uri;
        proxy_set_header Authorization $http_authorization;
    }

    # Protected routes — auth required
    location /api/orders/ {
        auth_request /auth/verify;
        auth_request_set $user_id $upstream_http_x_user_id;

        limit_req zone=api_limit burst=20 nodelay;

        proxy_pass http://order-service:3000;
        proxy_set_header X-User-ID $user_id;   # pass verified user ID downstream
        proxy_set_header X-Forwarded-For $remote_addr;
    }

    # Public routes — no auth
    location /api/products/ {
        limit_req zone=api_limit burst=50 nodelay;
        proxy_pass http://product-service:3000;
    }

    # Health check — bypass auth
    location /health {
        proxy_pass http://order-service:3000/health;
    }
}
```

`auth_request` directive auth service-এ একটা subrequest পাঠায়। auth service যদি 2xx ফেরত দেয়, request চলতে থাকে। যদি 401/403 হয়, nginx সেটা client-কে ফেরত দেয়। auth service JWT থেকে user ID বের করে সেটা একটা response header হিসেবে ফেরত দেয়, যা nginx upstream-এ পাঠায়।

## Kong

Kong হলো ওপরে একটা plugin system সহ nginx। Plugin গুলো auth, rate limiting, transformation সামলায় — কোনো custom Lua scripting দরকার নেই।

```bash
# Docker setup
docker run -d --name kong \
  -e KONG_DATABASE=off \
  -e KONG_DECLARATIVE_CONFIG=/kong/declarative/kong.yml \
  -v $(pwd)/kong.yml:/kong/declarative/kong.yml \
  -p 8000:8000 \
  -p 8001:8001 \   # Admin API
  kong:latest
```

```yaml
# kong.yml (declarative config)
_format_version: '3.0'

services:
  - name: order-service
    url: http://order-service:3000
    routes:
      - name: orders-route
        paths:
          - /api/orders
        methods:
          - GET
          - POST
    plugins:
      - name: jwt
        config:
          secret_is_base64: false
          key_claim_name: kid
      - name: rate-limiting
        config:
          minute: 100
          policy: local
      - name: request-transformer
        config:
          add:
            headers:
              - 'X-Gateway-Version: 1.0'
          remove:
            headers:
              - 'X-Internal-Debug'

  - name: product-service
    url: http://product-service:3000
    routes:
      - name: products-route
        paths:
          - /api/products
```

Kong plugin গুলো প্রতিটা request-এ একটা chain হিসেবে চলে। প্রথমে auth, তারপর rate limiting, তারপর transformation। auth fail করলে chain থেমে যায় — rate limiting আর routing কখনো execute হয় না।

## Request/Response Transformation

Request গুলোকে service-এ পৌঁছানোর আগে, আর response গুলোকে client-এ পৌঁছানোর আগে transform করুন:

**Downstream-এ header যোগ করুন:**

```nginx
# After JWT verification, pass parsed claims as headers
proxy_set_header X-User-ID     $jwt_claim_sub;
proxy_set_header X-User-Email  $jwt_claim_email;
proxy_set_header X-User-Roles  $jwt_claim_roles;
```

Service গুলো header-এ pre-verified identity পায় — প্রতিটা service-এ কোনো JWT parsing নেই।

**Response থেকে sensitive data ছেঁটে ফেলুন (Kong plugin):**

```yaml
plugins:
  - name: response-transformer
    config:
      remove:
        json:
          - internal_id # never expose internal IDs externally
          - created_by_ip # strip internal tracking fields
```

**Protocol translation — REST থেকে gRPC:**
gRPC service গুলো সরাসরি browser থেকে callable নয়। একটা Envoy gateway বা `grpc-gateway` REST-কে gRPC-তে অনুবাদ করতে পারে:

```protobuf
// Add HTTP annotations to proto
import "google/api/annotations.proto";

service OrderService {
  rpc GetOrder(GetOrderRequest) returns (GetOrderResponse) {
    option (google.api.http) = {
      get: "/v1/orders/{order_id}"
    };
  }
}
```

```bash
# grpc-gateway generates a REST proxy from annotations
protoc --grpc-gateway_out=. order.proto
```

External client REST call করে; gateway internally gRPC-তে অনুবাদ করে।

## Gateway-এ কী রাখবেন না

Gateway একটা shared infrastructure। Gateway-এ business logic রাখা একটা ভুল:

```
✗ Pricing calculations in gateway plugins
✗ Order validation in the gateway
✗ Feature flags evaluated in the gateway
✓ Auth (is this request authenticated?)
✓ Rate limiting (is this client making too many requests?)
✓ Routing (which service handles this path?)
✓ Header stripping (remove internal fields from responses)
```

Gateway-এ business logic প্রতিটা service-কে এর release cycle-এর সাথে couple করে ফেলে। Pricing-এ একটা পরিবর্তনের জন্য service deploy-এর বদলে একটা gateway deploy লাগে।

## Versioning

দুটো সাধারণ pattern:

**Path versioning:**

```
/api/v1/orders → order-service v1
/api/v2/orders → order-service v2
```

সরল কিন্তু URL-এ version প্রকাশ করে দেয়। Version পরিবর্তনে client-কে URL update করতে হয়।

**Header versioning:**

```
GET /api/orders
Accept-Version: 2.0
```

পরিচ্ছন্ন URL। Gateway header-এর ভিত্তিতে route করে:

```nginx
location /api/orders {
    if ($http_accept_version = "2.0") {
        proxy_pass http://order-service-v2:3000;
        break;
    }
    proxy_pass http://order-service-v1:3000;
}
```

**বাস্তবে:** public API-র জন্য path versioning জেতে (document, test, আর share করা সহজ)। যেসব internal service-এ আপনি সব client নিয়ন্ত্রণ করেন, সেখানে header versioning।

## Gateway Resilience

Gateway একটা single point of failure। এটা প্রশমিত করুন:

```nginx
upstream order_service {
    server 10.0.0.10:3000;
    server 10.0.0.11:3000;
    keepalive 32;           # reuse connections
}

server {
    location /api/orders {
        proxy_pass http://order_service;

        # Retry on failure
        proxy_next_upstream error timeout http_503;
        proxy_next_upstream_tries 2;
        proxy_connect_timeout 3s;
        proxy_read_timeout 30s;
    }
}
```

একটা cloud load balancer-এর (AWS ALB বা NLB) পেছনে একাধিক gateway instance চালান। Gateway নিজে stateless হতে হবে — config file থেকে, কোনো in-memory state নেই।
