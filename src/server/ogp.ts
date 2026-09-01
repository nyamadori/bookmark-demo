import { randomUUID } from "node:crypto";
import { fetchWithTimeout, readLimitedBody } from "./fetch";
import { saveOgpImage } from "./storage";

// We pick the stored file extension ourselves, so a saved image always ends with
// a type the /ogp route knows how to serve back.
const ALLOWED_IMAGE_TYPES = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"]
]);

const MAX_HTML_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const META_TAG_PATTERN = /<meta\b[^>]*>/gi;
const OG_IMAGE_ATTRIBUTE_PATTERN = /\b(?:property|name)\s*=\s*["']og:image(?::url)?["']/i;
const CONTENT_ATTRIBUTE_PATTERN = /\bcontent\s*=\s*["']([^"']*)["']/i;

export const extractOgImageUrl = (html: string, baseUrl: string): string | null => {
  // og:image lives in a single <meta> tag, so scanning the tags is enough. A
  // full HTML parser would be a bigger dependency than this one tag is worth.
  for (const tag of html.match(META_TAG_PATTERN) ?? []) {
    if (!OG_IMAGE_ATTRIBUTE_PATTERN.test(tag)) {
      continue;
    }

    const rawUrl = tag.match(CONTENT_ATTRIBUTE_PATTERN)?.[1]?.trim();
    if (!rawUrl) {
      continue;
    }

    try {
      // Pages often use a relative path such as "/cover.png", so resolve the
      // value against the page URL before using it.
      const imageUrl = new URL(rawUrl, baseUrl);
      if (imageUrl.protocol === "http:" || imageUrl.protocol === "https:") {
        return imageUrl.toString();
      }
    } catch {
      // A content value we cannot parse simply means "no image in this tag".
    }
  }

  return null;
};

export const storeOgpImage = async (
  pageUrl: string,
  storageDir: string,
  // Tests pass a fake fetch here so they never touch the network.
  fetcher: typeof fetch = fetch
): Promise<string> => {
  try {
    const pageResponse = await fetchWithTimeout(pageUrl, fetcher, "text/html");
    if (!pageResponse) {
      return "";
    }

    const pageType = pageResponse.headers.get("content-type") ?? "";
    if (pageType && !pageType.toLowerCase().includes("text/html")) {
      return "";
    }

    const html = await readLimitedBody(pageResponse, MAX_HTML_BYTES);
    if (!html) {
      return "";
    }

    const imageUrl = extractOgImageUrl(new TextDecoder().decode(html), pageUrl);
    if (!imageUrl) {
      return "";
    }

    const imageResponse = await fetchWithTimeout(imageUrl, fetcher, "image/*");
    if (!imageResponse) {
      return "";
    }

    // "image/png; charset=binary" and "IMAGE/PNG" should both match the table.
    const imageType = (imageResponse.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const extension = ALLOWED_IMAGE_TYPES.get(imageType);
    if (!extension) {
      return "";
    }

    // readLimitedBody rejects an empty body and anything over the limit, so a
    // 0-byte or oversized "image" never reaches the disk.
    const body = await readLimitedBody(imageResponse, MAX_IMAGE_BYTES);
    if (!body) {
      return "";
    }

    // A random name keeps one page from overwriting another page's image and
    // makes the served path safe to cache forever.
    const name = `${randomUUID()}.${extension}`;
    await saveOgpImage(storageDir, name, body);

    return `/ogp/${name}`;
  } catch {
    // Fetching OGP is best-effort. Whatever went wrong, the caller must still be
    // able to save the bookmark.
    return "";
  }
};
