---
title: 'Authentication এবং authorization'
subtitle: 'GraphQL-এ auth মূলত REST-এর মতোই — HTTP-তে JWT বা session, context-এ identity — শুধু পার্থক্য এই যে প্রতিটি field নিজেই একটা ছোট endpoint যার authorization check দরকার। layering-টা ঠিকমতো করো, নাহলে এটা তোমাকে ভোগাবে।'
chapter: 8
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['graphql', 'authentication', 'authorization', 'jwt', 'directives']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

GraphQL-এ কোনো built-in `auth` keyword নেই। SDL-এ `requiresLogin: true` বলে কিছু নেই। তুমি যত approach দেখেছ — JWT, session cookie, OAuth — সব REST-এর মতোই কাজ করে। যা বদলায় তা হলো GraphQL-এ অনেক "endpoint" থাকে (প্রতিটি queryable field) এবং তোমাকে ঠিক করতে হয় কোনগুলোর auth লাগবে আর কোনগুলো data উন্মুক্ত রাখবে।

এই chapter network layer থেকে শুরু করে field-level authorization পর্যন্ত যায়। দুটো অংশ হলো **authentication** (caller কে?) এবং **authorization** (সে কী করতে পারবে?)। আলাদা সমস্যা, আলাদা code।

<Callout type="info">

**বাস্তব জীবনের উপমা**

GraphQL auth অনেকটা এমন একটা keycard-এর মতো যা তোমার access level অনুযায়ী ভিন্ন ভিন্ন দরজা খোলে — একই credential, resource-ভেদে ভিন্ন permission।

</Callout>

## গল্পে বুঝি

ফাতিমা আল-ফিহরি বাগদাদের এক পুরনো লাইব্রেরির দরজায় দাঁড়িয়ে আছেন। ভেতরে ঢোকার আগেই কার্ড দেখাতে হয় — পাবলিক ক্যাটালগ যে কেউ দেখতে পারে, কিন্তু কোনো বই হাতে নিতে হলে মেম্বার কার্ড লাগবে। দরজার প্রহরী আল-খোয়ারিজমি এক নজরে কার্ডটা যাচাই করে নিলেন: কে এই মানুষটা, তার কার্ডে কী কী ক্লিয়ারেন্স লেখা আছে। এই যাচাই একবারই হয়, ঢোকার মুখে। তারপর থেকে ফাতিমা কে, সেটা সবাই জানে।

ভেতরে একটাই বড় রিডিং রুম, কিন্তু সব তাক এক রকম নয়। সাধারণ তাকগুলো যেকোনো মেম্বারের জন্য খোলা — ফাতিমা যা খুশি নামিয়ে পড়তে পারেন। কিন্তু কোণের দুর্লভ পাণ্ডুলিপির তাকটা আলাদা। ফাতিমা ওখানে হাত বাড়াতেই লাইব্রেরিয়ান ইবনে সিনা আবার এসে কার্ডটা দেখলেন — শুধু মেম্বার হলেই হবে না, এই তাকের জন্য বিশেষ ক্লিয়ারেন্স চাই। একই রুম, একই মানুষ, কিন্তু প্রতিটা তাকে ইবনে সিনা আলাদা করে অনুমতি মিলিয়ে দেখেন।

এই দরজায় কার্ড দেখানোটাই হলো **authentication** — request আসার মুহূর্তে token যাচাই করে `currentUser` বানিয়ে context-এ রেখে দেওয়া, একবারই। আর প্রতিটা তাকে ইবনে সিনার আলাদা ক্লিয়ারেন্স-চেকটাই হলো resolver-এ enforce করা **authorization** — দরজা পার হওয়া মানেই সব field খোলা নয়। দুর্লভ তাক বনাম খোলা তাক একই রুমে থাকাটাই GraphQL-এর **per-field authorization**: একই type-এর দুটো field ভিন্ন permission চাইতে পারে, যেমন `User.email` মালিক বা admin দেখবে কিন্তু বাকিরা `null`। বাস্তবে ঠিক এভাবেই কাজ করে — context authentication ধরে রাখে, আর প্রতিটা field-এর resolver নিজের authorization নিজে যাচাই করে, একটা global gate সব সামলায় না।

## সমাধানের রূপরেখা

