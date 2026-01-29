// webapp/src/modules/herd-management/pages/AnimalIntakeBirthBatchPage.tsx
import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ROUTES } from "@/routes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

type LocationState = {
  species: string;
  gaveBirthDate: string; // YYYY-MM-DD
  totalBabies: number;
  selectedDamIds: string[];
  selectedDamsPreview?: Array<{ animalId: string; display: string; species: string }>;
};

type BabyDraft = {
  index: number; // 1..N
  nickname: string;
  sex: "unknown" | "female" | "male";
  tagNumber: string;
  tagColor: string; // optional later
  tagEar: "unknown" | "left" | "right";
  stillborn: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function makeDefaultTag(date: string, index: number) {
  // Requirement: YYYY-MM-DD-xx (xx with leading zeros). Works up to 100: 100 stays "100".
  return `${date}-${pad2(index)}`;
}

export default function AnimalIntakeBirthBatchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Redirect if user lands here without navigation state (refresh/bookmark/direct URL).
  React.useEffect(() => {
    if (!location.state) {
      navigate(ROUTES.herd.animals, { replace: true });
    }
  }, [location.state, navigate]);

  if (!location.state) {
    // While redirecting
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Birth batch</CardTitle>
            <CardDescription>Redirecting…</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Returning to inventory.
          </CardContent>
        </Card>
      </div>
    );
  }

  const state = location.state as LocationState;

  const [saving, setSaving] = React.useState(false);

  const [babies, setBabies] = React.useState<BabyDraft[]>(() => {
    const total = Math.max(1, Math.min(100, Number(state.totalBabies || 1)));
    const date = state.gaveBirthDate || "";
    return Array.from({ length: total }, (_, i) => {
      const idx = i + 1;
      return {
        index: idx,
        nickname: "",
        sex: "unknown",
        tagNumber: date ? makeDefaultTag(date, idx) : String(idx),
        tagColor: "",
        tagEar: "unknown",
        stillborn: false,
      };
    });
  });

  React.useEffect(() => {
    const total = Math.max(1, Math.min(100, Number(state.totalBabies || 1)));
    const date = state.gaveBirthDate || "";
    setBabies(
      Array.from({ length: total }, (_, i) => {
        const idx = i + 1;
        return {
          index: idx,
          nickname: "",
          sex: "unknown",
          tagNumber: date ? makeDefaultTag(date, idx) : String(idx),
          tagColor: "",
          tagEar: "unknown",
          stillborn: false,
        };
      })
    );
  }, [state.totalBabies, state.gaveBirthDate]);

  function updateBaby(index: number, patch: Partial<BabyDraft>) {
    setBabies((prev) => prev.map((b) => (b.index === index ? { ...b, ...patch } : b)));
  }

  function validate(): string | null {
    if (!state.species) return "Missing species.";
    if (!state.gaveBirthDate || !/^\d{4}-\d{2}-\d{2}$/.test(state.gaveBirthDate)) {
      return "Missing or invalid birth date.";
    }
    if (!Array.isArray(state.selectedDamIds) || state.selectedDamIds.length === 0) return "No dams selected.";
    if (babies.length < 1 || babies.length > 100) return "Invalid baby count.";

    for (const b of babies) {
      if (!b.tagNumber.trim()) {
        return `Baby #${b.index}: tag number is required (defaults to YYYY-MM-DD-xx).`;
      }
      if (b.tagNumber.length > 50) {
        return `Baby #${b.index}: tag number is too long.`;
      }
    }

    return null;
  }

  async function onSubmit() {
    const err = validate();
    if (err) {
      toast({
        title: "Fix a few things",
        description: err,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // UI-only increment:
      // Next increment will POST:
      // - female_productivity rows for selected dams
      // - batch insert of N baby animals
      const payloadPreview = {
        species: state.species,
        gaveBirthDate: state.gaveBirthDate,
        selectedDamIds: state.selectedDamIds,
        babies: babies.map((b) => ({
          tagNumber: b.tagNumber.trim(),
          nickname: b.nickname.trim() || null,
          sex: b.sex === "unknown" ? null : b.sex,
          tagColor: b.tagColor || null,
          tagEar: b.tagEar === "unknown" ? null : b.tagEar,
          stillborn: b.stillborn,
        })),
      };

      toast({
        title: "Batch ready (UI only)",
        description: "Next increment wires the backend calls.",
      });

      // eslint-disable-next-line no-console
      console.log("Birth batch payload preview:", payloadPreview);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Birth Intake — Batch</h1>
          <p className="text-sm text-muted-foreground">
            Create {babies.length} newborn record(s). Tag number defaults to YYYY-MM-DD-xx and can be updated later.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(ROUTES.herd.animals)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Saving…" : "Save babies"}
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Summary</CardTitle>
          <CardDescription>
            Species: <span className="font-medium text-foreground">{state.species}</span> • Date:{" "}
            <span className="font-medium text-foreground">{state.gaveBirthDate}</span> • Dams selected:{" "}
            <span className="font-medium text-foreground">{state.selectedDamIds.length}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {state.selectedDamsPreview?.length ? (
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {state.selectedDamsPreview.map((d) => (
                <li key={d.animalId}>
                  <span className="text-foreground">{d.display}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">
              (Dam preview not available — IDs will still be sent to backend in the next increment.)
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {babies.map((b) => (
          <Card key={b.index} className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Baby #{b.index}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Tag number</div>
                <Input
                  value={b.tagNumber}
                  onChange={(e) => updateBaby(b.index, { tagNumber: e.target.value })}
                  aria-label={`Baby ${b.index} tag number`}
                />
                <div className="text-xs text-muted-foreground">
                  Defaults to {makeDefaultTag(state.gaveBirthDate, b.index)}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Nickname (optional)</div>
                <Input
                  value={b.nickname}
                  onChange={(e) => updateBaby(b.index, { nickname: e.target.value })}
                  aria-label={`Baby ${b.index} nickname`}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Sex (optional)</div>
                <Select value={b.sex} onValueChange={(v) => updateBaby(b.index, { sex: v as BabyDraft["sex"] })}>
                  <SelectTrigger aria-label={`Baby ${b.index} sex`}>
                    <SelectValue placeholder="Select sex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Tag color (optional)</div>
                <Select
                  value={b.tagColor || "none"}
                  onValueChange={(v) => updateBaby(b.index, { tagColor: v === "none" ? "" : v })}
                >
                  <SelectTrigger aria-label={`Baby ${b.index} tag color`}>
                    <SelectValue placeholder="Select color" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    <SelectItem value="white">White</SelectItem>
                    <SelectItem value="yellow">Yellow</SelectItem>
                    <SelectItem value="green">Green</SelectItem>
                    <SelectItem value="blue">Blue</SelectItem>
                    <SelectItem value="red">Red</SelectItem>
                    <SelectItem value="orange">Orange</SelectItem>
                    <SelectItem value="pink">Pink</SelectItem>
                    <SelectItem value="purple">Purple</SelectItem>
                    <SelectItem value="black">Black</SelectItem>
                    <SelectItem value="brown">Brown</SelectItem>
                    <SelectItem value="gray">Gray</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Tag ear (optional)</div>
                <Select value={b.tagEar} onValueChange={(v) => updateBaby(b.index, { tagEar: v as BabyDraft["tagEar"] })}>
                  <SelectTrigger aria-label={`Baby ${b.index} tag ear`}>
                    <SelectValue placeholder="Select ear" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Stillborn</div>
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    checked={b.stillborn}
                    onCheckedChange={(v) => updateBaby(b.index, { stillborn: Boolean(v) })}
                    aria-label={`Baby ${b.index} stillborn`}
                  />
                  <span className="text-sm text-muted-foreground">
                    Creates the animal record. Later we’ll set stillborn + death_date to keep the main herd list “live only”.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(ROUTES.herd.animals)} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={saving}>
          {saving ? "Saving…" : "Save babies"}
        </Button>
      </div>
    </div>
  );
}
