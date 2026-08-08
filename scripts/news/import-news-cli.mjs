import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runNewsImport } from "./import-news.mjs";
import { createNewsThumbnail } from "./news-image-utils.mjs";
import { loadProjectEnv } from "../shared/load-env.mjs";

const OUTPUT_PATH = path.join(process.cwd(), "public", "news.json");

async function prepareLocalThumbnail({ fallbackImage, sourceImageUrl, uploadBuffer }) {
  const localImageUrl = await createNewsThumbnail(sourceImageUrl);
  if (!localImageUrl?.startsWith("/news-thumbs/")) {
    return localImageUrl || fallbackImage;
  }

  const fileName = path.basename(localImageUrl);
  const filePath = path.join(process.cwd(), "public", "news-thumbs", fileName);

  try {
    const publicUrl = await uploadBuffer(
      `news/imported/${fileName}`,
      await fs.readFile(filePath),
      "image/jpeg",
    );
    return publicUrl || localImageUrl;
  } catch (error) {
    console.warn(
      `[news-import] thumbnail file unavailable ${fileName}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return localImageUrl;
  }
}

async function writeOutput(articles) {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(articles, null, 2));
}

export async function runNewsImportCli() {
  loadProjectEnv();
  const summary = await runNewsImport({
    articleConcurrency: 1,
    env: process.env,
    prepareLocalThumbnail,
    useLocalThumbnails: true,
    writeOutput,
    writeOutputFile: true,
  });

  console.log(
    `[news-import] saved ${summary.saved} new article(s) and refreshed ${OUTPUT_PATH}`,
  );
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runNewsImportCli().catch((error) => {
    console.error("[news-import] failed:", error);
    process.exitCode = 1;
  });
}
