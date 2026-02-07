import { v4 as uuid } from "uuid";
import { db } from "../db";
import { animalHerdMembership, animalTagHistory, animals, herds } from "../db/schema";

// ===== CONFIG =====
const RANCH_ID = "6ece06fe-8b1c-426f-995d-a1a3ba75a083";
const USER_ID = "445597b8-87e2-463b-bc3a-231e373d1c1d";

// Herd setup
const HERD_DEFS = [
  { name: "Alpacas — Barn Crew", species: "Alpacas", breed: "fuzzybois" },
  { name: "Alpacas — North Paddock", species: "Alpacas", breed: "huacaya-mix" },
  { name: "Bison — Main Herd", species: "Bison", breed: "mixed" },
  { name: "Mixed", species: "Mixed", breed: null as string | null },
] as const;

// Animal volumes
const TARGETS = {
  alpacas: 60,
  bison: 35,
  mixed: 5,
} as const;

// ===== HELPERS =====
function pad3(n: number) {
  const s = String(n);
  if (s.length >= 3) return s;
  return "0".repeat(3 - s.length) + s;
}

function randInt(min: number, max: number) {
  // inclusive min/max
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function randomBool(probTrue: number) {
  return Math.random() < probTrue;
}

function dateYearsAgo(minYears: number, maxYears: number): string {
  // returns YYYY-MM-DD
  const yearsAgo = randInt(minYears, maxYears);
  const now = new Date();
  const d = new Date(now.getFullYear() - yearsAgo, randInt(0, 11), randInt(1, 28));
  return d.toISOString().slice(0, 10);
}

function dateMonthsAgo(minMonths: number, maxMonths: number): string {
  const monthsAgo = randInt(minMonths, maxMonths);
  const now = new Date();
  const d = new Date(now);
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(randInt(1, 28));
  return d.toISOString().slice(0, 10);
}

type NewHerd = {
  id: string;
  ranchId: string;
  name: string;
  species: string | null;
  breed: string | null;
  shortDescription: string | null;
  longDescription: string | null;
};

type NewAnimal = {
  id: string;

  // we generate this for animal_tag_history, not for animals.tag
  generatedTag: string;

  notes: string | null;

  species: string | null;
  breed: string | null;
  sex: string | null;

  birthDate: string | null;
  birthDateIsEstimated: boolean;

  status: string; // required in schema
  statusChangedAt: Date | null;

  damAnimalId: string | null;
  sireAnimalId: string | null;

  neutered: boolean;
  neuteredDate: string | null;
};

type NewMembership = {
  id: string;
  animalId: string;
  herdId: string;
  endAt: Date | null;
};

type NewTagHistory = {
  id: string;
  animalId: string;
  tagNumber: string;
  tagColor: string | null;
  tagEar: string | null;
  changeReason: string | null;
  changedBy: string | null;
  startAt: Date;
  endAt: Date | null;
};

async function main() {
  console.log("🌱 Seeding test data...");
  console.log("Ranch:", RANCH_ID);

  // ---- 1) Create herds ----
  const newHerds: NewHerd[] = HERD_DEFS.map((h) => ({
    id: uuid(),
    ranchId: RANCH_ID,
    name: h.name,
    species: h.species ?? null,
    breed: h.breed ?? null,
    shortDescription: null,
    longDescription: null,
  }));

  console.log(`Creating ${newHerds.length} herds...`);
  await db.insert(herds).values(
    newHerds.map((h) => ({
      id: h.id,
      ranchId: h.ranchId,
      name: h.name,
      shortDescription: h.shortDescription,
      species: h.species,
      breed: h.breed,
      longDescription: h.longDescription,
      // createdAt defaultNow()
    }))
  );

  const alpacaHerd1 = newHerds[0];
  const alpacaHerd2 = newHerds[1];
  const bisonHerd = newHerds[2];
  const mixedHerd = newHerds[3];

  // ---- 2) Create animals ----
  const sexValues = ["male", "female"] as const;

  const newAnimals: NewAnimal[] = [];

  // Alpacas (spread across two herds)
  for (let i = 1; i <= TARGETS.alpacas; i++) {
    const id = uuid();
    const sex = randomChoice(sexValues);
    const neutered = sex === "male" ? randomBool(0.25) : randomBool(0.05);

    newAnimals.push({
      id,
      generatedTag: `ALP-${pad3(i)}`,
      notes: randomBool(0.15) ? "Seeded test animal" : null,
      species: "Alpacas",
      breed: randomChoice(["fuzzybois", "huacaya-mix", "suri-mix"] as const),
      sex,
      birthDate: dateYearsAgo(0, 9),
      birthDateIsEstimated: randomBool(0.35),
      status: "active",
      statusChangedAt: null,
      damAnimalId: null,
      sireAnimalId: null,
      neutered,
      neuteredDate: neutered ? dateMonthsAgo(3, 48) : null,
    });
  }

  // Bison
  for (let i = 1; i <= TARGETS.bison; i++) {
    const id = uuid();
    const sex = randomChoice(sexValues);
    const neutered = sex === "male" ? randomBool(0.08) : randomBool(0.02);

    newAnimals.push({
      id,
      generatedTag: `BIS-${pad3(i)}`,
      notes: randomBool(0.12) ? "Seeded test animal" : null,
      species: "Bison",
      breed: randomChoice(["mixed", "plains", "wood"] as const),
      sex,
      birthDate: dateYearsAgo(0, 14),
      birthDateIsEstimated: randomBool(0.25),
      status: "active",
      statusChangedAt: null,
      damAnimalId: null,
      sireAnimalId: null,
      neutered,
      neuteredDate: neutered ? dateMonthsAgo(6, 84) : null,
    });
  }

  // Mixed herd animals
  for (let i = 1; i <= TARGETS.mixed; i++) {
    const id = uuid();
    const sex = randomChoice(sexValues);
    const neutered = sex === "male" ? randomBool(0.2) : randomBool(0.05);

    newAnimals.push({
      id,
      generatedTag: `MIX-${pad3(i)}`,
      notes: "Mixed herd test animal",
      // For mixed herds, we avoid lying about species/breed unless you want it.
      species: null,
      breed: null,
      sex,
      birthDate: dateYearsAgo(0, 10),
      birthDateIsEstimated: randomBool(0.4),
      status: "active",
      statusChangedAt: null,
      damAnimalId: null,
      sireAnimalId: null,
      neutered,
      neuteredDate: neutered ? dateMonthsAgo(3, 60) : null,
    });
  }

  console.log(`Creating ${newAnimals.length} animals...`);
  await db.insert(animals).values(
    newAnimals.map((a) => ({
      id: a.id,

      // IMPORTANT:
      // We are intentionally NOT relying on animals.tag anymore.
      // Leave it null/omitted so you can drop the column safely later.
      tag: null,

      notes: a.notes,
      species: a.species,
      breed: a.breed,
      sex: a.sex,
      birthDate: a.birthDate,
      birthDateIsEstimated: a.birthDateIsEstimated,
      status: a.status,
      statusChangedAt: a.statusChangedAt,
      damAnimalId: a.damAnimalId,
      sireAnimalId: a.sireAnimalId,
      neutered: a.neutered,
      neuteredDate: a.neuteredDate,
      // createdAt/updatedAt defaultNow()
    }))
  );

  // ---- 3) Create memberships ----
  const memberships: NewMembership[] = [];

  let alpacaIndex = 0;
  const alpacaAnimals = newAnimals.filter((a) => a.generatedTag.startsWith("ALP-"));
  const bisonAnimals = newAnimals.filter((a) => a.generatedTag.startsWith("BIS-"));
  const mixedAnimals = newAnimals.filter((a) => a.generatedTag.startsWith("MIX-"));

  // distribute alpacas ~50/50 across the two herds
  for (const a of alpacaAnimals) {
    alpacaIndex += 1;
    const herdId = alpacaIndex % 2 === 0 ? alpacaHerd2.id : alpacaHerd1.id;
    memberships.push({
      id: uuid(),
      animalId: a.id,
      herdId,
      endAt: null,
    });
  }

  for (const a of bisonAnimals) {
    memberships.push({
      id: uuid(),
      animalId: a.id,
      herdId: bisonHerd.id,
      endAt: null,
    });
  }

  for (const a of mixedAnimals) {
    memberships.push({
      id: uuid(),
      animalId: a.id,
      herdId: mixedHerd.id,
      endAt: null,
    });
  }

  console.log(`Creating ${memberships.length} herd memberships...`);
  await db.insert(animalHerdMembership).values(
    memberships.map((m) => ({
      id: m.id,
      animalId: m.animalId,
      herdId: m.herdId,
      endAt: m.endAt,
      // startAt defaultNow()
      // createdAt defaultNow()
    }))
  );

  // ---- 4) Create animal tag history (current tags) ----
  const tagColors = ["yellow", "orange", "green", "blue", "white", "red"] as const;
  const tagEars = ["left", "right"] as const;

  const now = new Date();

  const tagRows: NewTagHistory[] = newAnimals.map((a) => ({
    id: uuid(),
    animalId: a.id,
    tagNumber: a.generatedTag,
    tagColor: randomBool(0.85) ? randomChoice(tagColors) : null,
    tagEar: randomBool(0.9) ? randomChoice(tagEars) : null,
    changeReason: "Initial tag assignment (seed)",
    changedBy: USER_ID,
    startAt: now,
    endAt: null,
  }));

  console.log(`Creating ${tagRows.length} animal_tag_history rows (current tags)...`);
  await db.insert(animalTagHistory).values(
    tagRows.map((t) => ({
      id: t.id,
      animalId: t.animalId,
      tagNumber: t.tagNumber,
      tagColor: t.tagColor,
      tagEar: t.tagEar,
      changeReason: t.changeReason,
      changedBy: t.changedBy,
      startAt: t.startAt,
      endAt: t.endAt,
      // createdAt defaultNow()
    }))
  );

  console.log("✅ Seed complete!");
  console.log("Herds created:");
  for (const h of newHerds) {
    console.log(`- ${h.name} (${h.species ?? "—"}${h.breed ? ` • ${h.breed}` : ""}) id=${h.id}`);
  }
  console.log(`Animals created: ${newAnimals.length}`);
  console.log(`Memberships created: ${memberships.length}`);
  console.log(`Tag history created: ${tagRows.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
