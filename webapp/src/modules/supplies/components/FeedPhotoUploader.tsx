import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ExistingFeedPhoto = {
  id: string;
  url: string | null;
  originalFilename?: string | null;
};

export type LocalFeedPhoto = {
  id: string;
  file: File;
  url: string;
  originalName: string;
};

type FeedPhotoUploaderProps = {
  id: string;
  title: string;
  description: string;
  ariaLabel: string;
  existingPhotos: ExistingFeedPhoto[];
  markedForDelete: Set<string>;
  localPhotos: LocalFeedPhoto[];
  disabled?: boolean;
  onAddFiles: (files: FileList | null) => void;
  onRemoveLocal: (photoId: string) => void;
  onToggleDeleteExisting: (photoId: string, marked: boolean) => void;
};

export function FeedPhotoUploader({
  id,
  title,
  description,
  ariaLabel,
  existingPhotos,
  markedForDelete,
  localPhotos,
  disabled = false,
  onAddFiles,
  onRemoveLocal,
  onToggleDeleteExisting,
}: FeedPhotoUploaderProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
        <div className="min-w-0">
          <div className="font-medium md:whitespace-nowrap">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>

        <Input
          id={id}
          type="file"
          accept="image/*"
          multiple
          className="w-full"
          aria-label={ariaLabel}
          title={ariaLabel}
          onChange={(e) => onAddFiles(e.target.files)}
          disabled={disabled}
        />
      </div>

      {existingPhotos.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-stone-700">Saved Photos</div>
          <div className="max-h-80 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {existingPhotos.map((photo) => {
                const marked = markedForDelete.has(photo.id);
                return (
                  <div key={photo.id} className="rounded-md border overflow-hidden bg-white">
                    <div className="aspect-square bg-stone-50 flex items-center justify-center">
                      {photo.url ? (
                        <img
                          src={photo.url}
                          alt={photo.originalFilename || "Saved photo"}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-stone-500">No preview</span>
                      )}
                    </div>
                    <div className="p-1">
                      <Button
                        type="button"
                        variant={marked ? "default" : "outline"}
                        size="sm"
                        className="w-full"
                        onClick={() => onToggleDeleteExisting(photo.id, !marked)}
                        disabled={disabled}
                      >
                        {marked ? "Undo" : "Delete"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {localPhotos.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-stone-700">New Photos</div>
          <div className="max-h-80 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {localPhotos.map((photo) => (
                <div key={photo.id} className="rounded-md border overflow-hidden bg-white">
                  <div className="aspect-square bg-stone-50 flex items-center justify-center">
                    <img
                      src={photo.url}
                      alt={photo.originalName || "New photo"}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => onRemoveLocal(photo.id)}
                      disabled={disabled}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
