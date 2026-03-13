import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { user, archivedMessage } from '@rabbitmq-chat/db';
import { ne, eq, or, asc } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.session) {
		return redirect(302, '/login');
	}

	const myId = event.locals.user.id;

	const availableUsers = await db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(ne(user.id, myId));

	// Fetch all historical messages involving this user
	const initialMessages = await db
		.select()
		.from(archivedMessage)
		.where(or(eq(archivedMessage.senderId, myId), eq(archivedMessage.receiverId, myId)))
		.orderBy(asc(archivedMessage.sentAt)); // oldest first for chat flow

	return {
		user: event.locals.user,
		session: event.locals.session,
		availableUsers,
		initialMessages
	};
};
