import path from "path";
import fs from "fs";
import { z } from "zod";

const cwdImagesRoot = path.resolve(process.cwd(), "images");
const parentImagesRoot = path.resolve(process.cwd(), "..", "images");
const defaultImagesRoot = fs.existsSync(cwdImagesRoot) ? cwdImagesRoot : parentImagesRoot;

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgres://postgres:devpass@localhost:5432/grazetrack"),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  IMAGES_ROOT: z
    .string()
    .min(1)
    .default(defaultImagesRoot),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid backend environment configuration: ${parsed.error.message}`);
}

export const config = parsed.data;
