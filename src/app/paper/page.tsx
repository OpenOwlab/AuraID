"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, FolderOpen } from "lucide-react";
import { Header } from "@/components/layout/header";
import { PaperStudyPanel } from "@/components/paper-study/paper-study-panel";
import { ArticlePreview } from "@/components/paper-study/article-preview";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { usePaperNotesDir } from "@/lib/hooks/use-paper-notes-dir";
import { useWorkspaces } from "@/lib/hooks/use-workspaces";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Article } from "@/lib/article-search/types";

function isPathWithinRoot(path: string, root: string) {
  const normalize = (p: string) => p.replace(/\/+$/, "");
  const np = normalize(path);
  const nr = normalize(root);
  return np === nr || np.startsWith(`${nr}/`);
}

export default function PaperPage() {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");

  const tPaper = useTranslations("paperStudy");
  const { workspaces, isLoading: isWorkspacesLoading } = useWorkspaces();
  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId) || null,
    [workspaces, selectedWorkspaceId]
  );

  const workspaceFolderPath = selectedWorkspace?.folderPath;
  const { notesDir, setNotesDir } = usePaperNotesDir(selectedWorkspaceId || undefined);

  const validNotesDir = useMemo(() => {
    if (!notesDir) return "";
    if (!workspaceFolderPath) return "";
    return isPathWithinRoot(notesDir, workspaceFolderPath) ? notesDir : "";
  }, [notesDir, workspaceFolderPath]);

  const canRenderPaper = !!selectedWorkspaceId && !!selectedWorkspace;

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />
      <div className="flex-1 overflow-hidden">
        {!canRenderPaper ? (
          <div className="h-full flex items-center justify-center p-6">
            <div className="w-full max-w-xl rounded-xl border border-border/60 bg-card/80 p-6 shadow-sm">
              {isWorkspacesLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{tPaper("searching")}</span>
                </div>
              ) : workspaces.length === 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FolderOpen className="h-4 w-4" />
                    <span>{tPaper("noWorkspacesForPaper")}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tPaper("selectWorkspaceHelp")}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Label>{tPaper("selectWorkspaceTitle")}</Label>
                  <Select
                    value={selectedWorkspaceId}
                    onValueChange={(v) => {
                      setSelectedWorkspaceId(v);
                      setSelectedArticle(null);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={tPaper("selectWorkspaceTitle")} />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="text-xs text-muted-foreground">
                    {tPaper("selectWorkspaceHelp")}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={60} minSize={30}>
              <PaperStudyPanel
                workspaceId={selectedWorkspaceId}
                onArticleSelect={setSelectedArticle}
                notesDir={validNotesDir}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40} minSize={20}>
              <ArticlePreview
                article={selectedArticle}
                workspaceId={selectedWorkspaceId}
                onClose={() => setSelectedArticle(null)}
                notesDir={validNotesDir}
                onSetNotesDir={setNotesDir}
                workspaceFolderPath={workspaceFolderPath}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}
