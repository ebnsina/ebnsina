---
title: 'GraphQL'
subtitle: 'GraphQL দিয়ে ঠিক যতটুকু ডেটা দরকার ততটুকুই query করুন — schema, query, mutation, subscription, আর N+1 সমস্যার সমাধান।'
chapter: 6
level: 'intermediate'
readingTime: '15 মিনিট'
topics: ['GraphQL', 'schema design', 'queries', 'mutations', 'subscriptions', 'N+1 problem']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

খোয়ারিজমি নতুন শহরে এসে দুপুরে খেতে ঢুকল এক ভাতের হোটেলে। সেখানে বাঁধা থালি — একদাম, প্লেটে যা আসার তা-ই আসে: ভাত, ডাল, একটা মাছ, একটা সবজি, সালাদ। খোয়ারিজমি মাছ খায় না, কিন্তু থালিতে মাছ আসবেই, সেটা প্লেটে পড়েই থাকে — এই যে না-চাওয়া জিনিস জোর করে চলে আসা, এটাই over-fetching। আবার ওর ডাল বেশি লাগে, কিন্তু থালিতে এক বাটির বেশি নেই। বাড়তি ডালের জন্য ওকে আবার ওয়েটার ডাকতে হয়, আবার অর্ডার দিতে হয়, আরেকবার রান্নাঘর ঘুরে জিনিস আসে — একটা প্লেট পূরণ করতে বারবার ট্রিপ, এটাই under-fetching।

পাশেই আরেকটা দোকান, কাস্টম টিফিন কাউন্টার। সামনে বড় বোর্ডে লেখা কী কী পাওয়া যায় — ভাত, তিন রকম ডাল, মুরগি, ডিম, পাঁচ রকম সবজি। খোয়ারিজমি একটাই লিস্ট বলে দেয়: "দুই স্কুপ ভাত, ডাবল ডাল, মুরগি এক পিস, মাছ লাগবে না।" এক ফরমায়েশেই ঠিক ততটুকু, ঠিক সেই আইটেমগুলোই প্লেটে আসে — বেশিও না, কমও না, বাড়তি ট্রিপও নেই।

এই কাস্টম কাউন্টারটাই GraphQL। আপনি এক query-তেই ঠিক যে field গুলো চান তার লিস্ট পাঠান, আর server ঠিক ততটুকুই ফেরত দেয় — না-চাওয়া field আসে না (over-fetching নেই), আর নেস্টেড ডেটাও এক request-এই পাওয়া যায় বলে বারবার ঘুরতে হয় না (under-fetching নেই)। সামনের সেই বোর্ড, মানে কী কী চাওয়া যাবে তার তালিকা, সেটাই schema। আর পুরো ব্যাপারটা চলে একটাই কাউন্টারে — GraphQL-এ একটাই endpoint, প্রতি জিনিসের আলাদা লাইন নেই। এর উল্টোদিকে বাঁধা থালি হলো REST: প্রতিটা endpoint একটা fixed response দেয়, চান বা না-চান পুরো প্লেটই আসে। বাস্তবে মোবাইল অ্যাপ যখন শুধু ইউজারের নাম আর ছবি দেখাবে, GitHub বা Shopify-র মতো GraphQL API-তে সে ঠিক ওই দুটো field-ই query করে — বাকি ভারী ডেটা নেটওয়ার্কে টেনে আনে না।

## GraphQL কী?

GraphQL হলো API-এর জন্য একটি query language, যা Facebook ২০১২ সালে তৈরি করে (২০১৫-তে open-source করা হয়)। REST-এ যেখানে প্রতিটি endpoint একটি fixed স্ট্রাকচার রিটার্ন করে, GraphQL-এ সেখানে client ঠিক যে ফিল্ডগুলো দরকার সেগুলোই চাইতে পারে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা made-to-order সালাদ বার-এ অর্ডার করার মতো — আগে থেকে বানানো সালাদ বেছে নেওয়ার বদলে আপনি ঠিক কোন উপকরণগুলো চান তা বেছে নেন। ঠিক যা চেয়েছেন তা-ই পান, বেশিও না, কমও না।

</Callout>

## Schema Definition

GraphQL-এ সবকিছু শুরু হয় schema দিয়ে। এটা আপনার ডেটা টাইপ আর উপলব্ধ operation সংজ্ঞায়িত করে।

```typescript
// schema.graphql
type User {
  id: ID!
  firstName: String!
  lastName: String!
  email: String!
  role: Role!
  posts: [Post!]!
  createdAt: DateTime!
}

type Post {
  id: ID!
  title: String!
  body: String!
  author: User!
  comments: [Comment!]!
  tags: [String!]!
  publishedAt: DateTime
  createdAt: DateTime!
}

type Comment {
  id: ID!
  body: String!
  author: User!
  post: Post!
  createdAt: DateTime!
}

enum Role {
  USER
  ADMIN
  MODERATOR
}

scalar DateTime
```

