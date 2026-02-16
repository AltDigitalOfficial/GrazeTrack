import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { z } from "zod";

import { db } from "../db";
import {
  forageSamples,
  grazingSessions,
  landRecommendations,
  soilSamples,
  userRanches,
  zoneDailyStates,
  zoneSubzones,
  zoneWeatherDaily,
  zones,
} from "../db/schema";
import { logAndSendInternalError, sendError } from "../lib/http";
import { requireAuth } from "../plugins/requireAuth";

async function getActiveRanchId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ ranchId: userRanches.ranchId })
    .from(userRanches)
    .where(eq(userRanches.userId, userId))
    .limit(1);
  return rows[0]?.ranchId ?? null;
}

function parseDecimal(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toIsoDateOrToday(value?: string): string {
  if (!value || value.trim().length === 0) {
    return new Date().toISOString().slice(0, 10);
  }
  return value;
}

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const subzoneCreateSchema = z.object({
  zoneId: idSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "resting", "inactive"]).optional(),
  areaAcres: z.number().positive().optional(),
  geom: z.string().min(1).optional(),
  targetRestDays: z.number().int().min(1).max(180).optional(),
});

const grazingSessionCreateSchema = z.object({
  zoneId: idSchema,
  subzoneId: idSchema.optional(),
  herdId: idSchema.optional(),
  headCount: z.number().int().min(0).optional(),
  stockDensityAuPerAcre: z.number().nonnegative().optional(),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1).optional(),
  notes: z.string().optional(),
});

