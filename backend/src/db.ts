import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const client = postgres("postgres://postgres:devpass@localhost:5432/grazetrack");

export const db = drizzle(client);