### Root Type

```typescript
type Query {
  # Single resource
  user(id: ID!): User
  post(id: ID!): Post

  # Collections with filtering
  users(
    limit: Int = 20
    offset: Int = 0
    role: Role
    search: String
  ): UserConnection!

  posts(
    limit: Int = 20
    after: String
    authorId: ID
    tag: String
  ): PostConnection!
}

type Mutation {
  createUser(input: CreateUserInput!): User!
  updateUser(id: ID!, input: UpdateUserInput!): User!
  deleteUser(id: ID!): Boolean!

  createPost(input: CreatePostInput!): Post!
  publishPost(id: ID!): Post!
}

type Subscription {
  postPublished: Post!
  commentAdded(postId: ID!): Comment!
}

# Connection types for pagination
type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type UserEdge {
  node: User!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

## Query

client ঠিক যে ফিল্ডগুলো দরকার সেগুলোই query করে:

```typescript
// Minimal query — only name and email
query {
  user(id: "42") {
    firstName
    lastName
    email
  }
}

// Response
{
  "data": {
    "user": {
      "firstName": "Rahim",
      "lastName": "Ahmed",
      "email": "rahim@example.com"
    }
  }
}

// Nested query — user with their posts and comments
query {
  user(id: "42") {
    firstName
    posts {
      title
      publishedAt
      comments {
        body
        author {
          firstName
        }
      }
    }
  }
}

// Query with variables (recommended)
query GetUser($userId: ID!) {
  user(id: $userId) {
    firstName
    lastName
    email
    role
  }
}
// Variables: { "userId": "42" }
```

### Server-Side Resolver

```typescript
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

const resolvers = {
	Query: {
		user: async (_parent: unknown, args: { id: string }, context: Context) => {
			return context.db.users.findById(args.id);
		},

		users: async (_parent: unknown, args: { limit: number; offset: number; role?: string }) => {
			const filter: Record<string, unknown> = {};
			if (args.role) filter.role = args.role;

			const [users, totalCount] = await Promise.all([
				db.users.find(filter).skip(args.offset).limit(args.limit),
				db.users.count(filter)
			]);

			return {
				edges: users.map((user) => ({
					node: user,
					cursor: encodeCursor(user.id)
				})),
				pageInfo: {
					hasNextPage: args.offset + args.limit < totalCount,
					hasPreviousPage: args.offset > 0
				},
				totalCount
			};
		}
	},

	User: {
		// Field-level resolver — only runs if posts are requested
		posts: async (parent: User, _args: unknown, context: Context) => {
			return context.db.posts.find({ authorId: parent.id });
		}
	},

	Post: {
		author: async (parent: Post, _args: unknown, context: Context) => {
			return context.db.users.findById(parent.authorId);
		},
		comments: async (parent: Post, _args: unknown, context: Context) => {
			return context.db.comments.find({ postId: parent.id });
		}
	}
};

const server = new ApolloServer({ typeDefs, resolvers });
const { url } = await startStandaloneServer(server, { listen: { port: 4000 } });
```

## Mutation

Mutation ডেটা পরিবর্তন করে। জটিল argument-এর জন্য সবসময় input type ব্যবহার করুন:

```typescript
// Input types
input CreatePostInput {
  title: String!
  body: String!
  tags: [String!]
}

input UpdatePostInput {
  title: String
  body: String
  tags: [String!]
}

// Client mutation
mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    id
    title
    createdAt
  }
}
// Variables: { "input": { "title": "GraphQL Guide", "body": "...", "tags": ["graphql", "api"] } }
```

```typescript
// Server resolver
const resolvers = {
	Mutation: {
		createPost: async (_parent: unknown, args: { input: CreatePostInput }, context: Context) => {
			if (!context.user) {
				throw new GraphQLError('Not authenticated', {
					extensions: { code: 'UNAUTHENTICATED' }
				});
			}

			const post = await context.db.posts.create({
				...args.input,
				authorId: context.user.id,
				createdAt: new Date()
			});

			return post;
		},

		publishPost: async (_parent: unknown, args: { id: string }, context: Context) => {
			const post = await context.db.posts.findById(args.id);
			if (!post) {
				throw new GraphQLError('Post not found', {
					extensions: { code: 'NOT_FOUND' }
				});
			}

			if (post.authorId !== context.user.id && context.user.role !== 'ADMIN') {
				throw new GraphQLError('Not authorized', {
					extensions: { code: 'FORBIDDEN' }
				});
			}

			post.publishedAt = new Date();
			await post.save();

			// Notify subscribers
			pubsub.publish('POST_PUBLISHED', { postPublished: post });
			return post;
		}
	}
};
```

## Subscription

WebSocket-এর ওপর real-time আপডেট:

```typescript
import { PubSub } from 'graphql-subscriptions';
const pubsub = new PubSub();

