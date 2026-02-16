import Fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "path";
import cors from "@fastify/cors";
import { config } from "./config";

import { ranchRoutes } from "./routes/ranches";
import { meRoutes } from "./routes/me";
import { herdRoutes } from "./routes/herds";
import { zonesRoutes } from "./routes/zones";
import { landRoutes } from "./routes/land";
import { medicationsRoutes } from "./routes/medications";
import { medicationPurchasesRoutes } from "./routes/medicationPurchases";
import { animalsRoutes } from "./routes/animals";

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
    root: path.join(config.IMAGES_ROOT),
    prefix: "/images/",
  });

  // Enable CORS for frontend dev server
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // Routes
  app.register(meRoutes, { prefix: "/api" });
  app.register(ranchRoutes, { prefix: "/api" });
  app.register(herdRoutes, { prefix: "/api" });
  app.register(zonesRoutes, { prefix: "/api" });
  app.register(landRoutes, { prefix: "/api" });
  app.register(medicationsRoutes, { prefix: "/api" });
  app.register(medicationPurchasesRoutes, { prefix: "/api" });
  app.register(animalsRoutes, { prefix: "/api" });
  
  try {
    await app.listen({ port: config.API_PORT, host: config.API_HOST });
    console.log(`GrazeTrack API running on http://${config.API_HOST}:${config.API_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