```
HTTP request                  → graphql-yoga
   ↓
Auth middleware reads token   → resolves to userId / null
   ↓
Build per-request context     → { userId, roles, db, loaders }
   ↓
Resolvers consult context     → check before reading or writing
```

Token verification হয় **প্রতি request-এ একবার**, কোনো resolver চলার আগে। Authorization হয় **প্রতি field-এ**, যেখানে resolver data আর user দুটোই জানে।

## Authentication — caller যাচাই করা

self-hosted backend-এ দুটো common approach।

**1. Session cookies.** server-side (Postgres বা Redis) সংরক্ষিত একটা session ID, login-এর পর HTTP-only cookie হিসেবে সেট হয়, প্রতি request-এ lookup হয়। first-party web client-এর জন্য সেরা — same-origin, browser নিজেই handle করে, server-side থেকে revoke করা সহজ।

**2. JWTs (JSON Web Tokens).** claim (`userId`, `expiresAt`, `roles`) ধারণ করা একটা signed token। Stateless — server শুধু signature verify করে, কোনো DB lookup লাগে না। cross-origin, mobile, machine-to-machine-এর জন্য সেরা।

দুটোই একই জায়গায় শেষ হয়: একটা verified `userId`। এখান থেকে chapter-এর বাকিটা একদম অভিন্ন।

graphql-yoga-তে একটা JWT-style middleware:

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

`currentUser` এখন প্রতিটি resolver-এর জন্য context-এ আছে। Anonymous user-রা `null` দেখে। Logged-in user-রা `{ id, roles }` দেখে।

## Login একটা mutation হিসেবে

Login আসলে আরেকটা mutation মাত্র:

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

session-cookie ধরনের flow-এর জন্য token return করার বদলে response-এ একটা cookie সেট করো। graphql-yoga তোমাকে plugin-এ response mutate করতে দেয়।

<Callout type="warn">

**bad-credentials-এর কারণ কখনো ফাঁস কোরো না।** "Email not found" একজন attacker-কে বলে দেয় কোন email-গুলো registered। wrong-email আর wrong-password দুটোর জন্যই "Invalid credentials" — এটাই একমাত্র গ্রহণযোগ্য message। password reset-এও একই: "if an account exists, we sent an email" — কখনো নিশ্চিত বা অস্বীকার কোরো না।

</Callout>

## Authorization — সে কী করতে পারবে

এবার কঠিন অর্ধেকটা। তোমার কাছে `ctx.currentUser` আছে। sensitive data read বা write করা প্রতিটি resolver-এর একটা check দরকার। তিনটা layer, ক্রমশ বাড়ছে কড়াকড়ি।

### Layer 1: resolver-এ require-login

সবচেয়ে সহজ check। যদি কোনো query-র logged-in user দরকার হয়, না থাকলে জোরালোভাবে fail করাও:

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

সবচেয়ে সরল version হলো auth লাগে এমন প্রতিটি resolver-এর শুরুতে একটা `requireUser` call।

### Layer 2: ownership আর role check করা

প্রতিটি authenticated user প্রতিটি action করতে পারে না। data-র কাছে গিয়ে ownership check করো:

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

**ক্রম গুরুত্বপূর্ণ:** load → existence check → authorization check → act। উল্টো করলে information ফাঁস হয় ("তুমি এই জিনিসটার মালিক নও যেটা থাকতে পারে বা নাও থাকতে পারে")।

### Layer 3: per-field authorization

কখনো কখনো parent sensitive না হলেও একটা field sensitive হয়। `User.email` user নিজে, admin, আর হয়তো একই org-এর peer-দের দেখা উচিত — public-কে নয়।

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

unauthorized access-এর জন্য `null` return করা নরম উপায় — client crash না করেই "—" দেখাতে পারে। error throw করা জোরালো — কিন্তু non-null field-এ এটা parent-কে ধ্বংস করে (chapter 4)। sensitive field-গুলোর জন্য schema-তে nullable করো এবং auth failure-এ `null` return করো।

## Schema directives — auth সাজসজ্জা হিসেবে

প্রতিটি resolver-এ `requireUser` পুনরাবৃত্তি করা ক্লান্তিকর এবং ভুল হওয়ার ঝুঁকিপূর্ণ (একটা check বাদ পড়লেই bug)। Schema directive auth-কে declarative করে তোলে।

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

