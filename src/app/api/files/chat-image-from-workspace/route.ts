import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  getWorkspaceRoots,
  readFileBuffer,
  uploadFile,
  validatePath,
} from "@/lib/files/filesystem";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { path?: string };
    const srcPath = body.path;

    if (!srcPath) {
      return NextResponse.json(
        { error: "Missing path" },
        { status: 400 },
      );
    }

    // Ensure source is within WORKSPACE_ROOTS
    const validatedSrc = validatePath(srcPath);
    const roots = getWorkspaceRoots();
    const normalizedSrc = validatedSrc.replace(/\\/g, "/").toLowerCase();
    const root = roots.find((r) =>
      normalizedSrc === r.replace(/\\/g, "/").toLowerCase() ||
      normalizedSrc.startsWith(r.replace(/\\/g, "/").toLowerCase() + "/"),
    );

    if (!root) {
      return NextResponse.json(
        { error: "Path is not within a workspace root" },
        { status: 400 },
      );
    }

    const buffer = await readFileBuffer(validatedSrc);
    const baseName = path.basename(validatedSrc);
    // 将从工作区引用的图片统一复制到「工作目录/chat-images」下
    const tempDir = path.join(root, "chat-images");
    const tempName = `${Date.now()}_${baseName}`;
    const destPath = path.join(tempDir, tempName);

    await uploadFile(destPath, buffer);

    return NextResponse.json({
      path: destPath.replace(/\\/g, "/"),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to copy workspace image";
    const status = message.includes("Access denied") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

