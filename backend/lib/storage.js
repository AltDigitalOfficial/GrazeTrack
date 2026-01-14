import path from "path";
import fs from "fs/promises";
import { v4 as uuid } from "uuid";

const BASE_DIR = "c:/AltDigital/allcode/grazetrack-platform/images";

export async function ensureRanchStructure(ranchId) {
  const ranchRoot = path.join(BASE_DIR, "ranches", ranchId);

  const subfolders = [
    "brand",
    "logo",
    "animals",
    "fences",
    "water",
    "misc"
  ];

  await fs.mkdir(ranchRoot, { recursive: true });

  for (const folder of subfolders) {
    await fs.mkdir(path.join(ranchRoot, folder), { recursive: true });
  }

  return ranchRoot;
}

/**
 * Save a single uploaded file using Fastify's multipart API.
 * Returns: { filename, filepath }
 */
export async function saveUploadedFile(file, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });

  const ext = path.extname(file.filename);
  const safeName = `${uuid()}${ext}`;
  const fullPath = path.join(targetDir, safeName);

  const writeStream = (await import("fs")).createWriteStream(fullPath);

  await new Promise((resolve, reject) => {
    file.file.pipe(writeStream);
    file.file.on("end", resolve);
    file.file.on("error", reject);
  });

  return {
    filename: safeName,
    filepath: fullPath
  };
}