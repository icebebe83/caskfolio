import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const NEWS_THUMB_DIR = path.join(process.cwd(), "public", "news-thumbs");
const FALLBACK_IMAGE_PATH = "/news-fallback.png";
const NEWS_THUMB_WIDTH = 960;

function fileHash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function inferExtension(contentType = "", url = "") {
  if (contentType.includes("png") || /\.png($|\?)/i.test(url)) return "png";
  if (contentType.includes("webp") || /\.webp($|\?)/i.test(url)) return "webp";
  if (contentType.includes("gif") || /\.gif($|\?)/i.test(url)) return "gif";
  return "jpg";
}

export async function createNewsThumbnail(imageUrl) {
  if (!imageUrl) {
    return FALLBACK_IMAGE_PATH;
  }

  if (imageUrl.startsWith("/")) {
    return imageUrl;
  }

  await fs.mkdir(NEWS_THUMB_DIR, { recursive: true });
  const baseName = fileHash(imageUrl);
  const outputName = `${baseName}.jpg`;
  const outputPath = path.join(NEWS_THUMB_DIR, outputName);

  try {
    await fs.access(outputPath);
    return `/news-thumbs/${outputName}`;
  } catch {}

  const response = await fetch(imageUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 CaskIndex News Image Cacher",
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    return FALLBACK_IMAGE_PATH;
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const extension = inferExtension(response.headers.get("content-type") || "", imageUrl);
  const tempInputPath = path.join(os.tmpdir(), `${baseName}.${extension}`);

  try {
    await fs.writeFile(tempInputPath, buffer);
    execFileSync("sips", [
      "-s",
      "format",
      "jpeg",
      tempInputPath,
      "--resampleWidth",
      String(NEWS_THUMB_WIDTH),
      "--out",
      outputPath,
    ]);
    return `/news-thumbs/${outputName}`;
  } catch {
    try {
      await fs.writeFile(outputPath, buffer);
      return `/news-thumbs/${outputName}`;
    } catch {
      return FALLBACK_IMAGE_PATH;
    }
  } finally {
    await fs.rm(tempInputPath, { force: true });
  }
}

export function getNewsFallbackImage() {
  return FALLBACK_IMAGE_PATH;
}
