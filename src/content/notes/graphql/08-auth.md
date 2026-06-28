---
title: 'Authentication and authorization'
subtitle: 'Auth in GraphQL is the same as in REST — JWTs or sessions on HTTP, identity on context — except every field is its own little endpoint that needs an authorization check. Get the layering right or it will haunt you.'
chapter: 8
level: 'intermediate'
readingTime: '13 min'
topics: ['graphql', 'authentication', 'authorization', 'jwt', 'directives']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

GraphQL has no built-in `auth` keyword. There is no `requiresLogin: true` in SDL. Every approach you have seen — JWTs, session cookies, OAuth — works the same way as in REST. What changes is that GraphQL has many "endpoints" (every queryable field) and you must decide which require auth and which expose data.

This chapter goes from the network layer up to field-level authorization. The two halves are **authentication** (who is the caller?) and **authorization** (what may they do?). Different problems, different code.

<Callout type="info">

**Real-World Analogy**

GraphQL auth is like a keycard that opens different doors depending on your access level — the same credential, different permissions per resource.

</Callout>

## The shape of the solution

```
HTTP request                  → graphql-yoga
   ↓
Auth middleware reads token   → resolves to userId / null
   ↓
Build per-request context     → { userId, roles, db, loaders }
   ↓
Resolvers consult context     → check before reading or writing
```

Token verification happens **once per request**, before any resolver runs. Authorization happens **per field**, where the resolver knows the data and the user.

## Authentication — verifying the caller

Two common approaches in self-hosted backends.

**1. Session cookies.** A session ID stored server-side (Postgres or Redis), set as an HTTP-only cookie after login, looked up on every request. Best for first-party web clients — same-origin, automatic browser handling, easy to revoke server-side.

**2. JWTs (JSON Web Tokens).** A signed token containing claims (`userId`, `expiresAt`, `roles`). Stateless — server only verifies the signature, no DB lookup needed. Best for cross-origin, mobile, machine-to-machine.

Both end at the same place: a verified `userId`. From here on the rest of the chapter is identical.

A JWT-style middleware in graphql-yoga:

```js
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;

function getUserFromRequest(req) {
	const auth = req.headers.get('authorization');
	if (!auth?.startsWith('Bearer ')) return null;

	const token = auth.slice(7);
	try {
		const payload = jwt.verify(token, SECRET);
		return { id: payload.sub, roles: payload.roles || [] };
	} catch {
		return null;
	}
}

const yoga = createYoga({
	schema,
	context: ({ request }) => {
		const user = getUserFromRequest(request);
		return {
			db: pool,
			loaders: buildLoaders(pool),
			currentUser: user // null if anonymous
		};
	}
});
```

`currentUser` is now on context for every resolver. Anonymous users see `null`. Logged-in users see `{ id, roles }`.

## Login as a mutation

Login is just another mutation:

```graphql
type Mutation {
	login(email: String!, password: String!): AuthPayload!
}

type AuthPayload {
	token: String!
	user: User!
}
```

```js
login: async (_, { email, password }, ctx) => {
  const { rows } = await ctx.db.query(
    "SELECT id, password_hash FROM users WHERE email = $1",
    [email],
  );
  const user = rows[0];

  if (!user || !await bcrypt.compare(password, user.password_hash)) {
    throw new GraphQLError("Invalid credentials", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }

  const token = jwt.sign(
    { sub: String(user.id), roles: ["member"] },
    SECRET,
    { expiresIn: "7d" },
  );

  return { token, user };
},
```

For session-cookie flavors, set a cookie in the response instead of returning a token. graphql-yoga lets you mutate the response in plugins.

<Callout type="warn">

**Never echo bad-credentials reasons.** "Email not found" tells an attacker which emails are registered. "Invalid credentials" for both wrong-email and wrong-password is the only acceptable message. Same for password reset: "if an account exists, we sent an email" — never confirm or deny.

</Callout>

## Authorization — what may they do

Now the harder half. You have `ctx.currentUser`. Every resolver that reads or writes sensitive data needs a check. Three layers, increasing strictness.

### Layer 1: require-login at the resolver

The simplest check. If a query needs a logged-in user, fail loudly when there is none:

```js
function requireUser(ctx) {
  if (!ctx.currentUser) {
    throw new GraphQLError("Not authenticated", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return ctx.currentUser;
}

Mutation: {
  createPost: async (_, { input }, ctx) => {
    const user = requireUser(ctx);
    return ctx.db.query("INSERT INTO posts ...", [user.id, ...]);
  },
}
```

The naive version is one `requireUser` call at the top of each resolver that needs auth.

### Layer 2: check ownership and roles

Not every authenticated user can do every action. Check ownership at the data:

```js
deletePost: async (_, { id }, ctx) => {
  const user = requireUser(ctx);

  const { rows } = await ctx.db.query(
    "SELECT author_id FROM posts WHERE id = $1",
    [id],
  );
  const post = rows[0];

  if (!post) {
    throw new GraphQLError("Post not found", { extensions: { code: "NOT_FOUND" } });
  }

  if (String(post.author_id) !== user.id && !user.roles.includes("admin")) {
    throw new GraphQLError("Not allowed", { extensions: { code: "FORBIDDEN" } });
  }

  await ctx.db.query("DELETE FROM posts WHERE id = $1", [id]);
  return true;
},
```

**Order matters:** load → check existence → check authorization → act. Reversing leaks information ("you don't own this thing that may or may not exist").

### Layer 3: per-field authorization

