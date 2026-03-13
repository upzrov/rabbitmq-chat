<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { archivedMessage } from '@rabbitmq-chat/db';
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';

	let { data }: { data: PageData } = $props();

	// Global State
	let ws = $state<WebSocket | null>(null);
	let isConnected = $state(false);

	// Chat State
	let targetUserId = $state('');
	let inputText = $state('');
	let unreadCounts = $state<Record<string, number>>({});

	let allMessages = $state<(typeof archivedMessage.$inferSelect)[]>(
		untrack(() => data.initialMessages || [])
	);

	// Instantly filters the messages for the currently selected chat
	let activeMessages = $derived(
		allMessages.filter(
			(m) =>
				(m.senderId === targetUserId && m.receiverId === data.user?.id) ||
				(m.senderId === data.user?.id && m.receiverId === targetUserId)
		)
	);

	let chatContainer = $state<HTMLElement | null>(null);

	// Connect WebSocket when session exists
	$effect(() => {
		if (data.session?.token && !ws) {
			connectWebSocket(data.session.token);
		}
	});

	// Auto-clear unread count when switching to a user's chat
	$effect(() => {
		if (targetUserId && unreadCounts[targetUserId]) {
			unreadCounts[targetUserId] = 0;
		}
	});

	// Auto-scroll to the bottom when new active messages appear
	$effect(() => {
		if (activeMessages.length && chatContainer) {
			// Small timeout allows the DOM to render the new message first
			setTimeout(() => {
				chatContainer!.scrollTop = chatContainer!.scrollHeight;
			}, 10);
		}
	});

	function connectWebSocket(token: string) {
		ws = new WebSocket('ws://localhost:8080');

		ws.onopen = () => ws?.send(JSON.stringify({ type: 'auth', token }));

		ws.onmessage = (event) => {
			const parsed = JSON.parse(event.data);

			if (parsed.type === 'authenticated') isConnected = true;

			if (parsed.type === 'new_message') {
				// Check if we already have this exact message ID in our state
				const alreadyExists = allMessages.some((m) => m.id === parsed.data.id);

				// Only push it to the UI if it's brand new
				if (!alreadyExists) {
					allMessages.push(parsed.data);

					// Handle unread count
					if (parsed.data.senderId !== targetUserId) {
						unreadCounts[parsed.data.senderId] = (unreadCounts[parsed.data.senderId] || 0) + 1;
					}
				}

				// ALWAYS send the ack, even if it was a duplicate,
				// so RabbitMQ permanently deletes it from the queue
				ws?.send(JSON.stringify({ type: 'ack', deliveryTag: parsed.deliveryTag }));
			}
		};

		ws.onclose = () => {
			isConnected = false;
			console.log('Disconnected from worker');
		};
	}

	onDestroy(() => ws?.close());

	function sendMessage() {
		if (!inputText.trim() || !targetUserId || !data.user) return;

		ws?.send(
			JSON.stringify({
				type: 'send_message',
				receiverId: targetUserId,
				content: inputText
			})
		);

		// Optimistic update, instantly added to the global array
		allMessages.push({
			id: crypto.randomUUID(),
			senderId: data.user.id,
			receiverId: targetUserId,
			content: inputText,
			sentAt: new Date()
		});

		inputText = '';
	}

	function getUserName(id: string) {
		if (id === data.user?.id) return 'You';
		const foundUser = data.availableUsers?.find((u) => u.id === id);
		return foundUser ? foundUser.name : id;
	}
</script>

<div
	class="flex flex-col h-[80vh] max-w-2xl mx-auto font-sans bg-white shadow-xl rounded-xl border border-gray-100 mt-10 overflow-hidden"
>
	{#if !data.user}
		<div class="flex h-full items-center justify-center">
			<p class="text-gray-500">Please log in via better-auth to use the chat.</p>
		</div>
	{:else if data.availableUsers.length === 0}
		<div class="flex flex-col h-full items-center justify-center gap-3 p-8 text-center bg-gray-50">
			<div
				class="h-16 w-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl mb-2"
			>
				👻
			</div>
			<h3 class="text-xl font-semibold text-gray-800">It's quiet in here...</h3>
			<p class="text-gray-500">
				You are the only registered user on this server right now. Ask a friend to sign up to start
				chatting!
			</p>
		</div>
	{:else}
		<header class="p-5 border-b border-gray-200 bg-gray-50">
			<h2 class="text-xl font-semibold text-gray-800">
				Welcome, <a href={resolve('/profile')} class="text-blue-600">{data.user.name}</a>
			</h2>
			<div
				class="mt-1 flex items-center gap-2 text-sm font-medium {isConnected
					? 'text-emerald-600'
					: 'text-red-500'}"
			>
				<span class="relative flex h-3 w-3">
					{#if isConnected}
						<span
							class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
						></span>
					{/if}
					<span
						class="relative inline-flex rounded-full h-3 w-3 {isConnected
							? 'bg-emerald-500'
							: 'bg-red-500'}"
					></span>
				</span>
				{isConnected ? 'Online (Connected to RabbitMQ)' : 'Offline'}
			</div>

			<div class="mt-4 flex flex-col gap-1.5">
				<label for="target" class="text-sm font-medium text-gray-600">Chatting with:</label>
				<select
					id="target"
					bind:value={targetUserId}
					class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow bg-white cursor-pointer"
				>
					<option value="" disabled selected>Select a user to start chatting...</option>
					{#each data.availableUsers as availableUser (availableUser.id)}
						<option value={availableUser.id}>
							{availableUser.name}
							{#if unreadCounts[availableUser.id]}
								({unreadCounts[availableUser.id]} unread)
							{/if}
						</option>
					{/each}
				</select>
			</div>
		</header>

		<main
			bind:this={chatContainer}
			class="flex-1 overflow-y-auto p-5 flex flex-col gap-3 bg-gray-50/50"
		>
			{#if !targetUserId}
				<div class="h-full flex items-center justify-center text-gray-400 text-sm">
					Select a user from the dropdown to view chat history.
				</div>
			{:else if activeMessages.length === 0}
				<div class="h-full flex items-center justify-center text-gray-400 text-sm">
					No messages yet. Say hello!
				</div>
			{:else}
				{#each activeMessages as msg (msg.id)}
					<div
						class="p-3 rounded-2xl max-w-[80%] w-fit shadow-sm {msg.senderId === data.user.id
							? 'self-end bg-blue-600 text-white rounded-tr-sm'
							: 'self-start bg-white text-gray-900 border border-gray-100 rounded-tl-sm'}"
					>
						<span class="text-xs opacity-75 mb-1 block font-medium">
							{getUserName(msg.senderId)}
						</span>
						<p class="leading-relaxed">{msg.content}</p>
					</div>
				{/each}
			{/if}
		</main>

		<footer class="flex gap-3 p-4 border-t border-gray-200 bg-white">
			<input
				type="text"
				bind:value={inputText}
				placeholder={targetUserId ? 'Type a message...' : 'Select a user first'}
				onkeydown={(e) => e.key === 'Enter' && sendMessage()}
				disabled={!targetUserId || !isConnected}
				class="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow disabled:bg-gray-100 disabled:cursor-not-allowed"
			/>
			<button
				onclick={sendMessage}
				disabled={!targetUserId || !isConnected || !inputText.trim()}
				class="px-6 py-2 bg-blue-600 text-white font-medium rounded-full hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
			>
				Send
			</button>
		</footer>
	{/if}
</div>
