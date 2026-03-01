import { FileText, ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EquipmentAttachment } from "@/lib/contracts/equipment";

type EquipmentAttachmentUploaderProps = {
  id: string;
  title: string;
  description: string;
  attachments: EquipmentAttachment[];
  disabled?: boolean;
  uploading?: boolean;
  deletingId?: string | null;
  onUploadFiles: (files: FileList | null) => void;
  onDeleteAttachment: (attachmentId: string) => void;
};

function isImageAttachment(attachment: EquipmentAttachment): boolean {
  const mime = String(attachment.mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const filename = String(attachment.originalFilename ?? "").toLowerCase();
  return filename.endsWith(".jpg") || filename.endsWith(".jpeg") || filename.endsWith(".png") || filename.endsWith(".webp");
}

function fileLabel(attachment: EquipmentAttachment): string {
  const name = attachment.originalFilename?.trim();
  if (name && name.length > 0) return name;
  const path = attachment.filePath?.trim();
  if (!path || path.length === 0) return "Attachment";
  const parts = path.split("/");
  return parts[parts.length - 1] || "Attachment";
}

export function EquipmentAttachmentUploader({
  id,
  title,
  description,
  attachments,
  disabled = false,
  uploading = false,
  deletingId = null,
  onUploadFiles,
  onDeleteAttachment,
}: EquipmentAttachmentUploaderProps) {
  const imageAttachments = attachments.filter((row) => isImageAttachment(row));
  const fileAttachments = attachments.filter((row) => !isImageAttachment(row));

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
          accept="image/*,.pdf,application/pdf"
          multiple
          className="w-full"
          aria-label={title}
          title={title}
          onChange={(e) => onUploadFiles(e.target.files)}
          disabled={disabled || uploading}
        />
      </div>

      {uploading && <div className="text-xs text-stone-500">Uploading...</div>}

      {imageAttachments.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-stone-700 flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            <span>Images</span>
          </div>
          <div className="max-h-80 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {imageAttachments.map((attachment) => (
                <div key={attachment.id} className="rounded-md border overflow-hidden bg-white">
                  <div className="aspect-square bg-stone-50 flex items-center justify-center">
                    {attachment.url ? (
                      <img
                        src={attachment.url}
                        alt={fileLabel(attachment)}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-stone-500">No preview</span>
                    )}
                  </div>
                  <div className="p-1 space-y-1">
                    <div className="text-[11px] leading-tight text-stone-600 truncate" title={fileLabel(attachment)}>
                      {fileLabel(attachment)}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={disabled || deletingId === attachment.id}
                      onClick={() => onDeleteAttachment(attachment.id)}
                    >
                      {deletingId === attachment.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {fileAttachments.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-stone-700 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Documents</span>
          </div>
          <div className="space-y-2">
            {fileAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between rounded-md border bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm text-stone-800 truncate" title={fileLabel(attachment)}>
                    {fileLabel(attachment)}
                  </div>
                  <div className="text-xs text-stone-500">
                    {attachment.mimeType ?? "file"}
                    {attachment.purpose ? ` | ${attachment.purpose}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {attachment.url && (
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-700 hover:underline"
                    >
                      Open
                    </a>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || deletingId === attachment.id}
                    onClick={() => onDeleteAttachment(attachment.id)}
                  >
                    {deletingId === attachment.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {attachments.length === 0 && !uploading && <div className="text-xs text-stone-500">No attachments yet.</div>}
    </div>
  );
}
