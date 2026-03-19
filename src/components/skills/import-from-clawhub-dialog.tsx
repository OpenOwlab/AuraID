"use client";

import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { FileBrowser } from "@/components/files/file-browser";

interface ImportFromClawHubDialogProps {
  trigger: React.ReactNode;
  workspaceRoots: string[];
}

function deriveSlug(input: string): string {
  const raw = input.trim();
  if (!raw) return "";

  // URL case
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const parts = u.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || "";
    } catch {
      // fallthrough
    }
  }

  // /slug case or slug
  return raw.replace(/^\/+/, "").split(/[?#]/)[0];
}

export function ImportFromClawHubDialog({
  trigger,
  workspaceRoots,
}: ImportFromClawHubDialogProps) {
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [slug, setSlug] = useState("");
  const [importing, setImporting] = useState(false);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [baseDir, setBaseDir] = useState<string>("");
  const [autoImport, setAutoImport] = useState(true);

  const handleInputChange = (v: string) => {
    setInput(v);
    const s = deriveSlug(v);
    if (s) setSlug(s);
  };

  const handleImport = async () => {
    if (!input.trim()) return;
    setImporting(true);
    try {
      const res = await fetch("/api/skills/import/clawhub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          baseDir: baseDir || undefined,
          targetFolderName: slug || undefined,
          autoImport,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Import failed");
      }
      toast.success(`Imported to ${data.destDir || "target directory"}`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>从 ClawHub 导入 Skill</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Skill 名称或 URL</Label>
            <Input
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="例如：https://clawhub.ai/chindden/skill-creator 或 skill-creator"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr,3fr]">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>目标文件夹名</Label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="例如：skill-creator"
                />
              </div>
              <div className="space-y-1">
                <Label>导入到目录</Label>
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

              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="auto-import-skill"
                  checked={autoImport}
                  onCheckedChange={(v) => setAutoImport(Boolean(v))}
                  className="h-3.5 w-3.5"
                />
                <label
                  htmlFor="auto-import-skill"
                  className="select-none text-xs text-muted-foreground"
                >
                  导入后自动在 AuraID 中注册该 Skill（优先使用 SKILL.md）
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>浏览 WORKSPACE_ROOTS</Label>
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
                            if (!baseDir) setBaseDir(root);
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
                              path.replace(/\\\\/g, "/").startsWith(
                                root.replace(/\\\\/g, "/")
                              )
                            ) || selectedRoot
                          );
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Configure WORKSPACE_ROOTS to browse destination.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleImport} disabled={importing || !input.trim()}>
              {importing ? "导入中..." : "导入"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