Sometimes a field is sensitive even when the parent is not. `User.email` should be visible to the user themselves, admins, and maybe peers in the same org — not the public.

```js
User: {
  email: (user, _, ctx) => {
    const me = ctx.currentUser;
    if (!me) return null;
    if (me.id === String(user.id)) return user.email;
    if (me.roles.includes("admin")) return user.email;
    return null; // hide from peers
  },
}
```

Returning `null` for unauthorized access is gentle — clients can show "—" without crashing. Throwing an error is loud — but on a non-null field it nukes the parent (chapter 4). For sensitive fields, mark them nullable in the schema and return `null` on auth failure.

## Schema directives — auth as decoration

Repeating `requireUser` in every resolver is tedious and error-prone (one missed check is a bug). Schema directives make auth declarative.

```graphql
directive @auth(requires: Role = MEMBER) on FIELD_DEFINITION

enum Role {
	MEMBER
	ADMIN
}

type Mutation {
	createPost(input: CreatePostInput!): Post! @auth
	deletePost(id: ID!): Boolean! @auth
	banUser(id: ID!): Boolean! @auth(requires: ADMIN)
}

type Query {
	publicPosts: [Post!]! # no @auth — open
	myDrafts: [Post!]! @auth # logged-in only
}
```

A directive transformer (the `@graphql-tools/utils` utility `mapSchema` is the standard) wraps each annotated field's resolver:

```js
import { mapSchema, MapperKind, getDirective } from '@graphql-tools/utils';

function authDirectiveTransformer(schema) {
	return mapSchema(schema, {
		[MapperKind.OBJECT_FIELD]: (fieldConfig) => {
			const directive = getDirective(schema, fieldConfig, 'auth')?.[0];
			if (!directive) return;

			const { requires = 'MEMBER' } = directive;
			const original = fieldConfig.resolve;

			fieldConfig.resolve = (parent, args, ctx, info) => {
				if (!ctx.currentUser) {
					throw new GraphQLError('Not authenticated', {
						extensions: { code: 'UNAUTHENTICATED' }
					});
				}
				if (requires === 'ADMIN' && !ctx.currentUser.roles.includes('admin')) {
					throw new GraphQLError('Forbidden', {
						extensions: { code: 'FORBIDDEN' }
					});
				}
				return original?.(parent, args, ctx, info) ?? parent[fieldConfig.name];
			};

			return fieldConfig;
		}
	});
}
```

Now adding `@auth` to a field is the entire change. The transformer runs at boot — zero per-request overhead.

This pattern scales. Real production graphs add `@orgScoped`, `@featureFlag`, `@rateLimit` as directives, all transforming resolvers at boot.

## Alternative: graphql-shield

If you do not want to write transformers, `graphql-shield` is a permissions middleware library. You define a rules tree mapping fields to permissions:

```js
import { rule, shield, allow, and } from 'graphql-shield';

const isAuthenticated = rule()((p, a, ctx) => !!ctx.currentUser);
const isAdmin = rule()((p, a, ctx) => ctx.currentUser?.roles.includes('admin'));

const permissions = shield({
	Query: {
		publicPosts: allow,
		myDrafts: isAuthenticated
	},
	Mutation: {
		createPost: isAuthenticated,
		banUser: and(isAuthenticated, isAdmin)
	}
});
```

Apply as middleware on the schema. Same idea, different ergonomics.

## Auth and DataLoader — be careful

Loaders cache without consulting auth. If you `userLoader.load(42)` from one resolver that already authorized the request, then another resolver loads the same user — both get the row. That is correct behavior _for that request_, since auth was already checked once.

But: if your auth check is per-field (the email visibility example), do not put the auth check inside the loader. The loader returns the raw row. Resolvers that read sensitive fields off the row do their own auth.

## Multi-tenancy

If your app has organizations or workspaces, every query must be scoped to a tenant. Two ways:

**1. Pass orgId in arguments.** Every query takes `orgId: ID!`. Validates that `currentUser` is a member of that org.

**2. Implicit current org on context.** Login establishes a "current org," stored in the JWT or session. Every query is scoped to it.

The implicit version is cleaner for users (less boilerplate) but riskier (a missed scope check leaks data). I recommend the explicit version with an `@orgMember` directive that checks `args.orgId` against `ctx.currentUser.orgs`. Easy to audit; one directive on every field is a clear contract.

## Rate limiting

Auth and rate limiting are different problems but live next to each other. graphql-yoga has a `rate-limiter-flexible` plugin or you can write a directive:

```graphql
directive @rateLimit(window: String = "1m", max: Int = 60) on FIELD_DEFINITION

type Mutation {
	login(email: String!, password: String!): AuthPayload! @rateLimit(window: "1m", max: 5)
}
```

Throttle login by IP, expensive queries by user, public fields globally. Chapter 10 has more on production hardening.

## Recap

- Auth lives on HTTP. Verify token once in middleware, put `currentUser` on context.
- Login is a mutation that returns a token (or sets a cookie).
- Authorization is per resolver. Three layers: require-login, ownership/role, per-field.
- Order: load → check existence → check auth → act. Never leak existence.
- Schema directives (`@auth`, `@rateLimit`) move checks from imperative to declarative.
- Return `null` for hidden fields, throw for forbidden actions.
- Multi-tenancy: prefer explicit `orgId` arguments with a `@orgMember` directive.
- DataLoader does not enforce auth. Auth gates the resolver, the loader fetches data.

Next: [Subscriptions over WebSockets](/notes/graphql/09-subscriptions) — realtime done right, on graphql-ws.