const soilSampleCreateSchema = z.object({
  zoneId: idSchema,
  subzoneId: idSchema.optional(),
  sampledAt: dateSchema,
  ph: z.number().min(0).max(14).optional(),
  organicMatterPct: z.number().min(0).max(100).optional(),
  nitrogenPpm: z.number().min(0).optional(),
  phosphorusPpm: z.number().min(0).optional(),
  potassiumPpm: z.number().min(0).optional(),
  moisturePct: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

const forageSampleCreateSchema = z.object({
  zoneId: idSchema,
  subzoneId: idSchema.optional(),
  sampledAt: dateSchema,
  speciesObserved: z.array(z.string().min(1)).optional(),
  biomassLbPerAcre: z.number().nonnegative().optional(),
  groundCoverPct: z.number().min(0).max(100).optional(),
  avgCanopyInches: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const weatherDailyCreateSchema = z.object({
  zoneId: idSchema,
  subzoneId: idSchema.optional(),
  weatherDate: dateSchema,
  minTempF: z.number().optional(),
  maxTempF: z.number().optional(),
  rainInches: z.number().min(0).optional(),
  forecastRainInchesNext3d: z.number().min(0).optional(),
  source: z.string().optional(),
});

const zoneStateCreateSchema = z.object({
  zoneId: idSchema,
  subzoneId: idSchema.optional(),
  stateDate: dateSchema,
  restDays: z.number().int().min(0).max(365).optional(),
  estimatedForageLbPerAcre: z.number().nonnegative().optional(),
  utilizationPct: z.number().min(0).max(100).optional(),
  moistureStressScore: z.number().int().min(0).max(10).optional(),
  recoveryStage: z.enum(["poor", "early", "mid", "full"]).optional(),
  needsRest: z.boolean().optional(),
  notes: z.string().optional(),
});

const recommendationGenerateSchema = z.object({
  zoneId: idSchema.optional(),
  subzoneId: idSchema.optional(),
  recommendationDate: dateSchema.optional(),
  persist: z.boolean().optional().default(false),
});

const recommendationStatusSchema = z.object({
  status: z.enum(["open", "accepted", "dismissed", "completed"]),
});

type PreviewRecommendation = {
  ranchId: string;
  zoneId: string;
  subzoneId: string | null;
  recommendationDate: string;
  recommendationType: "rest" | "graze" | "seed" | "caution";
  priority: "low" | "medium" | "high";
  title: string;
  rationale: string;
  actionByDate: string | null;
  confidenceScore: number;
  metadata: Record<string, unknown>;
};

async function buildRecommendations(
  ranchId: string,
  recommendationDate: string,
  zoneId?: string,
  subzoneId?: string
): Promise<PreviewRecommendation[]> {
  const zoneWhere = zoneId
    ? and(eq(zones.ranchId, ranchId), eq(zones.id, zoneId))
    : eq(zones.ranchId, ranchId);

  const zoneRows = await db
    .select({ id: zones.id, name: zones.name })
    .from(zones)
    .where(zoneWhere);

  const out: PreviewRecommendation[] = [];
  const recMonth = Number(recommendationDate.slice(5, 7));

  for (const zoneRow of zoneRows) {
    const stateWhere = subzoneId
      ? and(
          eq(zoneDailyStates.ranchId, ranchId),
          eq(zoneDailyStates.zoneId, zoneRow.id),
          eq(zoneDailyStates.subzoneId, subzoneId)
        )
      : and(eq(zoneDailyStates.ranchId, ranchId), eq(zoneDailyStates.zoneId, zoneRow.id), isNull(zoneDailyStates.subzoneId));

    const weatherWhere = subzoneId
      ? and(
          eq(zoneWeatherDaily.ranchId, ranchId),
          eq(zoneWeatherDaily.zoneId, zoneRow.id),
          eq(zoneWeatherDaily.subzoneId, subzoneId)
        )
      : and(eq(zoneWeatherDaily.ranchId, ranchId), eq(zoneWeatherDaily.zoneId, zoneRow.id), isNull(zoneWeatherDaily.subzoneId));

    const [latestState] = await db
      .select()
      .from(zoneDailyStates)
      .where(stateWhere)
      .orderBy(desc(zoneDailyStates.stateDate))
      .limit(1);

    const [latestWeather] = await db
      .select()
      .from(zoneWeatherDaily)
      .where(weatherWhere)
      .orderBy(desc(zoneWeatherDaily.weatherDate))
      .limit(1);

    const [latestGraze] = await db
      .select({ endedAt: grazingSessions.endedAt, startedAt: grazingSessions.startedAt })
      .from(grazingSessions)
      .where(and(eq(grazingSessions.ranchId, ranchId), eq(grazingSessions.zoneId, zoneRow.id)))
      .orderBy(desc(grazingSessions.startedAt))
      .limit(1);

    const restDays = latestState?.restDays ?? null;
    const utilizationPct = parseDecimal(latestState?.utilizationPct);
    const forage = parseDecimal(latestState?.estimatedForageLbPerAcre);
    const stress = latestState?.moistureStressScore ?? null;
    const rainNext3d = parseDecimal(latestWeather?.forecastRainInchesNext3d);

    const restTriggered =
      latestState?.needsRest === true ||
      (utilizationPct != null && utilizationPct > 70) ||
      (stress != null && stress >= 7);

    if (restTriggered) {
      const keepOutDays = Math.max(3, 14 - (restDays ?? 0));
      out.push({
        ranchId,
        zoneId: zoneRow.id,
        subzoneId: subzoneId ?? null,
        recommendationDate,
        recommendationType: "rest",
        priority: stress != null && stress >= 8 ? "high" : "medium",
        title: `Keep animals out of ${zoneRow.name} for ${keepOutDays} day${keepOutDays === 1 ? "" : "s"}`,
        rationale:
          "Recovery indicators show this area needs additional rest before the next grazing pass.",
        actionByDate: null,
        confidenceScore: 0.82,
        metadata: {
          restDays,
          utilizationPct,
          moistureStressScore: stress,
        },
      });
    }

    const grazeTriggered =
      forage != null &&
      forage >= 1800 &&
      (utilizationPct == null || utilizationPct <= 55) &&
      (stress == null || stress <= 6);

    if (grazeTriggered) {
      out.push({
        ranchId,
        zoneId: zoneRow.id,
        subzoneId: subzoneId ?? null,
        recommendationDate,
        recommendationType: "graze",
        priority: "medium",
        title: `Time to graze down ${zoneRow.name}`,
        rationale: "Forage mass and stress indicators suggest this zone is ready for utilization.",
        actionByDate: recommendationDate,
        confidenceScore: 0.77,
        metadata: {
          estimatedForageLbPerAcre: forage,
          utilizationPct,
          moistureStressScore: stress,
        },
      });
    }

    const inSeedingWindow = [3, 4, 5, 9, 10].includes(recMonth);
    const seedTriggered = inSeedingWindow && rainNext3d != null && rainNext3d >= 0.5 && (stress == null || stress <= 6);

    if (seedTriggered) {
      out.push({
        ranchId,
        zoneId: zoneRow.id,
        subzoneId: subzoneId ?? null,
        recommendationDate,
        recommendationType: "seed",
        priority: "medium",
        title: `Seed opportunity in ${zoneRow.name} before incoming rain`,
        rationale: "Forecast moisture and current stress conditions indicate a favorable establishment window.",
        actionByDate: recommendationDate,
        confidenceScore: 0.71,
        metadata: {
          forecastRainInchesNext3d: rainNext3d,
          moistureStressScore: stress,
          month: recMonth,
        },
      });
    }

    if (!restTriggered && !grazeTriggered && !seedTriggered) {
      out.push({
        ranchId,
        zoneId: zoneRow.id,
        subzoneId: subzoneId ?? null,
        recommendationDate,
        recommendationType: "caution",
        priority: "low",
        title: `Monitor ${zoneRow.name} before next move`,
        rationale: "No strong action trigger was found from current state, weather, or recent grazing records.",
        actionByDate: null,
        confidenceScore: 0.55,
        metadata: {
          restDays,
          utilizationPct,
          estimatedForageLbPerAcre: forage,
          forecastRainInchesNext3d: rainNext3d,
          latestGrazedEndedAt: latestGraze?.endedAt ?? null,
        },
      });
    }
  }

  return out;
}

export async function landRoutes(app: FastifyInstance) {
  app.get("/land/subzones", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");

      const q = z.object({ zoneId: idSchema.optional() }).safeParse(req.query ?? {});
      if (!q.success) return sendError(reply, 400, "INVALID_QUERY", "Invalid subzones query", q.error.flatten());

      const where = q.data.zoneId
        ? and(eq(zoneSubzones.ranchId, ranchId), eq(zoneSubzones.zoneId, q.data.zoneId))
        : eq(zoneSubzones.ranchId, ranchId);

      const rows = await db.select().from(zoneSubzones).where(where).orderBy(asc(zoneSubzones.name));
      return reply.send({ subzones: rows });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "LIST_SUBZONES_FAILED", "Failed to list subzones");
    }
  });

  app.post("/land/subzones", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");

      const parsed = subzoneCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 400, "INVALID_SUBZONE_PAYLOAD", "Invalid subzone payload", parsed.error.flatten());
      }

      const id = uuid();
      const data = parsed.data;
      await db.insert(zoneSubzones).values({
        id,
        ranchId,
        zoneId: data.zoneId,
        name: data.name,
        description: data.description ?? null,
        status: data.status ?? "active",
        areaAcres: data.areaAcres != null ? String(data.areaAcres) : null,
        geom: data.geom ?? null,
        targetRestDays: data.targetRestDays ?? null,
      });

      return reply.status(201).send({ id });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "CREATE_SUBZONE_FAILED", "Failed to create subzone");
    }
  });

  app.get("/land/grazing-sessions", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");

      const query = z
        .object({
          zoneId: idSchema.optional(),
          herdId: idSchema.optional(),
          from: dateSchema.optional(),
          to: dateSchema.optional(),
        })
        .safeParse(req.query ?? {});
      if (!query.success) return sendError(reply, 400, "INVALID_QUERY", "Invalid grazing query", query.error.flatten());

      const clauses = [eq(grazingSessions.ranchId, ranchId)];
      if (query.data.zoneId) clauses.push(eq(grazingSessions.zoneId, query.data.zoneId));
      if (query.data.herdId) clauses.push(eq(grazingSessions.herdId, query.data.herdId));
      if (query.data.from) clauses.push(gte(grazingSessions.startedAt, new Date(`${query.data.from}T00:00:00.000Z`)));
      if (query.data.to) clauses.push(lte(grazingSessions.startedAt, new Date(`${query.data.to}T23:59:59.999Z`)));

      const rows = await db
        .select()
        .from(grazingSessions)
        .where(and(...clauses))
        .orderBy(desc(grazingSessions.startedAt));
      return reply.send({ sessions: rows });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "LIST_GRAZING_SESSIONS_FAILED", "Failed to list grazing sessions");
    }
  });

  app.post("/land/grazing-sessions", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");

      const parsed = grazingSessionCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 400, "INVALID_GRAZING_PAYLOAD", "Invalid grazing session payload", parsed.error.flatten());
      }

      const id = uuid();
      const data = parsed.data;
      await db.insert(grazingSessions).values({
        id,
        ranchId,
        zoneId: data.zoneId,
        subzoneId: data.subzoneId ?? null,
        herdId: data.herdId ?? null,
        headCount: data.headCount ?? null,
        stockDensityAuPerAcre: data.stockDensityAuPerAcre != null ? String(data.stockDensityAuPerAcre) : null,
        startedAt: new Date(data.startedAt),
        endedAt: data.endedAt ? new Date(data.endedAt) : null,
        notes: data.notes ?? null,
      });

      return reply.status(201).send({ id });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "CREATE_GRAZING_SESSION_FAILED", "Failed to create grazing session");
    }
  });

  app.get("/land/soil-samples", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");
      const query = z.object({ zoneId: idSchema.optional(), limit: z.coerce.number().int().min(1).max(500).optional() }).safeParse(req.query ?? {});
      if (!query.success) return sendError(reply, 400, "INVALID_QUERY", "Invalid soil query", query.error.flatten());

      const where = query.data.zoneId
        ? and(eq(soilSamples.ranchId, ranchId), eq(soilSamples.zoneId, query.data.zoneId))
        : eq(soilSamples.ranchId, ranchId);

      const rows = await db
        .select()
        .from(soilSamples)
        .where(where)
        .orderBy(desc(soilSamples.sampledAt))
        .limit(query.data.limit ?? 100);
      return reply.send({ soilSamples: rows });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "LIST_SOIL_SAMPLES_FAILED", "Failed to list soil samples");
    }
  });

  app.post("/land/soil-samples", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");
      const parsed = soilSampleCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 400, "INVALID_SOIL_SAMPLE_PAYLOAD", "Invalid soil sample payload", parsed.error.flatten());
      }

      const id = uuid();
      const data = parsed.data;
      await db.insert(soilSamples).values({
        id,
        ranchId,
        zoneId: data.zoneId,
        subzoneId: data.subzoneId ?? null,
        sampledAt: data.sampledAt,
        ph: data.ph != null ? String(data.ph) : null,
        organicMatterPct: data.organicMatterPct != null ? String(data.organicMatterPct) : null,
        nitrogenPpm: data.nitrogenPpm != null ? String(data.nitrogenPpm) : null,
        phosphorusPpm: data.phosphorusPpm != null ? String(data.phosphorusPpm) : null,
        potassiumPpm: data.potassiumPpm != null ? String(data.potassiumPpm) : null,
        moisturePct: data.moisturePct != null ? String(data.moisturePct) : null,
        notes: data.notes ?? null,
      });
      return reply.status(201).send({ id });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "CREATE_SOIL_SAMPLE_FAILED", "Failed to create soil sample");
    }
  });

  app.get("/land/forage-samples", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");
      const query = z.object({ zoneId: idSchema.optional(), limit: z.coerce.number().int().min(1).max(500).optional() }).safeParse(req.query ?? {});
      if (!query.success) return sendError(reply, 400, "INVALID_QUERY", "Invalid forage query", query.error.flatten());

      const where = query.data.zoneId
        ? and(eq(forageSamples.ranchId, ranchId), eq(forageSamples.zoneId, query.data.zoneId))
        : eq(forageSamples.ranchId, ranchId);

      const rows = await db
        .select()
        .from(forageSamples)
        .where(where)
        .orderBy(desc(forageSamples.sampledAt))
        .limit(query.data.limit ?? 100);
      return reply.send({ forageSamples: rows });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "LIST_FORAGE_SAMPLES_FAILED", "Failed to list forage samples");
    }
  });

  app.post("/land/forage-samples", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");
      const parsed = forageSampleCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 400, "INVALID_FORAGE_SAMPLE_PAYLOAD", "Invalid forage sample payload", parsed.error.flatten());
      }

      const id = uuid();
      const data = parsed.data;
      await db.insert(forageSamples).values({
        id,
        ranchId,
        zoneId: data.zoneId,
        subzoneId: data.subzoneId ?? null,
        sampledAt: data.sampledAt,
        speciesObserved: data.speciesObserved ?? null,
        biomassLbPerAcre: data.biomassLbPerAcre != null ? String(data.biomassLbPerAcre) : null,
        groundCoverPct: data.groundCoverPct != null ? String(data.groundCoverPct) : null,
        avgCanopyInches: data.avgCanopyInches != null ? String(data.avgCanopyInches) : null,
        notes: data.notes ?? null,
      });
      return reply.status(201).send({ id });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "CREATE_FORAGE_SAMPLE_FAILED", "Failed to create forage sample");
    }
  });

  app.get("/land/weather-daily", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");
      const query = z
        .object({
          zoneId: idSchema.optional(),
          from: dateSchema.optional(),
          to: dateSchema.optional(),
        })
        .safeParse(req.query ?? {});
      if (!query.success) return sendError(reply, 400, "INVALID_QUERY", "Invalid weather query", query.error.flatten());

      const clauses = [eq(zoneWeatherDaily.ranchId, ranchId)];
      if (query.data.zoneId) clauses.push(eq(zoneWeatherDaily.zoneId, query.data.zoneId));
      if (query.data.from) clauses.push(gte(zoneWeatherDaily.weatherDate, query.data.from));
      if (query.data.to) clauses.push(lte(zoneWeatherDaily.weatherDate, query.data.to));

      const rows = await db
        .select()
        .from(zoneWeatherDaily)
        .where(and(...clauses))
        .orderBy(desc(zoneWeatherDaily.weatherDate));
      return reply.send({ weatherDaily: rows });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "LIST_WEATHER_DAILY_FAILED", "Failed to list weather");
    }
  });

  app.post("/land/weather-daily", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");
      const parsed = weatherDailyCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 400, "INVALID_WEATHER_PAYLOAD", "Invalid weather payload", parsed.error.flatten());
      }

      const id = uuid();
      const data = parsed.data;
      await db.insert(zoneWeatherDaily).values({
        id,
        ranchId,
        zoneId: data.zoneId,
        subzoneId: data.subzoneId ?? null,
        weatherDate: data.weatherDate,
        minTempF: data.minTempF != null ? String(data.minTempF) : null,
        maxTempF: data.maxTempF != null ? String(data.maxTempF) : null,
        rainInches: data.rainInches != null ? String(data.rainInches) : null,
        forecastRainInchesNext3d:
          data.forecastRainInchesNext3d != null ? String(data.forecastRainInchesNext3d) : null,
        source: data.source ?? null,
      });
      return reply.status(201).send({ id });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "CREATE_WEATHER_DAILY_FAILED", "Failed to create weather row");
    }
  });

  app.get("/land/zone-daily-states", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");
      const query = z
        .object({
          zoneId: idSchema.optional(),
          date: dateSchema.optional(),
          limit: z.coerce.number().int().min(1).max(500).optional(),
        })
        .safeParse(req.query ?? {});
      if (!query.success) return sendError(reply, 400, "INVALID_QUERY", "Invalid zone state query", query.error.flatten());

      const clauses = [eq(zoneDailyStates.ranchId, ranchId)];
      if (query.data.zoneId) clauses.push(eq(zoneDailyStates.zoneId, query.data.zoneId));
      if (query.data.date) clauses.push(eq(zoneDailyStates.stateDate, query.data.date));

      const rows = await db
        .select()
        .from(zoneDailyStates)
        .where(and(...clauses))
        .orderBy(desc(zoneDailyStates.stateDate))
        .limit(query.data.limit ?? 100);

      return reply.send({ zoneDailyStates: rows });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "LIST_ZONE_STATES_FAILED", "Failed to list zone daily states");
    }
  });

  app.post("/land/zone-daily-states", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");
      const parsed = zoneStateCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 400, "INVALID_ZONE_STATE_PAYLOAD", "Invalid zone state payload", parsed.error.flatten());
      }

      const id = uuid();
      const data = parsed.data;
      await db.insert(zoneDailyStates).values({
        id,
        ranchId,
        zoneId: data.zoneId,
        subzoneId: data.subzoneId ?? null,
        stateDate: data.stateDate,
        restDays: data.restDays ?? null,
        estimatedForageLbPerAcre:
          data.estimatedForageLbPerAcre != null ? String(data.estimatedForageLbPerAcre) : null,
        utilizationPct: data.utilizationPct != null ? String(data.utilizationPct) : null,
        moistureStressScore: data.moistureStressScore ?? null,
        recoveryStage: data.recoveryStage ?? null,
        needsRest: data.needsRest ?? null,
        notes: data.notes ?? null,
      });
      return reply.status(201).send({ id });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "CREATE_ZONE_STATE_FAILED", "Failed to create zone daily state");
    }
  });

  app.get("/land/recommendations", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");
      const query = z
        .object({
          zoneId: idSchema.optional(),
          recommendationDate: dateSchema.optional(),
          status: z.enum(["open", "accepted", "dismissed", "completed"]).optional(),
        })
        .safeParse(req.query ?? {});
      if (!query.success) return sendError(reply, 400, "INVALID_QUERY", "Invalid recommendations query", query.error.flatten());

      const clauses = [eq(landRecommendations.ranchId, ranchId)];
      if (query.data.zoneId) clauses.push(eq(landRecommendations.zoneId, query.data.zoneId));
      if (query.data.recommendationDate) clauses.push(eq(landRecommendations.recommendationDate, query.data.recommendationDate));
      if (query.data.status) clauses.push(eq(landRecommendations.status, query.data.status));

      const rows = await db
        .select()
        .from(landRecommendations)
        .where(and(...clauses))
        .orderBy(desc(landRecommendations.recommendationDate), desc(landRecommendations.createdAt));
      return reply.send({ recommendations: rows });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "LIST_RECOMMENDATIONS_FAILED", "Failed to list recommendations");
    }
  });

  app.post("/land/recommendations/generate", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");
      const parsed = recommendationGenerateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 400, "INVALID_RECOMMENDATION_PAYLOAD", "Invalid recommendation request", parsed.error.flatten());
      }

      const recommendationDate = toIsoDateOrToday(parsed.data.recommendationDate);
      const preview = await buildRecommendations(
        ranchId,
        recommendationDate,
        parsed.data.zoneId,
        parsed.data.subzoneId
      );

      if (parsed.data.persist && preview.length > 0) {
        await db.insert(landRecommendations).values(
          preview.map((r) => ({
            id: uuid(),
            ranchId: r.ranchId,
            zoneId: r.zoneId,
            subzoneId: r.subzoneId,
            recommendationDate: r.recommendationDate,
            recommendationType: r.recommendationType,
            priority: r.priority,
            title: r.title,
            rationale: r.rationale,
            actionByDate: r.actionByDate,
            confidenceScore: String(r.confidenceScore),
            status: "open",
            metadata: r.metadata,
          }))
        );
      }

      return reply.send({ recommendations: preview, persisted: parsed.data.persist });
    } catch (err: unknown) {
      return logAndSendInternalError(
        req,
        reply,
        err,
        "GENERATE_RECOMMENDATIONS_FAILED",
        "Failed to generate recommendations"
      );
    }
  });

  app.patch("/land/recommendations/:id/status", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return sendError(reply, 400, "NO_RANCH_SELECTED", "No ranch selected");
      const params = z.object({ id: idSchema }).safeParse(req.params ?? {});
      if (!params.success) return sendError(reply, 400, "INVALID_PARAMS", "Invalid recommendation id", params.error.flatten());
      const body = recommendationStatusSchema.safeParse(req.body ?? {});
      if (!body.success) return sendError(reply, 400, "INVALID_PAYLOAD", "Invalid recommendation status", body.error.flatten());

      await db
        .update(landRecommendations)
        .set({ status: body.data.status })
        .where(and(eq(landRecommendations.id, params.data.id), eq(landRecommendations.ranchId, ranchId)));

      return reply.send({ success: true });
    } catch (err: unknown) {
      return logAndSendInternalError(req, reply, err, "UPDATE_RECOMMENDATION_FAILED", "Failed to update recommendation");
    }
  });
}
