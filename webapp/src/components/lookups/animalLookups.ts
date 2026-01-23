// Single source of truth for animal domain dropdowns.
// Used by: herd creation, animal intake, inventory filters.

export type AnimalSpecies =
  | "cattle"
  | "bison"
  | "sheep"
  | "goat"
  | "horse"
  | "mixed"
  | "other";

export interface BreedOption {
  value: string;
  label: string;
}

// ---- Species ----

export const ANIMAL_SPECIES: Array<{ value: AnimalSpecies; label: string }> = [
  { value: "cattle", label: "Cattle" },
  { value: "bison", label: "Bison" },
  { value: "sheep", label: "Sheep" },
  { value: "goat", label: "Goat" },
  { value: "horse", label: "Horse" },
  { value: "mixed", label: "Mixed Group" },
  { value: "other", label: "Other" },
];

// ---- Breeds (grouped by species) ----
// NOTE:
// - values are normalized, stable identifiers for storage
// - labels are user-facing
// - lists are intentionally explicit (clarity > DRY)

export const BREEDS_BY_SPECIES: Record<AnimalSpecies, BreedOption[]> = {
  cattle: [
    { value: "angus", label: "Angus" },
    { value: "hereford", label: "Hereford" },
    { value: "charolais", label: "Charolais" },
    { value: "limousin", label: "Limousin" },
    { value: "simmental", label: "Simmental" },
    { value: "brahman", label: "Brahman" },
    { value: "buelingo", label: "Buelingo" },
    { value: "mixed", label: "Mixed / Crossbred" },
    { value: "other", label: "Other" },
  ],

  bison: [
    { value: "plains_bison", label: "Plains Bison" },
    { value: "wood_bison", label: "Wood Bison" },
    { value: "mixed", label: "Mixed / Crossbred" },
    { value: "other", label: "Other" },
  ],

  sheep: [
    { value: "dorper", label: "Dorper" },
    { value: "katahdin", label: "Katahdin" },
    { value: "suffolk", label: "Suffolk" },
    { value: "hampshire", label: "Hampshire" },
    { value: "merino", label: "Merino" },
    { value: "mixed", label: "Mixed / Crossbred" },
    { value: "other", label: "Other" },
  ],

  goat: [
    { value: "boer", label: "Boer" },
    { value: "kiko", label: "Kiko" },
    { value: "nubian", label: "Nubian" },
    { value: "lamancha", label: "LaMancha" },
    { value: "alpine", label: "Alpine" },
    { value: "mixed", label: "Mixed / Crossbred" },
    { value: "other", label: "Other" },
  ],

  horse: [
    { value: "quarter_horse", label: "Quarter Horse" },
    { value: "thoroughbred", label: "Thoroughbred" },
    { value: "arabian", label: "Arabian" },
    { value: "paint", label: "Paint" },
    { value: "appaloosa", label: "Appaloosa" },
    { value: "mixed", label: "Mixed / Crossbred" },
    { value: "other", label: "Other" },
  ],

  mixed: [{ value: "mixed", label: "Mixed" }],

  other: [{ value: "other", label: "Other" }],
};

// ---- Helpers ----

export function getBreedsForSpecies(species: AnimalSpecies): BreedOption[] {
  return BREEDS_BY_SPECIES[species] ?? [];
}
