import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fsp from "fs/promises";
import AdmZip from "adm-zip";
import { getWorkspaceRoots, pathExists, validatePath } from "@/lib/files/filesystem";
import { parseSkillMd, validateSkillData, insertSkill } from "@/app/api/skills/import/local/route";

const MAX_ZIP_BYTES = Number(process.env.CLAWHUB_MAX_ZIP_BYTES || 200 * 1024 * 1024); // 200MB
const CONVEX_DOWNLOAD_BASE = process.env.CLAWHUB_DOWNLOAD_BASE || "https://wry-manatee-359.convex.site";

function normalizePosix(p: string): string {
  return p.replace(/\\+/g, "/");
}

function deriveSlug(input: string): string {
  const raw = input.trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    const u = new URL(raw);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }

  return raw.replace(/^\/+/, "").split(/[?#]/)[0];
}

function assertWithinBaseDir(destPath: string, baseDir: string) {
  const normBase = normalizePosix(baseDir).toLowerCase();
  const normDest = normalizePosix(destPath).toLowerCase();
  if (normDest !== normBase && !normDest.startsWith(normBase + "/")) {
    throw new Error("Access denied: destination is not within baseDir");
  }
}

async function downloadZip(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to download skill zip (HTTP ${res.status})`);
  }

  const len = res.headers.get("content-length");
  if (len) {
    const n = Number(len);
    if (Number.isFinite(n) && n > MAX_ZIP_BYTES) {
      throw new Error("Zip too large");
    }
  }

  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_ZIP_BYTES) {
    throw new Error("Zip too large");
  }
  return Buffer.from(ab);
}

async function extractZipToDir(zipBuffer: Buffer, destDir: string) {
  // Ensure destDir exists (validatePath also ensures it stays in WORKSPACE_ROOTS)
  const validatedDestDir = validatePath(destDir);
  await fsp.mkdir(validatedDestDir, { recursive: true });

  const zip = new AdmZip(zipBuffer);
  for (const entry of zip.getEntries()) {
    const entryPath = normalizePosix(entry.entryName);
    if (!entryPath || entryPath.includes("\0")) continue;

    const outPath = path.resolve(validatedDestDir, entryPath);
    const normOut = normalizePosix(outPath).toLowerCase();
    const normRoot = normalizePosix(validatedDestDir).toLowerCase();
    if (normOut !== normRoot && !normOut.startsWith(normRoot + "/")) {
      throw new Error("Invalid zip entry path");
    }

    if (entry.isDirectory) {
      await fsp.mkdir(outPath, { recursive: true });
      continue;
    }

    await fsp.mkdir(path.dirname(outPath), { recursive: true });
    const content = entry.getData();
    await fsp.writeFile(outPath, content);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      input?: string;
      baseDir?: string;
      targetFolderName?: string;
      autoImport?: boolean;
    };

    const input = body.input?.trim();
    if (!input) {
      return NextResponse.json({ error: "Missing input" }, { status: 400 });
    }

    const slug = (body.targetFolderName || deriveSlug(input)).trim();
    if (!slug) {
      return NextResponse.json({ error: "Invalid skill slug" }, { status: 400 });
    }

    const roots = getWorkspaceRoots();
    if (roots.length === 0) {
      return NextResponse.json({ error: "No workspace roots configured" }, { status: 400 });
    }

    // Determine base directory for import destination
    let basePath: string;
    if (typeof body.baseDir === "string" && body.baseDir.trim()) {
      const normalizedBase = body.baseDir.replace(/\\/g, "/");
      const inRoot = roots.some((root) => {
        const nr = root.replace(/\\/g, "/");
        return normalizedBase === nr || normalizedBase.startsWith(nr.endsWith("/") ? nr : nr + "/");
      });
      if (!inRoot) {
        return NextResponse.json(
          { error: "Base directory is not within configured workspace roots" },
          { status: 400 },
        );
      }
      basePath = normalizedBase;
    } else {
      basePath = roots[0];
    }

    // Validate basePath and compute destination
    const validatedBaseDir = validatePath(basePath);
    const destDir = path.join(validatedBaseDir, slug);
    assertWithinBaseDir(destDir, validatedBaseDir);

    if (await pathExists(destDir)) {
      return NextResponse.json({ error: "Target folder already exists" }, { status: 400 });
    }

    const zipUrl = `${CONVEX_DOWNLOAD_BASE}/api/v1/download?slug=${encodeURIComponent(slug)}`;
    const zipBuffer = await downloadZip(zipUrl);

    await extractZipToDir(zipBuffer, destDir);

    // 可选：在解压后自动根据 SKILL.md（或第一个 .md）注册 Skill
    if (body.autoImport) {
      try {
        const entries = await fsp.readdir(destDir, { withFileTypes: true });
        const skillEntry =
          entries.find((e) => e.isFile() && e.name === "SKILL.md") ??
          entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"));

        if (skillEntry) {
          const skillPath = path.join(destDir, skillEntry.name);
          const content = await fsp.readFile(skillPath, "utf-8");
          const fallbackSlug =
            path.basename(path.dirname(skillPath)) ||
            path.basename(skillPath, path.extname(skillPath));

          const parsed = parseSkillMd(content, fallbackSlug);
          if (parsed && validateSkillData(parsed)) {
            await insertSkill(parsed, null);
          }
        }
      } catch (err) {
        // 自动导入失败不影响 zip 下载结果，仅在服务器日志中记录
        console.error("ClawHub auto-import failed:", err);
      }
    }

    return NextResponse.json({ success: true, destDir: normalizePosix(destDir) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import skill from ClawHub";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

