"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bot, Settings, Zap, FolderOpen, Minimize2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { LanguageToggle } from "./language-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HeaderProps {
  onToggleMinimalMode?: () => void;
  showMinimalToggle?: boolean;
}

export function Header({ onToggleMinimalMode, showMinimalToggle }: HeaderProps) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();

  // Extract workspaceId from URL like /workspace/xxx
  const workspaceMatch = pathname.match(/^\/workspace\/([^/]+)/);
  const workspaceId = workspaceMatch?.[1] ?? null;

  return (
    <TooltipProvider delayDuration={300}>
      <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/90">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center px-4">
          {/* Brand */}
          <div className="flex items-center gap-4">
            <Link href="/" className="group flex items-center gap-3 font-semibold">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent/25 via-primary/25 to-accent/35 ring-2 ring-primary/30 shadow-sm shadow-primary/30">
                <Bot className="h-5 w-5 text-primary transition-transform duration-200 group-hover:scale-110" />
              </div>
              <span className="bg-gradient-to-r from-accent via-primary to-accent bg-clip-text text-xl font-semibold text-transparent leading-none">
                AuraID
              </span>
            </Link>
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground md:inline-flex">
              AI WORKSPACE
            </span>
          </div>

          {/* Main nav */}
          <nav className="ml-8 hidden flex-1 items-center gap-4 text-sm md:flex">
            <Link
              href="/"
              className={`border-b-2 pb-1 transition-colors ${
                pathname === "/"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              Workspace
            </Link>
            <Link
              href="/paper"
              className={`border-b-2 pb-1 transition-colors ${
                pathname.startsWith("/paper")
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              Paper Studio
            </Link>
            <Link
              href="/cluster"
              className={`border-b-2 pb-1 transition-colors ${
                pathname.startsWith("/cluster")
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              Cluster
            </Link>
            <Link
              href="/datasets"
              className={`border-b-2 pb-1 transition-colors ${
                pathname === "/datasets"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {t("datasets")}
            </Link>
            <Link
              href="/skills"
              className={`border-b-2 pb-1 transition-colors ${
                pathname === "/skills"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {t("skills")}
            </Link>

            <div className="flex-1" />

            {/* Quick workspace back when in nested routes */}
            {workspaceId && pathname !== `/workspace/${workspaceId}` && (
              <button
                type="button"
                onClick={() => router.push(`/workspace/${workspaceId}`)}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span>{t("workspace")}</span>
              </button>
            )}
          </nav>

          {/* Right tools */}
          <div className="ml-auto flex items-center gap-1.5">
            {showMinimalToggle && onToggleMinimalMode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg transition-all duration-200 hover:bg-primary/10 hover:text-primary"
                    onClick={onToggleMinimalMode}
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-card border-border/50">
                  {t("minimalMode")}
                </TooltipContent>
              </Tooltip>
            )}

            <LanguageToggle />
            <ThemeToggle />

            <div className="mx-1 h-5 w-px bg-border/50" />

            <Tooltip>
              <TooltipTrigger asChild>
                {pathname === "/settings" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg bg-primary/10 text-primary"
                    onClick={() => router.back()}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                ) : (
                  <Link href="/settings">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-lg transition-all duration-200 hover:bg-muted hover:text-foreground"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </Link>
                )}
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card border-border/50">
                {t("settings")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>
    </TooltipProvider>
  );
}
