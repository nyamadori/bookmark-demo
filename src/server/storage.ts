import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

// Only the image types we accept when downloading are ever stored, so serving
// them back is a small fixed lookup instead of content sniffing.
const IMAGE_TYPES_BY_EXTENSION = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".avif", "image/avif"]
]);

// Stored files are always "<name>.<extension>" with no path separators. Checking
// the whole name keeps a request such as /ogp/..%2F..%2Fbookmarks.sqlite from
// reading a file outside the storage folder.
const STORED_NAME_PATTERN = /^[A-Za-z0-9-]+\.[A-Za-z0-9]+$/;

export type StoredOgpImage = {
  body: Uint8Array;
  contentType: string;
};

export const saveOgpImage = async (storageDir: string, name: string, body: Uint8Array) => {
  // The folder is created at startup, but a fresh checkout or a deleted data
  // folder should not lose an image.
  await mkdir(storageDir, { recursive: true });
  await writeFile(join(storageDir, name), body);
};

export const readOgpImage = async (
  storageDir: string,
  name: string
): Promise<StoredOgpImage | null> => {
  if (!STORED_NAME_PATTERN.test(name)) {
    return null;
  }

  const contentType = IMAGE_TYPES_BY_EXTENSION.get(extname(name).toLowerCase());
  if (!contentType) {
    return null;
  }

  try {
    const body = await readFile(join(storageDir, name));
    return { body, contentType };
  } catch {
    // A missing file is a normal 404, not a server error.
    return null;
  }
};
