import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { z } from "zod";

import { db } from "../db";
import { zones, userRanches } from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";

async function getActiveRanchId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ ranchId: userRanches.ranchId })
    .from(userRanches)
    .where(eq(userRanches.userId, userId))
    .limit(1);

  return rows[0]?.ranchId ?? null;
}

// Frontend will send GeoJSON strings. (We’ll also accept WKT just in case.)
const zoneCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  areaAcres: z.number().optional(),
  geom: z.string().min(1), // GeoJSON string (preferred) or WKT
});

const zoneUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  areaAcres: z.number().optional(),
  geom: z.string().min(1).optional(), // GeoJSON string (preferred) or WKT
});

function geomFromInput(geomText: string) {
  const trimmed = geomText.trim();

  // If it looks like GeoJSON, use ST_GeomFromGeoJSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return sql`ST_SetSRID(ST_GeomFromGeoJSON(${trimmed}), 4326)`;
  }

  // Otherwise treat as WKT
  return sql`ST_SetSRID(ST_GeomFromText(${trimmed}), 4326)`;
}

export async function zonesRoutes(app: FastifyInstance) {
  // LIST zones (GeoJSON on output)
  app.get("/zones", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const rows = await db
        .select({
          id: zones.id,
          ranchId: zones.ranchId,
          name: zones.name,
          description: zones.description,
          areaAcres: zones.areaAcres,
          // ✅ GeoJSON output instead of EWKB
          geom: sql<string>`ST_AsGeoJSON(${zones.geom})`.as("geom"),
          createdAt: zones.createdAt,
        })
        .from(zones)
        .where(eq(zones.ranchId, ranchId));

      return reply.send(rows);
    } catch (err: any) {
      req.log.error({ err }, "Failed to list zones");
      return reply.status(500).send({ error: "Failed to list zones" });
    }
  });

  // GET zone by id (GeoJSON on output)
  app.get("/zones/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const zoneId = (req.params as any).id as string;

      const rows = await db
        .select({
          id: zones.id,
          ranchId: zones.ranchId,
          name: zones.name,
          description: zones.description,
          areaAcres: zones.areaAcres,
          geom: sql<string>`ST_AsGeoJSON(${zones.geom})`.as("geom"),
          createdAt: zones.createdAt,
        })
        .from(zones)
        .where(and(eq(zones.id, zoneId), eq(zones.ranchId, ranchId)))
        .limit(1);

      const zone = rows[0];
      if (!zone) return reply.status(404).send({ error: "Zone not found" });

      return reply.send(zone);
    } catch (err: any) {
      req.log.error({ err }, "Failed to get zone");
      return reply.status(500).send({ error: "Failed to get zone" });
    }
  });

  // CREATE zone
  app.post("/zones", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const parsed = zoneCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid zone payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      const zoneId = uuid();

      await db.insert(zones).values({
        id: zoneId,
        ranchId,
        name: data.name,
        description: data.description ?? null,
        areaAcres: data.areaAcres != null ? data.areaAcres.toString() : null,
        // ✅ Convert GeoJSON/WKT -> geometry(4326)
        geom: geomFromInput(data.geom),
      });

      return reply.status(201).send({ id: zoneId });
    } catch (err: any) {
      req.log.error({ err }, "Failed to create zone");
      return reply.status(500).send({ error: "Failed to create zone" });
    }
  });

  // UPDATE zone
  app.put("/zones/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const zoneId = (req.params as any).id as string;

      const parsed = zoneUpdateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid zone payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;

      await db
        .update(zones)
        .set({
          name: data.name,
          description: data.description,
          areaAcres: data.areaAcres != null ? data.areaAcres.toString() : undefined,
          geom: data.geom != null ? geomFromInput(data.geom) : undefined,
        })
        .where(and(eq(zones.id, zoneId), eq(zones.ranchId, ranchId)));

      return reply.send({ success: true });
    } catch (err: any) {
      req.log.error({ err }, "Failed to update zone");
      return reply.status(500).send({ error: "Failed to update zone" });
    }
  });

  // DELETE zone
  app.delete("/zones/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const zoneId = (req.params as any).id as string;

      await db
        .delete(zones)
        .where(and(eq(zones.id, zoneId), eq(zones.ranchId, ranchId)));

      return reply.send({ success: true });
    } catch (err: any) {
      req.log.error({ err }, "Failed to delete zone");
      return reply.status(500).send({ error: "Failed to delete zone" });
    }
  });
}
