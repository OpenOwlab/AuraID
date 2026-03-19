import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { skills } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { SkillExportData } from "@/types";
import { slugify } from "@/lib/utils/slugify";
import { parseSkillRow } from "@/lib/db/skills-utils";

export function validateSkillData(data: unknown): data is SkillExportData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.name === "string" &&
    d.name.length > 0 &&
    typeof d.slug === "string" &&
    d.slug.length > 0 &&
    typeof d.systemPrompt === "string" &&
    d.systemPrompt.length > 0
  );
}

/** Parse SKILL.md / command.md / agent.md YAML frontmatter + markdown body into a SkillExportData */
export function parseSkillMd(
  content: string,
  fallbackSlug: string
): SkillExportData | null {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) {
    return {
      name: fallbackSlug,
      slug: fallbackSlug,
      description: null,
      systemPrompt: content.trim(),
      steps: null,
      allowedTools: null,
      parameters: null,
    };
  }

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();
  if (!body) return null;

  const getValue = (key: string): string | undefined => {
    const m = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return m?.[1]?.trim();
  };

  const name = getValue("name") || fallbackSlug;
  const description = getValue("description") || null;

  const allowedToolsRaw = getValue("allowed-tools");
  let allowedTools: string[] | null = null;
  if (allowedToolsRaw) {
    const toolNames = new Set<string>();
    for (const part of allowedToolsRaw.split(",")) {
      const toolMatch = part.trim().match(/^(\w+)/);
      if (toolMatch) {
        toolNames.add(toolMatch[1].toLowerCase());
      }
    }
    if (toolNames.size > 0) {
      allowedTools = Array.from(toolNames);
    }
  }

  return {
    name,
    slug: slugify(name),
    description,
    systemPrompt: body,
    steps: null,
    allowedTools,
    parameters: null,
  };
}

export async function insertSkill(
  data: SkillExportData,
  workspaceId: string | null
): Promise<string | null> {
  try {
    const normalizedSlug = slugify(data.slug);
    if (!normalizedSlug) {
      return null;
    }

    let finalSlug = normalizedSlug;
    let attempt = 0;
    // ensure slug uniqueness within same scope
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await db
        .select()
        .from(skills)
        .where(
          and(
            eq(skills.slug, finalSlug),
            workspaceId ? eq(skills.workspaceId, workspaceId) : isNull(skills.workspaceId),
          ),
        )
        .limit(1);

      if (existing.length === 0) break;
      attempt++;
      finalSlug = `${normalizedSlug}-${attempt}`;
    }

    const id = nanoid();
    const now = new Date().toISOString();

    await db.insert(skills).values({
      id,
      workspaceId: workspaceId || null,
      name: data.name,
      slug: finalSlug,
      description: data.description || null,
      systemPrompt: data.systemPrompt,
      steps: data.steps ? JSON.stringify(data.steps) : null,
      allowedTools: data.allowedTools ? JSON.stringify(data.allowedTools) : null,
      parameters: data.parameters ? JSON.stringify(data.parameters) : null,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  } catch (error) {
    console.error("[skills/import/local] insertSkill failed:", error);
    return null;
  }
}

// POST /api/skills/import/local
// Body: { path: string, workspaceId?: string }
// - `path` is resolved relative to the LoopClaw project root (process.cwd())
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { path: skillPath, workspaceId } = body as { path?: string; workspaceId?: string };

    if (!skillPath || typeof skillPath !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'path' field" },
        { status: 400 },
      );
    }

    const projectRoot = process.cwd();
    const resolvedPath = path.resolve(projectRoot, skillPath);

    // Prevent escaping the project directory
    if (!resolvedPath.startsWith(projectRoot)) {
      return NextResponse.json(
        { error: "Path is outside LoopClaw project directory" },
        { status: 400 },
      );
    }

    let content: string;
    try {
      content = await fs.readFile(resolvedPath, "utf-8");
    } catch (error) {
      console.error("[skills/import/local] readFile failed:", error);
      return NextResponse.json(
        { error: "Failed to read skill file" },
        { status: 400 },
      );
    }

    const fallbackSlug =
      path.basename(path.dirname(resolvedPath)) || path.basename(resolvedPath, path.extname(resolvedPath));

    const parsed = parseSkillMd(content, fallbackSlug);
    if (!parsed || !validateSkillData(parsed)) {
      return NextResponse.json(
        { error: "Invalid skill definition in file" },
        { status: 400 },
      );
    }

    const id = await insertSkill(parsed, workspaceId || null);
    if (!id) {
      return NextResponse.json(
        { error: "Failed to create skill" },
        { status: 500 },
      );
    }

    const skillRows = await db
      .select()
      .from(skills)
      .where(eq(skills.id, id))
      .limit(1);

    if (skillRows.length === 0) {
      return NextResponse.json(
        { error: "Skill created but could not be loaded" },
        { status: 500 },
      );
    }

    return NextResponse.json(parseSkillRow(skillRows[0]), { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import local skill";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

