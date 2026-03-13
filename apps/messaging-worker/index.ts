import { WebSocketServer, WebSocket } from 'ws';
import amqplib, { type ConsumeMessage } from 'amqplib';
import { session, archivedMessage } from '@rabbitmq-chat/db';
import { eq } from 'drizzle-orm';
import { db } from './db';

if (!process.env.RMQ_URL) throw new Error('RMQ_URL is not set');
if (!process.env.WS_PORT) throw new Error('WS_PORT is not set');

const EXCHANGE_NAME = 'chat.direct';

type ClientMessage =
	| { type: 'auth'; token: string }
	| { type: 'ack'; deliveryTag: number }
	| { type: 'send_message'; receiverId: string; content: string };

const onlineUsers = new Set<string>();

async function startWorker() {
	const connection = await amqplib.connect(process.env.RMQ_URL!);
	const channel = await connection.createChannel();
	await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });

	const wss = new WebSocketServer({ port: parseInt(process.env.WS_PORT!) });
	console.log(`🚀 Messaging Worker running on ws://localhost:${process.env.WS_PORT}`);

	wss.on('connection', async (ws: WebSocket) => {
		let userId: string | null = null;
		let consumerTag: string | null = null;

		// Map to store original RabbitMQ messages until the client ACKs them
		const pendingAcks = new Map<number, ConsumeMessage>();

		ws.on('message', async (data: Buffer) => {
			try {
				const msg = JSON.parse(data.toString()) as ClientMessage;

				if (msg.type === 'auth') {
					const sessionRecord = await db.query.session.findFirst({
						where: eq(session.token, msg.token)
					});

					if (!sessionRecord || new Date(sessionRecord.expiresAt) < new Date()) {
						ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
						return ws.close();
					}

					userId = sessionRecord.userId;
					onlineUsers.add(userId);

					const queueName = `user.${userId}`;

					await channel.assertQueue(queueName, {
						durable: true,
						arguments: { 'x-queue-mode': 'lazy' }
					});
					await channel.bindQueue(queueName, EXCHANGE_NAME, queueName);

					const consumeSetup = await channel.consume(
						queueName,
						(rmqMsg: ConsumeMessage | null) => {
							if (rmqMsg) {
								const deliveryTag = rmqMsg.fields.deliveryTag;

								// Store the strict message object in memory
								pendingAcks.set(deliveryTag, rmqMsg);

								// Send only the necessary data to the client
								ws.send(
									JSON.stringify({
										type: 'new_message',
										deliveryTag: deliveryTag,
										data: JSON.parse(rmqMsg.content.toString())
									})
								);
							}
						},
						{ noAck: false }
					);

					consumerTag = consumeSetup.consumerTag;
					ws.send(JSON.stringify({ type: 'authenticated', userId }));
					console.log(`[Connected] User ${userId} bound to queue.`);
				}

				if (msg.type === 'ack' && userId) {
					// Retrieve the strict original message object using the tag
					const originalMsg = pendingAcks.get(msg.deliveryTag);

					if (originalMsg) {
						channel.ack(originalMsg);
						pendingAcks.delete(msg.deliveryTag); // Clean up memory
					}
				}

				if (msg.type === 'send_message' && userId) {
					const payload = {
						id: crypto.randomUUID(),
						senderId: userId,
						receiverId: msg.receiverId,
						content: msg.content,
						sentAt: new Date().toISOString()
					};

					channel.publish(
						EXCHANGE_NAME,
						`user.${msg.receiverId}`,
						Buffer.from(JSON.stringify(payload)),
						{ persistent: true }
					);

					if (!onlineUsers.has(msg.receiverId)) {
						console.log(`[Push Notification] Trigger FCM for offline user ${msg.receiverId}`);
					}

					// Async archive
					db.insert(archivedMessage)
						.values({
							id: payload.id,
							senderId: payload.senderId,
							receiverId: payload.receiverId,
							content: payload.content,
							sentAt: new Date(payload.sentAt)
						})
						.execute()
						.catch((err) => console.error('Archive Failed:', err));
				}
			} catch (err) {
				console.error('Message processing error:', err);
			}
		});

		ws.on('close', async () => {
			if (userId) onlineUsers.delete(userId);
			if (consumerTag) {
				await channel.cancel(consumerTag);
			}
			// Any messages left in pendingAcks that haven't been acked
			// will automatically be requeued by RabbitMQ when the channel/consumer drops
			pendingAcks.clear();
		});
	});
}

startWorker().catch(console.error);
