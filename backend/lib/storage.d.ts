export function ensureRanchStructure(ranchId: string): Promise<string>;

export function saveUploadedFile(
  file: any,
  targetDir: string
): Promise<{ filename: string; filepath: string }>;