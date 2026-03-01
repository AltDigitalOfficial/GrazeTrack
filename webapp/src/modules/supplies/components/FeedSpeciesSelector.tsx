import { Checkbox } from "@/components/ui/checkbox";

type FeedSpeciesSelectorProps = {
  options: string[];
  selected: string[];
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  helperText?: string;
  onToggle: (species: string, checked: boolean) => void;
};

export function FeedSpeciesSelector({
  options,
  selected,
  loading = false,
  error = null,
  disabled = false,
  helperText = "Leave all unchecked to apply to all ranch species.",
  onToggle,
}: FeedSpeciesSelectorProps) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      {loading && <div className="text-xs text-muted-foreground">Loading species...</div>}
      {!!error && <div className="text-xs text-red-600">{error}</div>}

      {!loading && !error && options.length === 0 && (
        <div className="text-xs text-muted-foreground">
          No ranch species available yet. Configure species in Ranch Settings first.
        </div>
      )}

      {!loading && options.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {options.map((species) => (
            <label key={species} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(species)}
                onCheckedChange={(v) => onToggle(species, v === true)}
                disabled={disabled}
              />
              <span>{species}</span>
            </label>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground">{helperText}</div>
    </div>
  );
}
