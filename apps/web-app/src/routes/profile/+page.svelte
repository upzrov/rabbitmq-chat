<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();
</script>

<div class="h-svh items-center justify-center flex flex-col gap-4">
	<h1>Hi, {data.user.name}!</h1>
	<p>Your user ID is {data.user.id}.</p>
	<form method="post" action="?/signOut" use:enhance>
		<button class="rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
			>Sign out</button
		>
	</form>
</div>
