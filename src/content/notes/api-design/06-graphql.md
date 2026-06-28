---
title: 'GraphQL'
subtitle: 'Query exactly the data you need with GraphQL — schemas, queries, mutations, subscriptions, and solving the N+1 problem.'
chapter: 6
level: 'intermediate'
readingTime: '15 min'
topics: ['GraphQL', 'schema design', 'queries', 'mutations', 'subscriptions', 'N+1 problem']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What is GraphQL?

GraphQL is a query language for APIs created by Facebook in 2012 (open-sourced in 2015). Unlike REST, where each endpoint returns a fixed structure, GraphQL lets clients request exactly the fields they need.

<Callout type="info">

**Real-World Analogy**

Like ordering at a made-to-order salad bar — you pick exactly which ingredients you want instead of choosing a pre-made salad. You get exactly what you asked for, nothing more, nothing less.

</Callout>

## Schema Definition

Everything in GraphQL starts with the schema. It defines your data types and available operations.

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

### Root Types

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

## Queries

Clients query exactly the fields they need:

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

## Mutations

Mutations modify data. Always use input types for complex arguments:

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

## Subscriptions

Real-time updates over WebSocket:

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

## The N+1 Problem

The most common performance trap in GraphQL:

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

### Solution: DataLoader

DataLoader batches multiple individual loads into a single query:

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

**DataLoader Rules**

- Create a **new DataLoader instance per request** — they cache within a request
- The batch function must return results in the **same order** as the input keys
- Always handle missing entities (return `null` for unknown IDs)
- DataLoader only works for batching by ID — complex queries need different strategies

</Callout>

## GraphQL vs REST

| Feature        | REST                     | GraphQL                    |
| -------------- | ------------------------ | -------------------------- |
| Data fetching  | Fixed per endpoint       | Client specifies           |
| Over-fetching  | Common                   | Eliminated                 |
| Under-fetching | Multiple requests needed | Single request             |
| Caching        | HTTP caching built-in    | Requires custom caching    |
| File uploads   | Native                   | Needs workarounds          |
| Error handling | HTTP status codes        | Always 200, errors in body |
| Learning curve | Low                      | Moderate                   |
| Tooling        | Mature                   | Growing                    |

<Callout type="tip">

**When to Use GraphQL**

- Multiple clients need different data shapes (mobile vs web)
- Your UI requires deeply nested, related data in one request
- You are tired of creating one-off REST endpoints for each view

**When to Stick with REST**

- Simple CRUD APIs
- File upload/download heavy APIs
- You need HTTP caching without extra infrastructure
- Your team is small and REST is sufficient

</Callout>

## Key Takeaways

1. **GraphQL lets clients query exactly what they need** — no over-fetching or under-fetching
2. **Schema is the contract** — define types, queries, mutations, and subscriptions upfront
3. **Resolvers execute field by field** — each field can have its own data-fetching logic
4. **The N+1 problem is real** — always use DataLoader for related entities
5. **Subscriptions** provide real-time updates over WebSocket
6. **GraphQL is not a REST replacement** — choose based on your use case
