---
title: 'API Gateway'
subtitle: 'The entry point for all external traffic — routing, auth, rate limiting, request transformation, and what not to put in a gateway.'
chapter: 4
level: 'intermediate'
readingTime: '9 min'
topics:
  ['API gateway', 'nginx', 'Kong', 'routing', 'rate limiting', 'auth', 'request transformation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A hotel concierge: every guest (client) enters through the front desk. The concierge verifies identity (auth), directs to the right department (routing), has limits on special requests (rate limiting), and translates needs into the hotel's internal language (request transformation). Staff floors are inaccessible to guests — the concierge is the only way in.

</Callout>

## What a Gateway Does

An API gateway sits between external clients and your internal services. Every request from the outside world passes through it. The gateway handles cross-cutting concerns so individual services don't have to:

- **Routing** — map external paths to internal service addresses
- **Authentication** — verify JWT or API key before the request reaches any service
- **Rate limiting** — protect services from abuse
- **Request transformation** — add headers, translate protocols, strip sensitive data from responses
- **SSL termination** — TLS at the edge, plain HTTP internally

## nginx as a Gateway

For smaller setups, nginx handles all gateway responsibilities:

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

The `auth_request` directive sends a subrequest to the auth service. If auth service returns 2xx, the request continues. If 401/403, nginx returns that to the client. The auth service extracts the user ID from the JWT and returns it as a response header, which nginx passes upstream.

## Kong

Kong is nginx with a plugin system on top. Plugins handle auth, rate limiting, transformations — no custom Lua scripting required.

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

Kong plugins run as a chain on every request. Auth first, then rate limiting, then transformation. If auth fails, the chain stops — rate limiting and routing never execute.

## Request/Response Transformation

Transform requests before they reach services, and responses before they reach clients:

**Add headers downstream:**

```nginx
# After JWT verification, pass parsed claims as headers
proxy_set_header X-User-ID     $jwt_claim_sub;
proxy_set_header X-User-Email  $jwt_claim_email;
proxy_set_header X-User-Roles  $jwt_claim_roles;
```

Services receive pre-verified identity in headers — no JWT parsing in every service.

**Strip sensitive data from responses (Kong plugin):**

```yaml
plugins:
  - name: response-transformer
    config:
      remove:
        json:
          - internal_id # never expose internal IDs externally
          - created_by_ip # strip internal tracking fields
```

**Protocol translation — REST to gRPC:**
gRPC services aren't directly callable from browsers. An Envoy gateway or `grpc-gateway` can translate REST to gRPC:

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

External clients call REST; the gateway translates to gRPC internally.

## What Not to Put in the Gateway

The gateway is a shared piece of infrastructure. Business logic in the gateway is a mistake:

```
✗ Pricing calculations in gateway plugins
✗ Order validation in the gateway
✗ Feature flags evaluated in the gateway
✓ Auth (is this request authenticated?)
✓ Rate limiting (is this client making too many requests?)
✓ Routing (which service handles this path?)
✓ Header stripping (remove internal fields from responses)
```

Business logic in the gateway couples every service to its release cycle. A change to pricing requires a gateway deploy instead of a service deploy.

## Versioning

Two common patterns:

**Path versioning:**

```
/api/v1/orders → order-service v1
/api/v2/orders → order-service v2
```

Simple but exposes versions in URLs. Clients must update URLs on version change.

**Header versioning:**

```
GET /api/orders
Accept-Version: 2.0
```

Cleaner URLs. The gateway routes based on header:

```nginx
location /api/orders {
    if ($http_accept_version = "2.0") {
        proxy_pass http://order-service-v2:3000;
        break;
    }
    proxy_pass http://order-service-v1:3000;
}
```

**In practice:** path versioning wins for public APIs (easier to document, test, and share). Header versioning for internal services where you control all clients.

## Gateway Resilience

The gateway is a single point of failure. Mitigate:

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

Run multiple gateway instances behind a cloud load balancer (AWS ALB or NLB). The gateway itself must be stateless — config from files, no in-memory state.