একটা directive transformer (`@graphql-tools/utils`-এর `mapSchema` utility-টাই standard) প্রতিটি annotated field-এর resolver-কে wrap করে:

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

এখন একটা field-এ `@auth` যোগ করাই পুরো পরিবর্তন। transformer boot-এ চলে — per-request কোনো overhead নেই।

এই pattern scale করে। বাস্তব production graph-গুলো `@orgScoped`, `@featureFlag`, `@rateLimit` directive হিসেবে যোগ করে, সবকটাই boot-এ resolver transform করে।

## বিকল্প: graphql-shield

তুমি যদি transformer লিখতে না চাও, `graphql-shield` একটা permissions middleware library। তুমি field-কে permission-এ map করা একটা rules tree define করো:

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

schema-তে middleware হিসেবে apply করো। একই ধারণা, ভিন্ন ergonomics।

## Auth আর DataLoader — সাবধান

Loader auth-কে না জিজ্ঞেস করেই cache করে। যদি তুমি একটা resolver থেকে `userLoader.load(42)` করো যেটা ইতিমধ্যে request-কে authorize করেছে, তারপর আরেকটা resolver একই user load করে — দুটোই row পায়। এটা _ওই request-এর জন্য_ সঠিক আচরণ, কারণ auth ইতিমধ্যে একবার check হয়ে গেছে।

কিন্তু: যদি তোমার auth check per-field হয় (email visibility-র উদাহরণ), auth check-টা loader-এর ভেতরে রেখো না। loader raw row return করে। row থেকে sensitive field পড়া resolver-গুলো নিজেদের auth নিজেরা করে।

## Multi-tenancy

তোমার app-এ যদি organization বা workspace থাকে, প্রতিটি query একটা tenant-এ scoped হতে হবে। দুই উপায়:

**1. argument-এ orgId পাস করা।** প্রতিটি query `orgId: ID!` নেয়। যাচাই করে যে `currentUser` ওই org-এর member।

**2. context-এ implicit current org।** Login একটা "current org" প্রতিষ্ঠা করে, JWT বা session-এ সংরক্ষিত। প্রতিটি query তাতে scoped।

implicit version user-দের জন্য পরিচ্ছন্ন (কম boilerplate) কিন্তু ঝুঁকিপূর্ণ (একটা scope check বাদ পড়লেই data ফাঁস)। আমি explicit version-এর পরামর্শ দিই, একটা `@orgMember` directive দিয়ে যা `args.orgId`-কে `ctx.currentUser.orgs`-এর সাথে মিলিয়ে দেখে। audit করা সহজ; প্রতিটি field-এ একটা directive একটা স্পষ্ট contract।

## Rate limiting

Auth আর rate limiting আলাদা সমস্যা কিন্তু পাশাপাশি থাকে। graphql-yoga-তে একটা `rate-limiter-flexible` plugin আছে বা তুমি একটা directive লিখতে পারো:

```graphql
directive @rateLimit(window: String = "1m", max: Int = 60) on FIELD_DEFINITION

type Mutation {
	login(email: String!, password: String!): AuthPayload! @rateLimit(window: "1m", max: 5)
}
```

login IP অনুযায়ী throttle করো, expensive query user অনুযায়ী, public field globally। production hardening নিয়ে আরও আছে chapter 10-তে।

## সারসংক্ষেপ

- Auth থাকে HTTP-তে। middleware-এ token একবার verify করো, context-এ `currentUser` রাখো।
- Login একটা mutation যা token return করে (বা cookie সেট করে)।
- Authorization per resolver। তিনটা layer: require-login, ownership/role, per-field।
- ক্রম: load → existence check → auth check → act। কখনো existence ফাঁস কোরো না।
- Schema directive (`@auth`, `@rateLimit`) check-কে imperative থেকে declarative-এ নিয়ে যায়।
- hidden field-এর জন্য `null` return করো, forbidden action-এর জন্য throw করো।
- Multi-tenancy: একটা `@orgMember` directive সহ explicit `orgId` argument-কে অগ্রাধিকার দাও।
- DataLoader auth enforce করে না। Auth resolver-কে gate করে, loader data fetch করে।

পরবর্তী: [Subscriptions over WebSockets](/notes/graphql/09-subscriptions) — realtime ঠিকভাবে, graphql-ws-এ।
