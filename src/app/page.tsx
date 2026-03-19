"use client";

import { useEffect, useState, useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { FolderOpen, GitBranch, Sparkles, Cpu, Zap, Brain, Code2, GraduationCap, Server } from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { WorkspaceList } from "@/components/workspaces/workspace-list";
import { OpenWorkspaceDialog } from "@/components/workspaces/open-workspace-dialog";
import { CloneRepoDialog } from "@/components/git/clone-repo-dialog";
import { ImportFromClawHubDialog } from "@/components/skills/import-from-clawhub-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkspaces } from "@/lib/hooks/use-workspaces";
import { toast } from "sonner";
import { ParticleEffect, FloatingOrbs } from "@/components/ui/particle-effect";

export default function HomePage() {
  const t = useTranslations("home");
  const tCommon = useTranslations("common");
  const { workspaces, isLoading, mutate } = useWorkspaces();
  const [workspaceRoots, setWorkspaceRoots] = useState<string[]>([]);
  const mounted = useSyncExternalStore(
    (cb) => { cb(); return () => {}; },
    () => true,
    () => false,
  );

  useEffect(() => {
    // Fetch workspace roots from settings API
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.workspaceRoots) {
          setWorkspaceRoots(data.workspaceRoots);
        }
      })
      .catch(() => {});
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm(t("deleteConfirm"))) return;

    try {
      await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
      mutate();
    } catch {
      toast.error("Failed to delete workspace");
    }
  };

  // Feature cards data
  const features = useMemo(
    () => [
      { icon: Brain, label: "Research Agent", desc: "Multi-step coding & research workflows" },
      { icon: Code2, label: "Code & Notes", desc: "Browse, edit, and summarize your projects" },
      { icon: Zap, label: "RAG Search", desc: "Grounded answers over workspace files" },
    ],
    [],
  );

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />
      <ScrollArea className="flex-1">
        <main className="relative min-h-full overflow-hidden">
          {/* Subtle background band for hero */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-r from-accent/15 via-primary/20 to-accent/15" />

          <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-4 pt-6 pb-10 lg:flex-row">
            {/* Left: Hero & actions */}
            <section className="flex-1 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary/10 via-accent/15 to-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span>{t("subtitle") || "AuraID · Self-hosted AI workspace"}</span>
              </div>

              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                  <span className="block text-sm font-medium tracking-[0.25em] text-muted-foreground">
                    AuraID Workspaces
                  </span>
                  <span className="mt-3 block bg-gradient-to-r from-accent via-primary to-accent bg-clip-text text-transparent">
                    {t("heroHeadline")}
                  </span>
                </h1>
                <p className="mt-4 max-w-xl text-sm text-muted-foreground">
                  {t("longDescription")}
                </p>
              </div>

              <div className="mt-14 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <OpenWorkspaceDialog
                    workspaceRoots={workspaceRoots}
                    trigger={
                      <Button size="lg" className="gap-2">
                        <FolderOpen className="h-4 w-4" />
                        {t("openWorkspace")}
                      </Button>
                    }
                  />
                <CloneRepoDialog
                  workspaceRoots={workspaceRoots}
                  trigger={
                    <Button variant="outline" size="lg" className="gap-2">
                      <GitBranch className="h-4 w-4" />
                      {t("cloneFromGithub")}
                    </Button>
                  }
                />
                <ImportFromClawHubDialog
                  workspaceRoots={workspaceRoots}
                  trigger={
                    <Button variant="outline" size="lg" className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      从 ClawHub 导入 Skill
                    </Button>
                  }
                />
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                    <Brain className="h-3 w-3" />
                    Agent
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-accent">
                    <GraduationCap className="h-3 w-3" />
                    Paper Studio
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary/40 px-2 py-0.5 text-secondary-foreground">
                    <Server className="h-3 w-3" />
                    Cluster
                  </span>
                </div>
                </div>

                {/* Secondary navigation to feature areas */}
                <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
                  {features.map((feature) => (
                    <div
                      key={feature.label}
                      className="rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm"
                    >
                      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <feature.icon
                          className={
                            feature.label === "Research Agent"
                              ? "h-3.5 w-3.5 text-primary"
                              : feature.label === "Code & Notes"
                              ? "h-3.5 w-3.5 text-accent"
                              : "h-3.5 w-3.5 text-secondary-foreground"
                          }
                        />
                        <span>{feature.label}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                        {feature.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Right: workspace overview */}
            <section className="w-full space-y-4 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm lg:w-[440px]">
              <header className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <Cpu className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">{t("title")}</h2>
                    {workspaces.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        {t("empty") || "Manage the folders you work in most."}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        {t("lastOpened") || "Recently opened workspaces"}
                      </p>
                    )}
                  </div>
                </div>
                {workspaces.length > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {workspaces.length} workspaces
                  </span>
                )}
              </header>

              <div className="h-px w-full bg-gradient-to-r from-accent/40 via-primary/40 to-accent/40" />

              {isLoading ? (
                <div className="grid grid-cols-1 gap-3">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="h-16 animate-shimmer rounded-xl border border-border/60"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </div>
              ) : workspaces.length === 0 ? (
                <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border/70 bg-muted/40 p-4 text-left">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <FolderOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{t("noWorkspaces") || "No workspaces yet"}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("noWorkspacesDesc") || "Create or open a workspace to get started with AuraID"}
                    </p>
                  </div>
                  <OpenWorkspaceDialog
                    workspaceRoots={workspaceRoots}
                    trigger={
                      <Button size="sm" className="mt-1 gap-1">
                        <FolderOpen className="h-3.5 w-3.5" />
                        {t("openWorkspace")}
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {workspaces.map((workspace) => (
                    <Link
                      key={workspace.id}
                      href={`/workspace/${workspace.id}`}
                      className="block rounded-xl border border-border/70 bg-card/90 px-3 py-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                          <FolderOpen className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {workspace.name || workspace.folderPath.split("/").slice(-1)[0]}
                            </p>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground font-mono break-all leading-snug">
                            {workspace.folderPath}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDelete(workspace.id);
                          }}
                          className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={tCommon("delete") || "Delete"}
                        >
                          ×
                        </button>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </ScrollArea>
    </div>
  );
}
