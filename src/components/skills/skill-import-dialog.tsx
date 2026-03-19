"use client";

import React, { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, FileUp, CheckCircle2, FolderSearch, ChevronRight } from "lucide-react";
import { Dialog as UIDialog, DialogContent as UIDialogContent } from "@/components/ui/dialog";
import { FileBrowser } from "@/components/files/file-browser";
import { markdownToSkillData } from "@/lib/utils/skill-md";

interface SkillImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string | null;
  onImported: () => void;
}

interface BatchResult {
  imported: number;
  failed: number;
}

export function SkillImportDialog({
  open,
  onOpenChange,
  workspaceId,
  onImported,
}: SkillImportDialogProps) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");

  const [tab, setTab] = useState<"file" | "url" | "local">("file");
  const [url, setUrl] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showWorkspaceBrowser, setShowWorkspaceBrowser] = useState(false);
  const [workspaceRoots, setWorkspaceRoots] = useState<string[]>([]);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);

  const resetState = () => {
    setUrl("");
    setLocalPath("");
    setError(null);
    setImporting(false);
    setBatchResult(null);
  };

  const doImport = async (payload: {
    url?: string;
    skill?: unknown;
    workspaceId?: string | null;
  }) => {
    setImporting(true);
    setError(null);
    setBatchResult(null);
    try {
      const res = await fetch("/api/skills/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          workspaceId: workspaceId || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || t("importError"));
        return;
      }
      const result = await res.json();

      // Check if this is a batch import result
      if (result.batch) {
        setBatchResult({ imported: result.imported, failed: result.failed });
        onImported();
        return result;
      }

      // Single skill imported
      onImported();
      onOpenChange(false);
      resetState();
      return result;
    } catch {
      setError(t("importError"));
    } finally {
      setImporting(false);
    }
  };

  const handleImportUrl = async () => {
    if (!url.trim()) return;
    await doImport({ url: url.trim() });
  };

  const handleImportLocal = async () => {
    if (!localPath.trim()) return;
    setImporting(true);
    setError(null);
    setBatchResult(null);
    try {
      const res = await fetch("/api/skills/import/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: localPath.trim(),
          workspaceId: workspaceId || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setError(err?.error || t("importError"));
        return;
      }
      await res.json();
      onImported();
      onOpenChange(false);
      resetState();
    } catch {
      setError(t("importError"));
    } finally {
      setImporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = markdownToSkillData(text);
      if (!parsed || !parsed.name || !parsed.systemPrompt) {
        setError(t("invalidMarkdown"));
        return;
      }
      await doImport({
        skill: {
          name: parsed.name,
          slug: parsed.slug,
          description: parsed.description || null,
          systemPrompt: parsed.systemPrompt,
          steps: parsed.steps,
          allowedTools: parsed.allowedTools,
          parameters: parsed.parameters,
        },
      });
    } catch {
      setError(t("invalidMarkdown"));
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetState();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("import")}</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as typeof tab);
            setBatchResult(null);
            setError(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="file" className="gap-1.5">
              <FileUp className="h-3.5 w-3.5" />
              {t("importFromFile")}
            </TabsTrigger>
            <TabsTrigger value="local" className="gap-1.5">
              <FolderSearch className="h-3.5 w-3.5" />
              {t("importFromLocal") || "From server"}
            </TabsTrigger>
            <TabsTrigger value="url" className="gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              {t("importUrlDesc")}
            </p>
            <div className="space-y-1.5">
              <Label>{t("importUrl")}</Label>
              <Input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                  setBatchResult(null);
                }}
                placeholder={t("importUrlPlaceholder")}
              />
            </div>
          </TabsContent>

          <TabsContent value="file" className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              {t("importFileDesc")}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              <FileUp className="h-4 w-4 mr-2" />
              {t("selectFile")}
            </Button>
          </TabsContent>

          <TabsContent value="local" className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              {t("importLocalDesc") ||
                "Import a SKILL.md file from the AuraID server (path is resolved relative to the project root)."}
            </p>
            <div className="space-y-1.5">
              <Label>{t("importLocalPath") || "Server path"}</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={localPath}
                  onChange={(e) => {
                    setLocalPath(e.target.value);
                    setError(null);
                    setBatchResult(null);
                  }}
                  placeholder={t("importLocalPlaceholder") || "e.g. data/skills/my-skill/SKILL.md"}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={async () => {
                    try {
                      if (workspaceRoots.length === 0) {
                        // 与其它功能保持一致：直接从 /api/settings 读取 workspaceRoots，
                        // 由 WORKSPACE_ROOTS 环境变量控制（容器里可设为 /app/data/...）。
                        const res = await fetch("/api/settings");
                        if (res.ok) {
                          const data = await res.json();
                          const roots = (data.workspaceRoots as string[] | undefined) || [];
                          setWorkspaceRoots(roots);
                          if (roots.length === 1) {
                            setSelectedRoot(roots[0]);
                          }
                        }
                      }
                    } catch {
                      // ignore
                    }
                    setShowWorkspaceBrowser(true);
                  }}
                  title={t("attachImageFromWorkspace")}
                >
                  <FolderSearch className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {batchResult && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            <p className="text-sm text-green-700 dark:text-green-300">
              {t("batchImportSuccess", { count: batchResult.imported })}
              {batchResult.failed > 0 && (
                <span className="text-muted-foreground ml-1">
                  ({t("batchImportFailed", { count: batchResult.failed })})
                </span>
              )}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetState();
            }}
          >
            {batchResult ? tc("close") : tc("cancel")}
          </Button>
          {tab === "url" && !batchResult && (
            <Button onClick={handleImportUrl} disabled={importing || !url.trim()}>
              {importing ? t("importing") : t("import")}
            </Button>
          )}
          {tab === "local" && !batchResult && (
            <Button onClick={handleImportLocal} disabled={importing || !localPath.trim()}>
              {importing ? t("importing") : t("import")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
      {showWorkspaceBrowser && (
        <UIDialog open={showWorkspaceBrowser} onOpenChange={setShowWorkspaceBrowser}>
          <UIDialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t("attachImageFromWorkspace")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-1">
                <Label>{t("importLocalPath") || "Server path"}</Label>
                <Input
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder={t("importLocalPlaceholder") || "e.g. data/skills/my-skill/SKILL.md"}
                  className="text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[2fr,3fr] gap-4">
                <div className="space-y-2">
                  <Label>{t("rootPaths")}</Label>
                  <div className="space-y-1">
                    {workspaceRoots.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">
                        {t("importLocalDesc")}
                      </p>
                    ) : (
                      workspaceRoots.map((root) => (
                        <button
                          key={root}
                          className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs hover:bg-accent ${
                            selectedRoot === root ? "bg-accent" : ""
                          }`}
                          onClick={() => {
                            setSelectedRoot(root);
                          }}
                        >
                          <FolderSearch className="h-3.5 w-3.5" />
                          <span className="truncate">{root}</span>
                          <ChevronRight className="ml-auto h-3 w-3" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("selectFolder")}</Label>
                  <div className="h-60 rounded-md border">
                    {selectedRoot ? (
                      <FileBrowser
                        workspaceId={workspaceId ?? ""}
                        folderPath={selectedRoot}
                        isGitRepo={false}
                        selectedFilePath={localPath || null}
                        onFileSelect={(path) => {
                          if (!path) return;
                          setLocalPath(path);
                        }}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        {t("rootPaths")}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowWorkspaceBrowser(false);
                    setSelectedRoot(null);
                  }}
                >
                  {tc("cancel")}
                </Button>
                <Button
                  onClick={() => {
                    setShowWorkspaceBrowser(false);
                  }}
                  disabled={!localPath.trim()}
                >
                  {tc("confirm")}
                </Button>
              </div>
            </div>
          </UIDialogContent>
        </UIDialog>
      )}
    </Dialog>
  );
}
