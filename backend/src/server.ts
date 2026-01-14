import Fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "path";
import cors from "@fastify/cors";

import { ranchRoutes } from "./routes/ranches";
import { meRoutes } from "./routes/me";
import { herdRoutes } from "./routes/herds";
import { zoneRoutes } from "./routes/zones";

async function start() {
  const app = Fastify({
    logger: true,
  });

  // Multipart support (uploads)
  app.register(fastifyMultipart, {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB
    },
  });

  // Serve static files from the images directory (your existing setup)
  app.register(fastifyStatic, {
    root: path.join("c:/AltDigital/allcode/grazetrack-platform/images"),
    prefix: "/images/",
  });

  // Enable CORS for frontend dev server
  await app.register(cors, {
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // Routes
  app.register(meRoutes, { prefix: "/api" });
  app.register(ranchRoutes, { prefix: "/api" });
  app.register(herdRoutes, { prefix: "/api" });
  app.register(zoneRoutes, { prefix: "/api" });

  try {
    await app.listen({ port: 3001, host: "0.0.0.0" });
    console.log("GrazeTrack API running on http://localhost:3001");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