const resolvers = {
	Subscription: {
		postPublished: {
			subscribe: () => pubsub.asyncIterableIterator(['POST_PUBLISHED'])
		},
		commentAdded: {
			subscribe: (_parent: unknown, args: { postId: string }) => {
				return pubsub.asyncIterableIterator([`COMMENT_ADDED_${args.postId}`]);
			}
		}
	}
};

// Client subscription
// subscription {
//   postPublished {
//     id
//     title
//     author { firstName }
//   }
// }
```

## N+1 সমস্যা

GraphQL-এ সবচেয়ে প্রচলিত performance ফাঁদ:

```typescript
// This query triggers N+1 database calls:
query {
  posts(limit: 20) {
    edges {
      node {
        title
        author {       // 1 query per post = 20 extra queries!
          firstName
        }
      }
    }
  }
}

// 1 query to get 20 posts
// + 20 queries to get each post's author
// = 21 queries total (the "N+1" problem)
```

### সমাধান: DataLoader

DataLoader একাধিক আলাদা load-কে একটি single query-তে batch করে:

```typescript
import DataLoader from 'dataloader';

// Create a loader that batches user lookups
function createLoaders() {
	return {
		userLoader: new DataLoader<string, User>(async (userIds) => {
			// Single query for all user IDs
			const users = await db.users.find({ _id: { $in: userIds } });
			const userMap = new Map(users.map((u) => [u.id, u]));

			// Return in same order as input IDs
			return userIds.map((id) => userMap.get(id) || null);
		})
	};
}

// Attach loaders to context (new instance per request)
const server = new ApolloServer({ typeDefs, resolvers });
await startStandaloneServer(server, {
	context: async ({ req }) => ({
		user: await getUser(req),
		db,
		loaders: createLoaders() // Fresh per request
	})
});

// Use loader in resolver
const resolvers = {
	Post: {
		author: (parent: Post, _args: unknown, context: Context) => {
			// This batches! 20 posts = 1 query instead of 20
			return context.loaders.userLoader.load(parent.authorId);
		}
	}
};
```

<Callout type="warning">

**DataLoader-এর নিয়ম**

- **প্রতি request-এ একটি নতুন DataLoader instance তৈরি করুন** — এরা একটি request-এর মধ্যেই cache করে
- batch function-কে input key-এর **একই order-এ** রেজাল্ট রিটার্ন করতে হবে
- না-থাকা entity সবসময় সামলান (অজানা ID-এর জন্য `null` রিটার্ন করুন)
- DataLoader শুধু ID দিয়ে batch করার জন্য কাজ করে — জটিল query-এর জন্য আলাদা strategy দরকার

</Callout>

## GraphQL বনাম REST

| বৈশিষ্ট্য      | REST                   | GraphQL                   |
| -------------- | ---------------------- | ------------------------- |
| ডেটা fetching  | প্রতি endpoint-এ fixed | client নির্ধারণ করে       |
| Over-fetching  | প্রচলিত                | দূর হয়ে যায়             |
| Under-fetching | একাধিক request লাগে    | একটি request              |
| Caching        | HTTP caching বিল্ট-ইন  | custom caching দরকার      |
| File upload    | Native                 | workaround দরকার          |
| Error handling | HTTP status code       | সবসময় 200, error body-তে |
| শেখার বক্ররেখা | কম                     | মাঝারি                    |
| Tooling        | পরিপক্ব                | বাড়ছে                    |

<Callout type="tip">

**কখন GraphQL ব্যবহার করবেন**

- একাধিক client-এর আলাদা আলাদা ডেটা শেপ দরকার (mobile বনাম web)
- আপনার UI-তে একটি request-এ গভীরভাবে nested, সম্পর্কিত ডেটা দরকার
- প্রতিটি view-এর জন্য একবার-ব্যবহারযোগ্য REST endpoint বানাতে বানাতে ক্লান্ত

**কখন REST-এই থাকবেন**

- সাধারণ CRUD API
- file upload/download-ভারী API
- অতিরিক্ত অবকাঠামো ছাড়া HTTP caching দরকার
- আপনার টিম ছোট আর REST-ই যথেষ্ট

</Callout>

## মূল কথা

1. **GraphQL client-কে ঠিক যতটুকু দরকার ততটুকুই query করতে দেয়** — over-fetching বা under-fetching নেই
2. **Schema-ই contract** — টাইপ, query, mutation, আর subscription আগেভাগে সংজ্ঞায়িত করুন
3. **Resolver ফিল্ড ধরে ধরে চলে** — প্রতিটি ফিল্ডের নিজস্ব ডেটা-fetching লজিক থাকতে পারে
4. **N+1 সমস্যা বাস্তব** — সম্পর্কিত entity-এর জন্য সবসময় DataLoader ব্যবহার করুন
5. **Subscription** WebSocket-এর ওপর real-time আপডেট দেয়
6. **GraphQL REST-এর বিকল্প নয়** — আপনার use case অনুযায়ী বেছে নিন
