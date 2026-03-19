"use client";

import { useEffect, useState } from "react";
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
import { toast } from "sonner";
import { FileBrowser } from "@/components/files/file-browser";

interface CloneRepoDialogProps {
  trigger: React.ReactNode;
  workspaceRoots: string[];
}

export function CloneRepoDialog({ trigger, workspaceRoots }: CloneRepoDialogProps) {
  const t = useTranslations("git");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [targetFolder, setTargetFolder] = useState("");
  const [cloning, setCloning] = useState(false);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [baseDir, setBaseDir] = useState<string>("");

  // Auto-derive target folder name from URL
  const handleUrlChange = (url: string) => {
    setRepoUrl(url);
    const name = url
      .replace(/\.git$/, "")
      .split("/")
      .pop();
    if (name) setTargetFolder(name);
  };

  const handleClone = async () => {
    if (!repoUrl) return;
    setCloning(true);
    try {
      const res = await fetch("/api/git/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl,
          targetFolderName: targetFolder,
          baseDir: baseDir || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Clone failed");
      }

      const workspace = await res.json();
      toast.success(t("cloneSuccess"));
      setOpen(false);
      router.push(`/workspace/${workspace.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Clone failed"
      );
    } finally {
      setCloning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("clone")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("repoUrl")}</Label>
            <Input
              value={repoUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder={t("repoUrlPlaceholder")}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr,3fr]">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{t("targetFolder")}</Label>
                <Input
                  value={targetFolder}
                  onChange={(e) => setTargetFolder(e.target.value)}
                  placeholder={t("targetFolder")}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("cloneBaseDir") || "Clone into directory"}</Label>
                <Input
                  value={baseDir}
                  onChange={(e) => setBaseDir(e.target.value)}
                  placeholder={workspaceRoots[0] || "/path/under/WORKSPACE_ROOTS"}
                  className="text-xs font-mono"
                />
                {baseDir && (
                  <p className="text-[11px] text-muted-foreground break-all leading-snug">
                    {baseDir}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("cloneBaseDirBrowse") || "Browse workspace roots"}</Label>
              <div className="grid h-60 grid-cols-1 gap-3 overflow-hidden rounded-md border p-2 md:grid-cols-[2fr,3fr]">
                {workspaceRoots.length > 0 ? (
                  <>
                    <div className="h-full overflow-y-auto space-y-1 pr-1 border-b md:border-b-0 md:border-r border-border/60">
                      {workspaceRoots.map((root) => (
                        <button
                          key={root}
                          type="button"
                          className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] hover:bg-accent ${
                            (selectedRoot || workspaceRoots[0]) === root
                              ? "bg-accent"
                              : ""
                          }`}
                          onClick={() => {
                            setSelectedRoot(root);
                            // 如果当前 baseDir 还没选，默认用该根目录
                            if (!baseDir) {
                              setBaseDir(root);
                            }
                          }}
                        >
                          <span className="truncate">{root}</span>
                        </button>
                      ))}
                    </div>
                    <div className="h-full min-h-0 overflow-hidden">
                      <FileBrowser
                        workspaceId=""
                        folderPath={selectedRoot || workspaceRoots[0]}
                        isGitRepo={false}
                        selectedFilePath={baseDir || null}
                        onFileSelect={(path) => {
                          if (!path) return;
                          setBaseDir(path);
                        }}
                        onDirectorySelect={(path) => {
                          setBaseDir(path);
                          setSelectedRoot(
                            workspaceRoots.find((root) =>
                              path.replace(/\\/g, "/").startsWith(
                                root.replace(/\\/g, "/")
                              )
                            ) || selectedRoot
                          );
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    {t("noWorkspaceRoots") ||
                      "Configure WORKSPACE_ROOTS to browse clone destination."}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleClone} disabled={cloning || !repoUrl}>
              {cloning ? t("cloning") : t("clone")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
