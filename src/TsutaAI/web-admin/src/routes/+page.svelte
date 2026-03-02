<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth';
	import { apiClient } from '$lib/api/client';

	let username = 'admin';
	let password = '';
	let errorMessage = '';
	let isSubmitting = false;

	onMount(() => {
		const unsubscribe = authStore.subscribe((value) => {
			if (value) {
				goto('/dashboard');
			}
		});
		return () => unsubscribe();
	});

	async function handleSubmit() {
		if (isSubmitting) return;

		try {
			isSubmitting = true;
			errorMessage = '';
			const response = await apiClient.login({ username, password });
			if (response.success) {
				authStore.set({
					id: response.data.id,
					username: response.data.username,
					fullName: response.data.fullName,
					role: response.data.role,
					token: response.data.token
				});
				const redirectAfterLogin = window.localStorage.getItem('tsutaai.redirectAfterLogin');
				if (redirectAfterLogin && redirectAfterLogin.startsWith('/')) {
					window.localStorage.removeItem('tsutaai.redirectAfterLogin');
					await goto(redirectAfterLogin);
				} else {
					await goto('/dashboard');
				}
			} else {
				errorMessage = '認証に失敗しました。';
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : '認証に失敗しました。';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<section class="login-wrapper">
	<div class="bg-orb bg-orb-1"></div>
	<div class="bg-orb bg-orb-2"></div>
	<div class="bg-orb bg-orb-3"></div>
	<div class="bg-orb bg-orb-4"></div>
	<div class="bg-orb bg-orb-5"></div>
	<div class="login-card">
		<div class="header-section">
			<div class="logo-container">
				<img src="/logo.png" alt="TsutaAI Logo" class="logo" />
			</div>
			<h1 style="font-size: 24px">ツタAI</h1>
		</div>

		<form class="login-form" on:submit|preventDefault={handleSubmit}>
			{#if errorMessage}
				<p class="error">{errorMessage}</p>
			{/if}

			<div class="input-group">
				<i class="bi bi-person-fill input-icon"></i>
				<input type="text" bind:value={username} placeholder="Username" required />
			</div>

			<div class="input-group">
				<i class="bi bi-lock-fill input-icon"></i>
				<input type="password" bind:value={password} placeholder="Password" required />
			</div>

			<button type="submit" disabled={isSubmitting}>
				{isSubmitting ? '認証中...' : 'LOGIN'}
			</button>
		</form>
	</div>
</section>

<style>
	.login-wrapper {
		min-height: 100vh;
		display: grid;
		place-items: center;
		background: linear-gradient(
			135deg,
			#5a7c5e 0%,
			#6b5b60 20%,
			#8b5a7c 40%,
			#a15683 60%,
			#6b5b95 80%,
			#3d5a80 100%
		);
		padding: 16px;
		position: relative;
		overflow: hidden;
	}

	/* 背景の装飾効果 - 複数の円形グラデーションを重ねる */
	.bg-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(100px);
		opacity: 0.5;
		mix-blend-mode: screen;
	}

	.bg-orb-1 {
		top: -10%;
		left: 10%;
		width: 500px;
		height: 500px;
		background: radial-gradient(circle, rgba(90, 124, 94, 0.4), transparent 70%);
		animation: float1 20s ease-in-out infinite;
	}

	.bg-orb-2 {
		bottom: -5%;
		right: 5%;
		width: 600px;
		height: 600px;
		background: radial-gradient(circle, rgba(161, 86, 131, 0.35), transparent 70%);
		animation: float2 25s ease-in-out infinite;
	}

	.bg-orb-3 {
		top: 30%;
		left: 60%;
		width: 450px;
		height: 450px;
		background: radial-gradient(circle, rgba(107, 91, 149, 0.3), transparent 70%);
		animation: float3 30s ease-in-out infinite;
	}

	.bg-orb-4 {
		top: 60%;
		left: 5%;
		width: 400px;
		height: 400px;
		background: radial-gradient(circle, rgba(61, 90, 128, 0.35), transparent 70%);
		animation: float4 22s ease-in-out infinite;
	}

	.bg-orb-5 {
		top: 15%;
		right: 15%;
		width: 350px;
		height: 350px;
		background: radial-gradient(circle, rgba(139, 90, 124, 0.3), transparent 70%);
		animation: float5 28s ease-in-out infinite;
	}

	@keyframes float1 {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		33% {
			transform: translate(50px, -30px) scale(1.1);
		}
		66% {
			transform: translate(-30px, 40px) scale(0.9);
		}
	}

	@keyframes float2 {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		50% {
			transform: translate(-40px, -50px) scale(1.15);
		}
	}

	@keyframes float3 {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		50% {
			transform: translate(30px, -40px) scale(1.1);
		}
	}

	@keyframes float4 {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		33% {
			transform: translate(-25px, 35px) scale(0.9);
		}
		66% {
			transform: translate(35px, -25px) scale(1.05);
		}
	}

	@keyframes float5 {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		50% {
			transform: translate(-35px, 45px) scale(1.08);
		}
	}

	.login-card {
		width: 380px;
		max-width: 100%;
		padding: 40px 32px;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.5);
		backdrop-filter: blur(30px);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
		display: flex;
		flex-direction: column;
		gap: 24px;
		text-align: center;
		position: relative;
		z-index: 1;
	}

	.header-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0px;
	}

	.logo-container {
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.logo {
		width: 80px;
		height: auto;
		opacity: 1;
		filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
	}

	h1 {
		margin: 0;
		font-size: 32px;
		font-weight: 700;
		font-family: 'Zen Maru Gothic', sans-serif;
		letter-spacing: 0.05em;
		color: #2d3748;
		text-transform: uppercase;
		text-shadow: 0 2px 4px rgba(255, 255, 255, 0.8);
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.input-group {
		position: relative;
		display: flex;
		align-items: center;
	}

	.input-icon {
		position: absolute;
		left: 16px;
		font-size: 18px;
		color: #718096;
		z-index: 1;
	}

	.input-group input {
		width: 100%;
		padding: 14px 16px 14px 48px;
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.7);
		color: #2d3748;
		font-size: 14px;
		transition: all 0.3s ease;
	}

	.input-group input::placeholder {
		color: #a0aec0;
	}

	.input-group input:focus {
		outline: none;
		background: rgba(255, 255, 255, 0.9);
		border-color: #cbd5e0;
		box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
	}

	button {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border: none;
		border-radius: 4px;
		padding: 14px;
		font-weight: 600;
		font-size: 14px;
		letter-spacing: 0.1em;
		color: #ffffff;
		cursor: pointer;
		transition: all 0.3s ease;
		margin-top: 8px;
		text-transform: uppercase;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
	}

	button:active:not(:disabled) {
		transform: translateY(0);
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error {
		color: #e53e3e;
		font-size: 12px;
		font-weight: 500;
		margin: 0;
		padding: 10px 14px;
		background: rgba(254, 215, 215, 0.8);
		border: 1px solid #feb2b2;
		border-radius: 4px;
		text-align: center;
	}

	/* タブレット対応 */
	@media (max-width: 768px) {
		.login-card {
			width: 100%;
			max-width: 380px;
			padding: 36px 28px;
		}

		.logo {
			width: 70px;
		}

		h1 {
			font-size: 24px;
		}
	}

	/* モバイル画面での最適化 */
	@media (max-width: 480px) {
		.login-wrapper {
			padding: 16px;
		}

		.login-card {
			width: 100%;
			padding: 32px 24px;
			gap: 20px;
		}

		.logo {
			width: 60px;
		}

		h1 {
			font-size: 22px;
		}

		.login-form {
			gap: 14px;
		}

		.input-group input {
			padding: 12px 14px 12px 44px;
			font-size: 16px;
		}

		.input-icon {
			left: 14px;
			font-size: 16px;
		}

		button {
			padding: 12px;
			font-size: 13px;
		}

		.error {
			font-size: 11px;
			padding: 8px 12px;
		}
	}
</style>
