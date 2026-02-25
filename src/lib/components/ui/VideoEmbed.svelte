<script lang="ts">
	import type { ParsedVideo } from '$lib/utils/videoEmbed';

	interface Props {
		video: ParsedVideo;
	}

	const { video }: Props = $props();

	const platformLabels: Record<string, string> = {
		youtube: 'YouTube',
		instagram: 'Instagram',
		tiktok: 'TikTok'
	};

	const platformColors: Record<string, string> = {
		youtube: 'text-red-500',
		instagram: 'text-pink-500',
		tiktok: 'text-text-primary'
	};
</script>

<div class="video-embed" class:vertical={video.isVertical}>
	<iframe
		src={video.embedUrl}
		title="Video on {platformLabels[video.platform] ?? video.platform}"
		loading="lazy"
		allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
		allowfullscreen
	></iframe>
	<a
		href={video.originalUrl}
		target="_blank"
		rel="noopener noreferrer"
		class="fallback-link {platformColors[video.platform] ?? 'text-accent'}"
	>
		Watch on {platformLabels[video.platform] ?? video.platform} &rarr;
	</a>
</div>

<style>
	.video-embed {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.video-embed iframe {
		width: 100%;
		border: none;
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.2);
	}

	/* Horizontal (regular YouTube) */
	.video-embed:not(.vertical) iframe {
		aspect-ratio: 16 / 9;
	}

	/* Vertical (Shorts, Reels, TikTok) */
	.video-embed.vertical {
		max-width: 325px;
	}

	.video-embed.vertical iframe {
		aspect-ratio: 9 / 16;
		max-height: 500px;
	}

	.fallback-link {
		display: inline-block;
		margin-top: 6px;
		font-size: 13px;
		font-weight: 500;
		opacity: 0.85;
		transition: opacity 0.15s;
	}

	.fallback-link:hover {
		opacity: 1;
	}
</style>
