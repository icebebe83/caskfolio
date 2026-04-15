export function getYouTubeVideoId(url: string): string {
  const value = url.trim();
  if (!value) return "";

  const shortMatch = value.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
  if (shortMatch?.[1]) return shortMatch[1];

  const watchMatch = value.match(/[?&]v=([A-Za-z0-9_-]{6,})/i);
  if (watchMatch?.[1]) return watchMatch[1];

  const embedMatch = value.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/i);
  if (embedMatch?.[1]) return embedMatch[1];

  return "";
}

export function getYouTubeThumbnailUrl(url: string): string {
  const videoId = getYouTubeVideoId(url);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";
}

export function resolveNewsImageUrl(url: string, imageUrl?: string): string {
  const normalizedImage = imageUrl?.trim() ?? "";
  if (normalizedImage) return normalizedImage;

  const youtubeThumbnail = getYouTubeThumbnailUrl(url);
  if (youtubeThumbnail) return youtubeThumbnail;

  return "/news-fallback.png";
}
