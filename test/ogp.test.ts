import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractOgImageUrl, storeOgpImage } from "../src/server/ogp";

const PAGE_URL = "https://example.com/article";
const IMAGE_URL = "https://example.com/cover.png";
const IMAGE_BYTES = new Uint8Array([137, 80, 78, 71]);

let storageDir: string;

const htmlResponse = (html: string) =>
  new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });

const imageResponse = (contentType: string, extraHeaders: Record<string, string> = {}) =>
  new Response(IMAGE_BYTES, { headers: { "content-type": contentType, ...extraHeaders } });

// A fake fetch that answers from a table of URLs, so no test touches the network.
const createFetcher = (responses: Record<string, () => Response>) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const respond = responses[url];

    if (!respond) {
      throw new Error(`Unexpected fetch: ${url}`);
    }

    return respond();
  }) as unknown as typeof fetch;

beforeEach(async () => {
  storageDir = await mkdtemp(join(tmpdir(), "bookmark-demo-ogp-"));
});

afterEach(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

describe("extractOgImageUrl", () => {
  it("extracts an absolute og:image URL", () => {
    const html = `<meta property="og:image" content="${IMAGE_URL}" />`;

    expect(extractOgImageUrl(html, PAGE_URL)).toBe(IMAGE_URL);
  });

  it("resolves a relative og:image against the page URL", () => {
    const html = '<meta name="og:image:url" content="/images/cover.png">';

    expect(extractOgImageUrl(html, PAGE_URL)).toBe("https://example.com/images/cover.png");
  });

  it("returns null when the page has no og:image", () => {
    const html = '<meta property="og:title" content="Example"><title>Example</title>';

    expect(extractOgImageUrl(html, PAGE_URL)).toBeNull();
  });

  it("ignores og:image values that are not http or https", () => {
    const html = '<meta property="og:image" content="data:image/png;base64,AAAA">';

    expect(extractOgImageUrl(html, PAGE_URL)).toBeNull();
  });
});

describe("storeOgpImage", () => {
  it("stores the image and returns its served path", async () => {
    const fetcher = createFetcher({
      [PAGE_URL]: () => htmlResponse(`<meta property="og:image" content="${IMAGE_URL}">`),
      [IMAGE_URL]: () => imageResponse("image/png")
    });

    const path = await storeOgpImage(PAGE_URL, storageDir, fetcher);

    expect(path).toMatch(/^\/ogp\/[0-9a-f-]{36}\.png$/);
    const [storedName] = await readdir(storageDir);
    expect(path).toBe(`/ogp/${storedName}`);
    expect(new Uint8Array(await readFile(join(storageDir, storedName)))).toEqual(IMAGE_BYTES);
  });

  it("returns an empty path when the page has no og:image", async () => {
    const fetcher = createFetcher({
      [PAGE_URL]: () => htmlResponse("<title>No image here</title>")
    });

    await expect(storeOgpImage(PAGE_URL, storageDir, fetcher)).resolves.toBe("");
    await expect(readdir(storageDir)).resolves.toEqual([]);
  });

  it("returns an empty path for an image type we do not store", async () => {
    const fetcher = createFetcher({
      [PAGE_URL]: () => htmlResponse(`<meta property="og:image" content="${IMAGE_URL}">`),
      [IMAGE_URL]: () => imageResponse("image/svg+xml")
    });

    await expect(storeOgpImage(PAGE_URL, storageDir, fetcher)).resolves.toBe("");
    await expect(readdir(storageDir)).resolves.toEqual([]);
  });

  it("returns an empty path for an image larger than the limit", async () => {
    const fetcher = createFetcher({
      [PAGE_URL]: () => htmlResponse(`<meta property="og:image" content="${IMAGE_URL}">`),
      [IMAGE_URL]: () => imageResponse("image/png", { "content-length": String(6 * 1024 * 1024) })
    });

    await expect(storeOgpImage(PAGE_URL, storageDir, fetcher)).resolves.toBe("");
    await expect(readdir(storageDir)).resolves.toEqual([]);
  });

  it("returns an empty path when the page cannot be fetched", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("network failed");
    }) as unknown as typeof fetch;

    await expect(storeOgpImage(PAGE_URL, storageDir, fetcher)).resolves.toBe("");
  });
});
