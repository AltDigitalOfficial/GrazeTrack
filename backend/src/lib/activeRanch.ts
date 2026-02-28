import { and, desc, eq } from "drizzle-orm";

import { db } from "../db";
import { userRanches, users } from "../db/schema";

/**
 * Resolve active ranch for a user.
 * - Prefer users.active_ranch_id if it still matches membership.
 * - Fallback to most-recent membership.
 * - Auto-heal users.active_ranch_id when fallback is used.
 */
export async function getActiveRanchIdForUser(userId: string): Promise<string | null> {
  try {
    const userRows = await db
      .select({ activeRanchId: users.activeRanchId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const activeRanchId = userRows[0]?.activeRanchId ?? null;

    if (activeRanchId) {
      const membership = await db
        .select({ ranchId: userRanches.ranchId })
        .from(userRanches)
        .where(and(eq(userRanches.userId, userId), eq(userRanches.ranchId, activeRanchId)))
        .limit(1);

      if (membership.length > 0) return activeRanchId;
    }
  } catch {
    // Fallback path for environments that have not yet applied users.active_ranch_id migration.
  }

  const fallback = await db
    .select({ ranchId: userRanches.ranchId })
    .from(userRanches)
    .where(eq(userRanches.userId, userId))
    .orderBy(desc(userRanches.createdAt))
    .limit(1);

  const fallbackRanchId = fallback[0]?.ranchId ?? null;
  if (!fallbackRanchId) return null;

  try {
    await db
      .update(users)
      .set({ activeRanchId: fallbackRanchId })
      .where(eq(users.id, userId));
  } catch {
    // Ignore backfill failures when active_ranch_id column is unavailable.
  }

  return fallbackRanchId;
}

export async function setActiveRanchIdForUser(userId: string, ranchId: string | null): Promise<string | null> {
  if (ranchId) {
    const membership = await db
      .select({ ranchId: userRanches.ranchId })
      .from(userRanches)
      .where(and(eq(userRanches.userId, userId), eq(userRanches.ranchId, ranchId)))
      .limit(1);
    if (membership.length === 0) {
      throw new Error("Forbidden: ranch is not in user memberships");
    }
  }

  try {
    await db
      .update(users)
      .set({ activeRanchId: ranchId })
      .where(eq(users.id, userId));
  } catch {
    // If migration is missing, keep legacy behavior without persisted active pointer.
  }

  return ranchId;
}
