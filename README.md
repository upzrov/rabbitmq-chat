# 🐇 RabbitMQ Chat

A chat application utilizing a microservice architecture. It leverages RabbitMQ with Durable, Lazy Queues to handle offline message buffering, allowing the database to act purely as a cold-storage archive. 

Also powered by **Bun** , **SvelteKit** (Svelte 5), **Drizzle ORM** (libSQL), and **WebSockets**.

## 🏗️ Workspace Structure

This project is a monorepo containing three main packages:

```text
rabbitmq-chat/
├── apps/
│   ├── messaging-worker/  # Node.js microservice. Handles WS connections, RabbitMQ, and DB archiving.
│   └── web-app/           # SvelteKit frontend. Handles UI, authentication, and client state.
├── packages/
│   └── db/                # Shared single source of truth for Drizzle schema and libSQL client.
```

## 🗄️ Running Database Migrations

When setting up for the first time or after altering the Drizzle schema, migrate your SQLite database. 

```bash
cd packages/db
bun run db:migrate
```

## 🚀 Starting the Development Servers

Open two separate terminals at the root of the project to start both services using Bun workspaces.

**Terminal 1: SvelteKit Frontend**
```bash
bun --filter web-app run dev
```

**Terminal 2: WebSocket & RabbitMQ Worker**
```bash
bun --filter messaging-worker run dev
```
