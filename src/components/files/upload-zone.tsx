"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";
import { toast } from "sonner";

interface UploadZoneProps {
  targetDir: string;
  onUploadComplete: () => void;
}

export function UploadZone({ targetDir, onUploadComplete }: UploadZoneProps) {
  const t = useTranslations("files");
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const getWebkitRelativePath = (file: File): string | null => {
    // webkitdirectory 选择时会存在该字段；普通文件选择/拖拽通常为空
    const rp = (file as unknown as { webkitRelativePath?: string }).webkitRelativePath;
    if (!rp) return null;
    const normalized = rp.replace(/\\+/g, "/").replace(/^\/+/, "");
    return normalized ? normalized : null;
  };

  const handleUpload = useCallback(
    async (files: FileList) => {
      setUploading(true);
      try {
        const arr = Array.from(files);
        for (const file of arr) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("targetDir", targetDir);
          const relativePath = getWebkitRelativePath(file);
          if (relativePath) {
            formData.append("relativePath", relativePath);
          }

          const res = await fetch("/api/files/upload", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) throw new Error(`Failed to upload ${file.name}`);
        }
        toast.success(`Uploaded ${arr.length} file(s)`);
        onUploadComplete();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Upload failed"
        );
      } finally {
        setUploading(false);
      }
    },
    [targetDir, onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files);
      }
    },
    [handleUpload]
  );

  return (
    <div
      className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={(e) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        // Shift 点击：选择文件夹并保留目录结构（webkitRelativePath）
        if (e.shiftKey) {
          (input as unknown as { webkitdirectory?: boolean }).webkitdirectory = true;
        }
        input.onchange = () => {
          if (input.files) handleUpload(input.files);
        };
        input.click();
      }}
    >
      <Upload className="mb-4 h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {uploading ? "Uploading..." : t("dragDrop")}
      </p>
      <p className="mt-2 text-xs text-muted-foreground/80">
        点击上传文件；Shift 点击上传文件夹
      </p>
    </div>
  );
}
