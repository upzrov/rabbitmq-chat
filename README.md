# 🧪 Offline Message Delivery Architecture

A high-performance, event-driven chat application utilizing a microservice architecture. It leverages RabbitMQ with Durable, Lazy Queues to handle offline message buffering, allowing the database to act purely as a cold-storage archive. 

Powered by **Bun** , **SvelteKit** (Svelte 5), **Drizzle ORM** (libSQL), and **WebSockets**.

## 🏗️ Workspace Structure

This project is a monorepo containing three main packages:

```text
rabbitmq-chat/
├── apps/
│   ├── messaging-worker/  # Node.js microservice. Handles WS connections, RabbitMQ, and DB archiving.
│   └── web-app/           # SvelteKit frontend. Handles UI, authentication, and client state.
├── packages/
│   └── db/                # Shared single source of truth for Drizzle schema and libSQL client.
