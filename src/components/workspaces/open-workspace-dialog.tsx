"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, Folder } from "lucide-react";
import { FileBrowser } from "@/components/files/file-browser";
import { toast } from "sonner";

interface OpenWorkspaceDialogProps {
  trigger: React.ReactNode;
  workspaceRoots: string[];
}

export function OpenWorkspaceDialog({
  trigger,
  workspaceRoots,
}: OpenWorkspaceDialogProps) {
  const t = useTranslations("files");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");

  const handleOpen = async () => {
    if (!selectedFolderPath || !workspaceName) return;

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workspaceName,
          folderPath: selectedFolderPath,
        }),
      });

      if (!res.ok) throw new Error("Failed to create workspace");
      const workspace = await res.json();
      setOpen(false);
      router.push(`/workspace/${workspace.id}`);
    } catch {
      toast.error("Failed to open workspace");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("selectFolder")}</DialogTitle>
        </DialogHeader>
          <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[2fr,3fr] gap-4">
            <div className="space-y-3">
              <Label>{t("rootPaths")}</Label>
              <div className="space-y-1">
                {workspaceRoots.map((root) => (
                  <button
                    key={root}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent ${
                      selectedRoot === root ? "bg-accent" : ""
                    }`}
                    onClick={() => {
                      setSelectedRoot(root);
                      setSelectedFolderPath(root);
                      const folderName =
                        root.split("/").pop() || root.split("\\").pop();
                      if (folderName) setWorkspaceName(folderName);
                    }}
                  >
                    <Folder className="h-4 w-4" />
                    <span className="truncate">{root}</span>
                    <ChevronRight className="ml-auto h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("selectFolder")}</Label>
              <Input
                value={selectedFolderPath}
                onChange={(e) => setSelectedFolderPath(e.target.value)}
                placeholder={t("rootPaths")}
                className="text-xs font-mono"
              />
              {selectedFolderPath && (
                <p className="text-[11px] text-muted-foreground break-all leading-snug">
                  {selectedFolderPath}
                </p>
              )}
              <div className="h-60 rounded-md border">
                {selectedRoot ? (
                  <FileBrowser
                    workspaceId=""
                    folderPath={selectedRoot}
                    isGitRepo={false}
                    selectedFilePath={selectedFolderPath || null}
                    onFileSelect={(path) => {
                      if (!path) return;
                      setSelectedFolderPath(path);
                      const folderName =
                        path.split("/").pop() || path.split("\\").pop();
                      if (folderName) setWorkspaceName(folderName);
                    }}
                    onDirectorySelect={(path) => {
                      setSelectedFolderPath(path);
                      const folderName =
                        path.split("/").pop() || path.split("\\").pop();
                      if (folderName) setWorkspaceName(folderName);
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {t("rootPaths")}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedRoot(null);
                setSelectedFolderPath("");
              }}
            >
              {tCommon("back")}
            </Button>
            <Button onClick={handleOpen} disabled={!workspaceName || !selectedFolderPath}>
              {tCommon("open")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
