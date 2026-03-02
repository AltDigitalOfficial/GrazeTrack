import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";

import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { EquipmentAssetsResponseSchema, type EquipmentAssetRow } from "@/lib/contracts/equipment";
import {
  WorkingDayDeleteResponseSchema,
  WorkingDayEquipmentNeedResponseSchema,
  WorkingDayPlanCreateResponseSchema,
  WorkingDayPlanInventoryResponseSchema,
  WorkingDayPlanItemResponseSchema,
  WorkingDayPlanResponseSchema,
  WorkingDaySupplyNeedResponseSchema,
  type WorkingDayPlanCategory,
  type WorkingDayPlanInventoryResponse,
  type WorkingDayPlanItem,
  type WorkingDayPlanItemStatus,
  type WorkingDayPlanResponse,
  type WorkingDaySupplyType,
  type WorkingDayTaskCatalogItem,
} from "@/lib/contracts/workingDay";
import { useRanch } from "@/lib/ranchContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const HerdListSchema = z.array(
  z.object({
    id: z.string().uuid(),
    name: z.string(),
  })
);

const AnimalListSchema = z.object({
  animals: z.array(
    z.object({
      animalId: z.string().uuid(),
      tagNumber: z.string().nullable().optional(),
      species: z.string().nullable().optional(),
      breed: z.string().nullable().optional(),
    })
  ),
});

type ItemFormState = {
  category: WorkingDayPlanCategory;
  taskType: string;
  title: string;
  status: WorkingDayPlanItemStatus;
  startTime: string;
  endTime: string;
  herdId: string;
  animalId: string;
  locationText: string;
  notes: string;
  applySuggestedNeeds: boolean;
};

type SupplyNeedFormState = {
  planItemId: string;
  supplyType: WorkingDaySupplyType;
  linkedEntityType: string;
  linkedEntityId: string;
  nameOverride: string;
  requiredQuantity: string;
  unit: string;
  notes: string;
};

type EquipmentNeedFormState = {
  planItemId: string;
  assetId: string;
  assetTypeHint: string;
  mustBeOperational: boolean;
  notes: string;
};

const CATEGORIES: WorkingDayPlanCategory[] = ["HERD_WORK", "ANIMAL_WORK", "RANCH_WORK"];
const STATUSES: WorkingDayPlanItemStatus[] = ["PLANNED", "IN_PROGRESS", "DONE", "SKIPPED"];
const SUPPLY_TYPES: WorkingDaySupplyType[] = ["MEDICATION", "FEED", "ADDITIVE", "FUEL_FLUID", "PART_SUPPLY", "OTHER"];
const LINKED_TYPES = ["FEED_COMPONENT", "FEED_BLEND", "MEDICATION_STANDARD", "FUEL_PRODUCT", "EQUIPMENT_PART", "OTHER"] as const;
const PLAN_INVENTORY_WINDOWS = [
  { value: 7, label: "Weekly" },
  { value: 14, label: "Two Weeks" },
  { value: 30, label: "Monthly" },
] as const;
type PlanInventoryWindowDays = (typeof PLAN_INVENTORY_WINDOWS)[number]["value"];

function enumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function tomorrowIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatPlanDateLabel(isoDate: string): string {
  const parts = isoDate.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return isoDate;
  const [yyyy, mm, dd] = parts;
  const date = new Date(yyyy, mm - 1, dd);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function asCategory(value: unknown): WorkingDayPlanCategory {
  return value === "HERD_WORK" || value === "ANIMAL_WORK" || value === "RANCH_WORK" ? value : "RANCH_WORK";
}

function asStatus(value: unknown): WorkingDayPlanItemStatus {
  return value === "PLANNED" || value === "IN_PROGRESS" || value === "DONE" || value === "SKIPPED" ? value : "PLANNED";
}

function taskOptions(taskCatalog: WorkingDayTaskCatalogItem[], category: WorkingDayPlanCategory): WorkingDayTaskCatalogItem[] {
  return taskCatalog
    .filter((t) => asCategory(t.category) === category)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

function firstTaskType(taskCatalog: WorkingDayTaskCatalogItem[], category: WorkingDayPlanCategory): string {
  return taskOptions(taskCatalog, category)[0]?.taskType ?? "OTHER_TASK";
}

function emptyItemForm(taskCatalog: WorkingDayTaskCatalogItem[], category: WorkingDayPlanCategory = "HERD_WORK"): ItemFormState {
  return {
    category,
    taskType: firstTaskType(taskCatalog, category),
    title: "",
    status: "PLANNED",
    startTime: "",
    endTime: "",
    herdId: "",
    animalId: "",
    locationText: "",
    notes: "",
    applySuggestedNeeds: true,
  };
}

function emptySupplyNeed(planItemId = ""): SupplyNeedFormState {
  return {
    planItemId,
    supplyType: "OTHER",
    linkedEntityType: "",
    linkedEntityId: "",
    nameOverride: "",
    requiredQuantity: "",
    unit: "",
    notes: "",
  };
}

function emptyEquipmentNeed(planItemId = ""): EquipmentNeedFormState {
  return {
    planItemId,
    assetId: "",
    assetTypeHint: "",
    mustBeOperational: true,
    notes: "",
  };
}

function needLabel(need: WorkingDayPlanItem["supplyNeeds"][number]): string {
  if (need.nameOverride?.trim()) return need.nameOverride.trim();
  if (need.linkedEntityType?.trim()) return `${enumLabel(need.linkedEntityType)} (${need.linkedEntityId ?? "unlinked"})`;
  return "Supply need";
}

export default function WorkingDayPlanPage() {
  const { toast } = useToast();
  const { activeRanchId, loading: ranchLoading } = useRanch();

  const [planDate, setPlanDate] = useState(tomorrowIsoDate());
  const [planData, setPlanData] = useState<WorkingDayPlanResponse | null>(null);
  const [planInventory, setPlanInventory] = useState<WorkingDayPlanInventoryResponse | null>(null);
  const [herds, setHerds] = useState<Array<{ id: string; name: string }>>([]);
  const [animals, setAnimals] = useState<Array<{ id: string; label: string }>>([]);
  const [assets, setAssets] = useState<EquipmentAssetRow[]>([]);

  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingPlanInventory, setLoadingPlanInventory] = useState(false);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planInventoryError, setPlanInventoryError] = useState<string | null>(null);
  const [planInventoryWindowDays, setPlanInventoryWindowDays] = useState<PlanInventoryWindowDays>(7);

  const [planPromptOpen, setPlanPromptOpen] = useState(false);
  const [planPromptDate, setPlanPromptDate] = useState(tomorrowIsoDate());

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyItemForm([]));
  const [additionalTaskTypes, setAdditionalTaskTypes] = useState<string[]>([]);
  const [itemError, setItemError] = useState<string | null>(null);

  const [supplyDialogOpen, setSupplyDialogOpen] = useState(false);
  const [editingSupplyId, setEditingSupplyId] = useState<string | null>(null);
  const [supplyForm, setSupplyForm] = useState<SupplyNeedFormState>(emptySupplyNeed());
  const [supplyError, setSupplyError] = useState<string | null>(null);

  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [equipmentForm, setEquipmentForm] = useState<EquipmentNeedFormState>(emptyEquipmentNeed());
  const [equipmentError, setEquipmentError] = useState<string | null>(null);

  const taskCatalog = useMemo(() => planData?.taskCatalog ?? [], [planData?.taskCatalog]);
  const canInteract = !ranchLoading && !!activeRanchId && !saving && !loadingPlan;
  const proposedDateLabel = useMemo(() => formatPlanDateLabel(planDate), [planDate]);

  const tasksForSelectedCategory = useMemo(
    () => taskOptions(taskCatalog, itemForm.category),
    [taskCatalog, itemForm.category]
  );

  const grouped = useMemo(() => {
    const all = [...(planData?.items ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return CATEGORIES.map((category) => ({
      category,
      items: all.filter((item) => asCategory(item.category) === category),
    }));
  }, [planData?.items]);

  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const supplyReadinessByNeedId = useMemo(
    () => new Map((planData?.readiness.supplies.needs ?? []).map((need) => [need.id, need])),
    [planData?.readiness.supplies.needs]
  );

  async function loadReferences() {
    if (!activeRanchId) {
      setHerds([]);
      setAnimals([]);
      setAssets([]);
      return;
    }
    setLoadingRefs(true);
    try {
      const [herdsRaw, animalsRaw, assetsRaw] = await Promise.all([
        apiGet("/herds"),
        apiGet("/animals"),
        apiGet("/equipment/assets?limit=200&sort=NAME_ASC"),
      ]);
      const parsedHerds = HerdListSchema.parse(herdsRaw);
      const parsedAnimals = AnimalListSchema.parse(animalsRaw);
      const parsedAssets = EquipmentAssetsResponseSchema.parse(assetsRaw);

      setHerds(parsedHerds);
      setAnimals(
        parsedAnimals.animals.map((animal) => {
          const detail = [animal.species, animal.breed].filter(Boolean).join(" / ");
          const prefix = animal.tagNumber?.trim() ? `Tag ${animal.tagNumber}` : "Animal";
          return { id: animal.animalId, label: detail ? `${prefix} (${detail})` : prefix };
        })
      );
      setAssets(parsedAssets.assets ?? []);
    } catch {
      setHerds([]);
      setAnimals([]);
      setAssets([]);
    } finally {
      setLoadingRefs(false);
    }
  }

  async function loadPlan(date: string) {
    if (!activeRanchId) {
      setPlanData(null);
      return;
    }
    setLoadingPlan(true);
    setError(null);
    try {
      const raw = await apiGet(`/working-day/plan?date=${encodeURIComponent(date)}`);
      setPlanData(WorkingDayPlanResponseSchema.parse(raw));
    } catch (err: unknown) {
      setPlanData(null);
      setError(err instanceof Error ? err.message : "Failed to load working day plan");
    } finally {
      setLoadingPlan(false);
    }
  }

  async function loadPlanInventory(periodDays: PlanInventoryWindowDays) {
    if (!activeRanchId) {
      setPlanInventory(null);
      return;
    }
    setLoadingPlanInventory(true);
    setPlanInventoryError(null);
    try {
      const raw = await apiGet(`/working-day/plan-inventory?periodDays=${periodDays}`);
      setPlanInventory(WorkingDayPlanInventoryResponseSchema.parse(raw));
    } catch (err: unknown) {
      setPlanInventory(null);
      setPlanInventoryError(err instanceof Error ? err.message : "Failed to load plan inventory");
    } finally {
      setLoadingPlanInventory(false);
    }
  }

  async function ensurePlanId(): Promise<string> {
    if (planData?.plan?.id) return planData.plan.id;
    const raw = await apiPost("/working-day/plan", { date: planDate });
    const parsed = WorkingDayPlanCreateResponseSchema.parse(raw);
    if (!parsed.plan?.id) throw new Error("Plan creation did not return an id.");
    return parsed.plan.id;
  }

  async function refresh() {
    await Promise.all([loadPlan(planDate), loadPlanInventory(planInventoryWindowDays)]);
  }

  async function createPlanForSelectedDate(targetDate: string) {
    if (!canInteract) return;
    setSaving(true);
    setError(null);
    const targetLabel = formatPlanDateLabel(targetDate);
    try {
      const raw = await apiPost("/working-day/plan", { date: targetDate });
      const parsed = WorkingDayPlanCreateResponseSchema.parse(raw);
      if (parsed.created) {
        toast({
          title: "Plan created",
          description: `Date: ${targetLabel} (${targetDate})`,
        });
      } else {
        toast({
          title: "Plan already exists",
          description: `Date: ${targetLabel} (${targetDate})`,
        });
      }
      setPlanDate(targetDate);
      await Promise.all([loadPlan(targetDate), loadPlanInventory(planInventoryWindowDays)]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create plan";
      setError(message);
      toast({
        title: "Could not create plan",
        description: `Date: ${targetLabel} (${targetDate}) | ${message}`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function openPlanPrompt() {
    setPlanPromptDate(planDate);
    setPlanPromptOpen(true);
  }

  async function submitPlanPrompt(e: FormEvent) {
    e.preventDefault();
    if (!planPromptDate.trim()) return;
    setPlanPromptOpen(false);
    await createPlanForSelectedDate(planPromptDate);
  }

  function openCreateItemDialog() {
    setEditingItemId(null);
    setItemError(null);
    setItemForm(emptyItemForm(taskCatalog, "HERD_WORK"));
    setAdditionalTaskTypes([]);
    setItemDialogOpen(true);
  }

  function openEditItemDialog(item: WorkingDayPlanItem) {
    setEditingItemId(item.id);
    setItemError(null);
    setAdditionalTaskTypes([]);
    setItemForm({
      category: asCategory(item.category),
      taskType: item.taskType,
      title: item.title ?? "",
      status: asStatus(item.status),
      startTime: item.startTime ?? "",
      endTime: item.endTime ?? "",
      herdId: item.herdId ?? "",
      animalId: item.animalId ?? "",
      locationText: item.locationText ?? "",
      notes: item.notes ?? "",
      applySuggestedNeeds: false,
    });
    setItemDialogOpen(true);
  }

  async function submitItem(e: FormEvent) {
    e.preventDefault();
    if (!canInteract) return;
    if (!itemForm.taskType.trim()) {
      setItemError("Task type is required.");
      return;
    }

    setSaving(true);
    setItemError(null);
    setError(null);
    try {
      const basePayload = {
        category: itemForm.category,
        status: itemForm.status,
        startTime: itemForm.startTime.trim() || null,
        endTime: itemForm.endTime.trim() || null,
        herdId: itemForm.category === "HERD_WORK" ? itemForm.herdId || null : null,
        animalId: itemForm.category === "ANIMAL_WORK" ? itemForm.animalId || null : null,
        locationText: itemForm.locationText.trim() || null,
        notes: itemForm.notes.trim() || null,
      };

      if (editingItemId) {
        const raw = await apiPut(`/working-day/items/${encodeURIComponent(editingItemId)}`, {
          ...basePayload,
          taskType: itemForm.taskType,
          title: itemForm.title.trim() || null,
        });
        WorkingDayPlanItemResponseSchema.parse(raw);
      } else {
        const createTaskTypes = Array.from(
          new Set([itemForm.taskType, ...additionalTaskTypes.filter((taskType) => taskType !== itemForm.taskType)])
        );
        const planId = await ensurePlanId();
        for (const [idx, taskType] of createTaskTypes.entries()) {
          const raw = await apiPost(`/working-day/plan/${encodeURIComponent(planId)}/items`, {
            ...basePayload,
            taskType,
            // Keep custom title on primary task; secondary tasks default from catalog labels.
            title: idx === 0 ? itemForm.title.trim() || null : null,
            applySuggestedNeeds: itemForm.applySuggestedNeeds,
          });
          WorkingDayPlanItemResponseSchema.parse(raw);
        }
      }
      setItemDialogOpen(false);
      await refresh();
    } catch (err: unknown) {
      setItemError(err instanceof Error ? err.message : "Failed to save plan item");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(itemId: string) {
    if (!canInteract) return;
    if (!window.confirm("Delete this plan item and all of its resource needs?")) return;
    setSaving(true);
    setError(null);
    try {
      const raw = await apiDelete(`/working-day/items/${encodeURIComponent(itemId)}`);
      WorkingDayDeleteResponseSchema.parse(raw);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete plan item");
    } finally {
      setSaving(false);
    }
  }

  async function updateItemStatus(itemId: string, status: WorkingDayPlanItemStatus) {
    if (!canInteract) return;
    setSaving(true);
    setError(null);
    try {
      const raw = await apiPut(`/working-day/items/${encodeURIComponent(itemId)}`, { status });
      WorkingDayPlanItemResponseSchema.parse(raw);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update item status");
    } finally {
      setSaving(false);
    }
  }

  function openCreateSupplyNeedDialog(planItemId: string) {
    setEditingSupplyId(null);
    setSupplyError(null);
    setSupplyForm(emptySupplyNeed(planItemId));
    setSupplyDialogOpen(true);
  }

  function openEditSupplyNeedDialog(need: WorkingDayPlanItem["supplyNeeds"][number]) {
    setEditingSupplyId(need.id);
    setSupplyError(null);
    setSupplyForm({
      planItemId: need.planItemId,
      supplyType: (need.supplyType as WorkingDaySupplyType) || "OTHER",
      linkedEntityType: need.linkedEntityType ?? "",
      linkedEntityId: need.linkedEntityId ?? "",
      nameOverride: need.nameOverride ?? "",
      requiredQuantity: need.requiredQuantity == null ? "" : String(need.requiredQuantity),
      unit: need.unit ?? "",
      notes: need.notes ?? "",
    });
    setSupplyDialogOpen(true);
  }

  async function submitSupplyNeed(e: FormEvent) {
    e.preventDefault();
    if (!canInteract) return;
    if (!supplyForm.linkedEntityId.trim() && !supplyForm.nameOverride.trim()) {
      setSupplyError("Enter a name override or linked entity id.");
      return;
    }

    setSaving(true);
    setSupplyError(null);
    setError(null);
    try {
      const payload = {
        supplyType: supplyForm.supplyType,
        linkedEntityType: supplyForm.linkedEntityType.trim() || null,
        linkedEntityId: supplyForm.linkedEntityId.trim() || null,
        nameOverride: supplyForm.nameOverride.trim() || null,
        requiredQuantity: supplyForm.requiredQuantity.trim() || null,
        unit: supplyForm.unit.trim() || null,
        notes: supplyForm.notes.trim() || null,
      };

      if (editingSupplyId) {
        const raw = await apiPut(`/working-day/supply-needs/${encodeURIComponent(editingSupplyId)}`, payload);
        WorkingDaySupplyNeedResponseSchema.parse(raw);
      } else {
        const raw = await apiPost(`/working-day/items/${encodeURIComponent(supplyForm.planItemId)}/supply-needs`, payload);
        WorkingDaySupplyNeedResponseSchema.parse(raw);
      }
      setSupplyDialogOpen(false);
      await refresh();
    } catch (err: unknown) {
      setSupplyError(err instanceof Error ? err.message : "Failed to save supply need");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSupplyNeed(id: string) {
    if (!canInteract) return;
    if (!window.confirm("Delete this supply need?")) return;
    setSaving(true);
    setError(null);
    try {
      const raw = await apiDelete(`/working-day/supply-needs/${encodeURIComponent(id)}`);
      WorkingDayDeleteResponseSchema.parse(raw);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete supply need");
    } finally {
      setSaving(false);
    }
  }

  function openCreateEquipmentNeedDialog(planItemId: string) {
    setEditingEquipmentId(null);
    setEquipmentError(null);
    setEquipmentForm(emptyEquipmentNeed(planItemId));
    setEquipmentDialogOpen(true);
  }

  function openEditEquipmentNeedDialog(need: WorkingDayPlanItem["equipmentNeeds"][number]) {
    setEditingEquipmentId(need.id);
    setEquipmentError(null);
    setEquipmentForm({
      planItemId: need.planItemId,
      assetId: need.assetId ?? "",
      assetTypeHint: need.assetTypeHint ?? "",
      mustBeOperational: need.mustBeOperational ?? true,
      notes: need.notes ?? "",
    });
    setEquipmentDialogOpen(true);
  }

  async function submitEquipmentNeed(e: FormEvent) {
    e.preventDefault();
    if (!canInteract) return;
    if (!equipmentForm.assetId.trim() && !equipmentForm.assetTypeHint.trim()) {
      setEquipmentError("Select an asset or provide an asset type hint.");
      return;
    }

    setSaving(true);
    setEquipmentError(null);
    setError(null);
    try {
      const payload = {
        assetId: equipmentForm.assetId.trim() || null,
        assetTypeHint: equipmentForm.assetTypeHint.trim() || null,
        mustBeOperational: equipmentForm.mustBeOperational,
        notes: equipmentForm.notes.trim() || null,
      };

      if (editingEquipmentId) {
        const raw = await apiPut(`/working-day/equipment-needs/${encodeURIComponent(editingEquipmentId)}`, payload);
        WorkingDayEquipmentNeedResponseSchema.parse(raw);
      } else {
        const raw = await apiPost(`/working-day/items/${encodeURIComponent(equipmentForm.planItemId)}/equipment-needs`, payload);
        WorkingDayEquipmentNeedResponseSchema.parse(raw);
      }
      setEquipmentDialogOpen(false);
      await refresh();
    } catch (err: unknown) {
      setEquipmentError(err instanceof Error ? err.message : "Failed to save equipment need");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEquipmentNeed(id: string) {
    if (!canInteract) return;
    if (!window.confirm("Delete this equipment need?")) return;
    setSaving(true);
    setError(null);
    try {
      const raw = await apiDelete(`/working-day/equipment-needs/${encodeURIComponent(id)}`);
      WorkingDayDeleteResponseSchema.parse(raw);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete equipment need");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!activeRanchId) {
      setPlanData(null);
      setPlanInventory(null);
      setPlanInventoryError(null);
      setHerds([]);
      setAnimals([]);
      setAssets([]);
      return;
    }
    void loadReferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRanchId]);

  useEffect(() => {
    if (!activeRanchId) return;
    void loadPlan(planDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRanchId, planDate]);

  useEffect(() => {
    if (!activeRanchId) return;
    void loadPlanInventory(planInventoryWindowDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRanchId, planInventoryWindowDays]);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-stone-800">Working Day Plan</h1>
        <p className="text-stone-600 mt-1">Plan daily herd, animal, and ranch work with resource needs and readiness checks.</p>
      </header>

      {!ranchLoading && !activeRanchId ? (
        <Card title="No Ranch Selected">
          <div className="text-sm text-stone-700">Select a ranch to start planning.</div>
        </Card>
      ) : null}

      {!ranchLoading && !!activeRanchId ? (
        <div
          className={`rounded-xl border-2 p-4 ${
            planData?.plan ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"
          }`}
        >
          <div className="space-y-3">
            <div className={`text-sm ${planData?.plan ? "text-green-900" : "text-amber-900"}`}>
              {planData?.plan
                ? `Current plan date: ${proposedDateLabel}. Use Switch Day to move to another date.`
                : "No working day plan exists yet. Create one to start adding tasks."}
            </div>
            <Button type="button" className="w-full h-12 text-base font-semibold" onClick={openPlanPrompt} disabled={!canInteract}>
              {saving
                ? "Working..."
                : planData?.plan
                  ? "Switch Day (Open Another Date)"
                  : `Create / Open Plan for ${proposedDateLabel}`}
            </Button>
          </div>
        </div>
      ) : null}

      {!ranchLoading && !!activeRanchId && !!planData?.plan ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={!canInteract}>
            {loadingPlan ? "Refreshing..." : "Refresh"}
          </Button>
          <Button type="button" onClick={openCreateItemDialog} disabled={!canInteract || loadingRefs}>
            Add Plan Item
          </Button>
        </div>
      ) : null}

      {error ? (
        <Card>
          <div className="text-sm text-red-600">{error}</div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          {CATEGORIES.map((category) => {
            const group = grouped.find((g) => g.category === category);
            const items = group?.items ?? [];
            return (
              <Card key={category} title={enumLabel(category)} description={`${items.length} item${items.length === 1 ? "" : "s"}`}>
                {items.length === 0 ? (
                  <div className="text-sm text-stone-500">No items in this category yet.</div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <details key={item.id} className="rounded-md border bg-white p-3">
                        <summary className="cursor-pointer list-none">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold text-stone-800">{item.title}</div>
                              <div className="text-xs text-stone-500">
                                {enumLabel(String(item.taskType))}
                                {item.startTime || item.endTime ? ` | ${item.startTime || "--:--"}-${item.endTime || "--:--"}` : ""}
                                {item.herdName ? ` | Herd: ${item.herdName}` : ""}
                                {item.animalLabel ? ` | Animal: ${item.animalLabel}` : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Select
                                value={asStatus(item.status)}
                                onValueChange={(value) => void updateItemStatus(item.id, asStatus(value))}
                                disabled={!canInteract}
                              >
                                <SelectTrigger aria-label={`Status for ${item.title}`} className="h-8 min-w-[150px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUSES.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {enumLabel(status)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button type="button" size="sm" variant="outline" onClick={() => openEditItemDialog(item)} disabled={!canInteract}>
                                Edit
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => void deleteItem(item.id)} disabled={!canInteract}>
                                Delete
                              </Button>
                            </div>
                          </div>
                        </summary>

                        <div className="mt-4 space-y-4">
                          <div className="text-sm text-stone-700">
                            <span className="text-stone-500">Location/Area:</span> {item.locationText || "-"}
                          </div>
                          {item.notes ? <div className="text-sm text-stone-700 rounded border bg-stone-50 p-2">{item.notes}</div> : null}

                          <div className="rounded border p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-stone-800">Supply Needs</div>
                              <Button type="button" size="sm" variant="outline" onClick={() => openCreateSupplyNeedDialog(item.id)} disabled={!canInteract}>
                                Add Supply Need
                              </Button>
                            </div>
                            {item.supplyNeeds.length === 0 ? (
                              <div className="text-sm text-stone-500">No supply needs.</div>
                            ) : (
                              <div className="space-y-2">
                                {item.supplyNeeds.map((need) => {
                                  const readinessNeed = supplyReadinessByNeedId.get(need.id);
                                  return (
                                    <div key={need.id} className="rounded border bg-stone-50 p-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <div className="font-medium text-stone-800 text-sm">{needLabel(need)}</div>
                                          <div className="text-xs text-stone-500">
                                            {enumLabel(String(need.supplyType))}
                                            {need.requiredQuantity != null ? ` | Required: ${need.requiredQuantity}${need.unit ? ` ${need.unit}` : ""}` : ""}
                                            {readinessNeed?.onHandQuantity != null
                                              ? ` | On hand: ${readinessNeed.onHandQuantity}${readinessNeed.onHandUnit ? ` ${readinessNeed.onHandUnit}` : ""}`
                                              : ""}
                                          </div>
                                          {readinessNeed?.message ? <div className="text-xs text-stone-600 mt-1">{readinessNeed.message}</div> : null}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Button type="button" size="sm" variant="outline" onClick={() => openEditSupplyNeedDialog(need)} disabled={!canInteract}>
                                            Edit
                                          </Button>
                                          <Button type="button" size="sm" variant="outline" onClick={() => void deleteSupplyNeed(need.id)} disabled={!canInteract}>
                                            Delete
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="rounded border p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-stone-800">Equipment Needs</div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => openCreateEquipmentNeedDialog(item.id)}
                                disabled={!canInteract}
                              >
                                Add Equipment Need
                              </Button>
                            </div>
                            {item.equipmentNeeds.length === 0 ? (
                              <div className="text-sm text-stone-500">No equipment needs.</div>
                            ) : (
                              <div className="space-y-2">
                                {item.equipmentNeeds.map((need) => (
                                  <div key={need.id} className="rounded border bg-stone-50 p-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <div className="font-medium text-stone-800 text-sm">
                                          {need.assetId ? assetsById.get(need.assetId)?.name || `Asset ${need.assetId}` : need.assetTypeHint || "Equipment need"}
                                        </div>
                                        <div className="text-xs text-stone-500">
                                          {need.mustBeOperational ? "Must be operational" : "Operational state optional"}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Button type="button" size="sm" variant="outline" onClick={() => openEditEquipmentNeedDialog(need)} disabled={!canInteract}>
                                          Edit
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => void deleteEquipmentNeed(need.id)}
                                          disabled={!canInteract}
                                        >
                                          Delete
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card title="Readiness Summary" description="This is a readiness check, not enforcement.">
            <div className="space-y-2 text-sm text-stone-700">
              <div>
                Supplies: ready {planData?.readiness.supplies.summary.ready ?? 0}, short{" "}
                {planData?.readiness.supplies.summary.short ?? 0}, unknown {planData?.readiness.supplies.summary.unknown ?? 0}
              </div>
              <div>
                Equipment: ready {planData?.readiness.equipment.summary.ready ?? 0}, blocked{" "}
                {planData?.readiness.equipment.summary.blocked ?? 0}, unknown {planData?.readiness.equipment.summary.unknown ?? 0}
              </div>
            </div>
          </Card>

          <Card title="Plan Inventory" description="Summary of upcoming work for the selected planning window.">
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="wdp-inventory-window">Window</Label>
                <Select
                  value={String(planInventoryWindowDays)}
                  onValueChange={(value) => setPlanInventoryWindowDays(Number(value) as PlanInventoryWindowDays)}
                  disabled={!canInteract}
                >
                  <SelectTrigger id="wdp-inventory-window" aria-label="Plan inventory window">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_INVENTORY_WINDOWS.map((window) => (
                      <SelectItem key={window.value} value={String(window.value)}>
                        {window.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loadingPlanInventory ? (
                <div className="text-sm text-stone-500">Loading upcoming plans...</div>
              ) : planInventoryError ? (
                <div className="text-sm text-red-600">{planInventoryError}</div>
              ) : planInventory ? (
                <>
                  <div className="text-xs text-stone-600">
                    {planInventory.summary.planCount} plan{planInventory.summary.planCount === 1 ? "" : "s"} | {planInventory.summary.totalItems} tasks
                    <br />
                    {formatPlanDateLabel(planInventory.startDate)} - {formatPlanDateLabel(planInventory.endDate)}
                  </div>

                  {planInventory.plans.length === 0 ? (
                    <div className="text-sm text-stone-500">No plans found in this window.</div>
                  ) : (
                    <div className="space-y-2">
                      {planInventory.plans.map((plan) => (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => setPlanDate(plan.planDate)}
                          className={`w-full rounded border p-2 text-left transition-colors ${
                            planDate === plan.planDate ? "border-green-400 bg-green-50" : "bg-white hover:bg-stone-50"
                          }`}
                        >
                          <div className="text-sm font-medium text-stone-800">{formatPlanDateLabel(plan.planDate)}</div>
                          <div className="text-xs text-stone-600">
                            {plan.totalItems} tasks | Planned {plan.statusSummary.planned} | In Progress {plan.statusSummary.inProgress} | Done {plan.statusSummary.done}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-stone-500">No inventory data yet.</div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={planPromptOpen} onOpenChange={setPlanPromptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create or Open Working Day Plan</DialogTitle>
            <DialogDescription>Pick a date. If a plan already exists for that date, it will be loaded.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPlanPrompt} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wdp-plan-prompt-date">Plan Date</Label>
              <Input
                id="wdp-plan-prompt-date"
                aria-label="Plan date"
                type="date"
                value={planPromptDate}
                onChange={(e) => setPlanPromptDate(e.target.value)}
                disabled={!canInteract}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPlanPromptOpen(false)} disabled={!canInteract}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canInteract || !planPromptDate.trim()}>
                {saving ? "Working..." : `Create / Open ${formatPlanDateLabel(planPromptDate)}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingItemId ? "Edit Plan Item" : "Add Plan Item"}</DialogTitle>
            <DialogDescription>Create or update a plan item for this date.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitItem} className="space-y-4">
            {itemError ? <div className="text-sm text-red-600">{itemError}</div> : null}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="wdp-item-category">Category</Label>
                <Select
                  value={itemForm.category}
                  onValueChange={(value) => {
                    const category = asCategory(value);
                    const nextPrimary = firstTaskType(taskCatalog, category);
                    setItemForm((prev) => ({
                      ...prev,
                      category,
                      taskType: nextPrimary,
                      herdId: category === "HERD_WORK" ? prev.herdId : "",
                      animalId: category === "ANIMAL_WORK" ? prev.animalId : "",
                    }));
                    setAdditionalTaskTypes([]);
                  }}
                  disabled={!canInteract}
                >
                  <SelectTrigger id="wdp-item-category" aria-label="Plan item category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {enumLabel(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wdp-item-task-type">Task Type</Label>
                <Select
                  value={itemForm.taskType}
                  onValueChange={(value) => {
                    setItemForm((prev) => ({ ...prev, taskType: value }));
                    setAdditionalTaskTypes((prev) => prev.filter((taskType) => taskType !== value));
                  }}
                  disabled={!canInteract}
                >
                  <SelectTrigger id="wdp-item-task-type" aria-label="Plan item task type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tasksForSelectedCategory.map((task) => (
                      <SelectItem key={task.taskType} value={task.taskType}>
                        {task.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!editingItemId ? (
                <div className="space-y-2 md:col-span-2">
                  <Label>Additional Task Types In This Session (optional)</Label>
                  {tasksForSelectedCategory.filter((task) => task.taskType !== itemForm.taskType).length === 0 ? (
                    <div className="text-xs text-stone-500">No additional task types available for this category.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-md border bg-stone-50 p-2">
                      {tasksForSelectedCategory
                        .filter((task) => task.taskType !== itemForm.taskType)
                        .map((task) => (
                          <label
                            key={task.taskType}
                            htmlFor={`wdp-additional-task-${task.taskType}`}
                            className="inline-flex items-center gap-2 text-sm text-stone-700"
                          >
                            <Checkbox
                              id={`wdp-additional-task-${task.taskType}`}
                              checked={additionalTaskTypes.includes(task.taskType)}
                              onCheckedChange={(checked) => {
                                setAdditionalTaskTypes((prev) => {
                                  if (checked === true) return Array.from(new Set([...prev, task.taskType]));
                                  return prev.filter((taskType) => taskType !== task.taskType);
                                });
                              }}
                              disabled={!canInteract}
                            />
                            <span>{task.label}</span>
                          </label>
                        ))}
                    </div>
                  )}
                  <div className="text-xs text-stone-500">
                    Creates separate plan items with the same target, time window, location, and notes so multiple tasks can be done in one handling pass.
                  </div>
                </div>
              ) : null}

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="wdp-item-title">Title (optional)</Label>
                <Input id="wdp-item-title" value={itemForm.title} onChange={(e) => setItemForm((prev) => ({ ...prev, title: e.target.value }))} disabled={!canInteract} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wdp-item-start-time">Start Time</Label>
                <Input id="wdp-item-start-time" type="time" value={itemForm.startTime} onChange={(e) => setItemForm((prev) => ({ ...prev, startTime: e.target.value }))} disabled={!canInteract} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wdp-item-end-time">End Time</Label>
                <Input id="wdp-item-end-time" type="time" value={itemForm.endTime} onChange={(e) => setItemForm((prev) => ({ ...prev, endTime: e.target.value }))} disabled={!canInteract} />
              </div>

              {itemForm.category === "HERD_WORK" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="wdp-item-herd">Target Herd</Label>
                  <Select value={itemForm.herdId || "UNSET"} onValueChange={(value) => setItemForm((prev) => ({ ...prev, herdId: value === "UNSET" ? "" : value }))} disabled={!canInteract}>
                    <SelectTrigger id="wdp-item-herd" aria-label="Target herd">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNSET">Not specified</SelectItem>
                      {herds.map((herd) => (
                        <SelectItem key={herd.id} value={herd.id}>
                          {herd.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {itemForm.category === "ANIMAL_WORK" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="wdp-item-animal">Target Animal</Label>
                  <Select value={itemForm.animalId || "UNSET"} onValueChange={(value) => setItemForm((prev) => ({ ...prev, animalId: value === "UNSET" ? "" : value }))} disabled={!canInteract}>
                    <SelectTrigger id="wdp-item-animal" aria-label="Target animal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNSET">Not specified</SelectItem>
                      {animals.map((animal) => (
                        <SelectItem key={animal.id} value={animal.id}>
                          {animal.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="wdp-item-location">Location / Area</Label>
                <Input id="wdp-item-location" value={itemForm.locationText} onChange={(e) => setItemForm((prev) => ({ ...prev, locationText: e.target.value }))} disabled={!canInteract} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="wdp-item-notes">Notes</Label>
                <Textarea id="wdp-item-notes" rows={3} value={itemForm.notes} onChange={(e) => setItemForm((prev) => ({ ...prev, notes: e.target.value }))} disabled={!canInteract} />
              </div>

              {!editingItemId ? (
                <div className="md:col-span-2">
                  <label htmlFor="wdp-item-suggested-needs" className="inline-flex items-center gap-2">
                    <Checkbox id="wdp-item-suggested-needs" checked={itemForm.applySuggestedNeeds} onCheckedChange={(checked) => setItemForm((prev) => ({ ...prev, applySuggestedNeeds: checked === true }))} disabled={!canInteract} />
                    <span className="text-sm text-stone-700">Apply suggested needs from task catalog</span>
                  </label>
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setItemDialogOpen(false)} disabled={!canInteract}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canInteract}>
                {saving
                  ? "Saving..."
                  : editingItemId
                  ? "Save Item"
                  : additionalTaskTypes.length > 0
                  ? `Create ${additionalTaskTypes.length + 1} Items`
                  : "Create Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={supplyDialogOpen} onOpenChange={setSupplyDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingSupplyId ? "Edit Supply Need" : "Add Supply Need"}</DialogTitle>
            <DialogDescription>Track required supplies for this task.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitSupplyNeed} className="space-y-4">
            {supplyError ? <div className="text-sm text-red-600">{supplyError}</div> : null}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="wdp-supply-type">Supply Type</Label>
                <Select value={supplyForm.supplyType} onValueChange={(value) => setSupplyForm((prev) => ({ ...prev, supplyType: value as WorkingDaySupplyType }))} disabled={!canInteract}>
                  <SelectTrigger id="wdp-supply-type" aria-label="Supply need type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPLY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {enumLabel(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wdp-linked-type">Linked Entity Type</Label>
                <Select value={supplyForm.linkedEntityType || "UNSET"} onValueChange={(value) => setSupplyForm((prev) => ({ ...prev, linkedEntityType: value === "UNSET" ? "" : value }))} disabled={!canInteract}>
                  <SelectTrigger id="wdp-linked-type" aria-label="Linked entity type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNSET">Not linked</SelectItem>
                    {LINKED_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {enumLabel(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="wdp-name-override">Name Override</Label>
                <Input id="wdp-name-override" value={supplyForm.nameOverride} onChange={(e) => setSupplyForm((prev) => ({ ...prev, nameOverride: e.target.value }))} disabled={!canInteract} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="wdp-linked-id">Linked Entity ID (UUID)</Label>
                <Input id="wdp-linked-id" value={supplyForm.linkedEntityId} onChange={(e) => setSupplyForm((prev) => ({ ...prev, linkedEntityId: e.target.value }))} disabled={!canInteract} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wdp-required-quantity">Required Quantity</Label>
                <Input id="wdp-required-quantity" value={supplyForm.requiredQuantity} onChange={(e) => setSupplyForm((prev) => ({ ...prev, requiredQuantity: e.target.value }))} disabled={!canInteract} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wdp-unit">Unit</Label>
                <Input id="wdp-unit" value={supplyForm.unit} onChange={(e) => setSupplyForm((prev) => ({ ...prev, unit: e.target.value }))} disabled={!canInteract} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="wdp-supply-notes">Notes</Label>
                <Textarea id="wdp-supply-notes" rows={3} value={supplyForm.notes} onChange={(e) => setSupplyForm((prev) => ({ ...prev, notes: e.target.value }))} disabled={!canInteract} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSupplyDialogOpen(false)} disabled={!canInteract}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canInteract}>
                {saving ? "Saving..." : editingSupplyId ? "Save Supply Need" : "Add Supply Need"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={equipmentDialogOpen} onOpenChange={setEquipmentDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingEquipmentId ? "Edit Equipment Need" : "Add Equipment Need"}</DialogTitle>
            <DialogDescription>Track required equipment assets for this task.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEquipmentNeed} className="space-y-4">
            {equipmentError ? <div className="text-sm text-red-600">{equipmentError}</div> : null}
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-2">
                <Label htmlFor="wdp-equipment-asset">Linked Asset</Label>
                <Select value={equipmentForm.assetId || "UNSET"} onValueChange={(value) => setEquipmentForm((prev) => ({ ...prev, assetId: value === "UNSET" ? "" : value }))} disabled={!canInteract}>
                  <SelectTrigger id="wdp-equipment-asset" aria-label="Linked equipment asset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNSET">Not linked</SelectItem>
                    {assets.map((asset) => (
                      <SelectItem key={asset.id} value={asset.id}>
                        {asset.name} ({enumLabel(String(asset.assetType))})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wdp-equipment-hint">Asset Type Hint</Label>
                <Input id="wdp-equipment-hint" value={equipmentForm.assetTypeHint} onChange={(e) => setEquipmentForm((prev) => ({ ...prev, assetTypeHint: e.target.value }))} disabled={!canInteract} />
              </div>
              <div className="space-y-2">
                <label htmlFor="wdp-equipment-operational" className="inline-flex items-center gap-2">
                  <Checkbox id="wdp-equipment-operational" checked={equipmentForm.mustBeOperational} onCheckedChange={(checked) => setEquipmentForm((prev) => ({ ...prev, mustBeOperational: checked === true }))} disabled={!canInteract} />
                  <span className="text-sm text-stone-700">Must be operational</span>
                </label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wdp-equipment-notes">Notes</Label>
                <Textarea id="wdp-equipment-notes" rows={3} value={equipmentForm.notes} onChange={(e) => setEquipmentForm((prev) => ({ ...prev, notes: e.target.value }))} disabled={!canInteract} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEquipmentDialogOpen(false)} disabled={!canInteract}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canInteract}>
                {saving ? "Saving..." : editingEquipmentId ? "Save Equipment Need" : "Add Equipment Need"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
