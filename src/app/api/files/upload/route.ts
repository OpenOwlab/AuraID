import { NextRequest, NextResponse } from "next/server";
import { uploadFile, validatePath } from "@/lib/files/filesystem";
import path from "path";

function normalizePosix(p: string): string {
  return p.replace(/\\+/g, "/");
}

function sanitizeRelativePath(input: string): string {
  const p = normalizePosix(input).trim().replace(/^\/+/, "");
  if (!p) throw new Error("Invalid relativePath");
  if (p.includes("\0")) throw new Error("Invalid relativePath: contains null bytes");
  // 禁止绝对路径/盘符/目录穿越
  if (p.startsWith("/") || /^[A-Za-z]:\//.test(p)) {
    throw new Error("Invalid relativePath: must be relative");
  }
  const segments = p.split("/").filter(Boolean);
  if (segments.some((s) => s === "." || s === "..")) {
    throw new Error("Invalid relativePath: path traversal detected");
  }
  return segments.join("/");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const targetDir = formData.get("targetDir") as string | null;
    const relativePath = formData.get("relativePath") as string | null;

    if (!file || !targetDir) {
      return NextResponse.json(
        { error: "Missing file or targetDir" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validatedTargetDir = validatePath(targetDir);
    const fileName = path.basename(file.name);

    let filePath: string;
    if (relativePath) {
      const rp = sanitizeRelativePath(relativePath);
      // relativePath 形如 FolderA/sub/file.txt；落盘位置为 targetDir/FolderA/sub/file.txt
      filePath = path.join(validatedTargetDir, rp);
    } else {
      filePath = path.join(validatedTargetDir, fileName);
    }

    // 确保最终路径仍然在 targetDir 下（避免 relativePath 越权写到同 root 的其它目录）
    const validatedFilePath = validatePath(filePath);
    const normTarget = normalizePosix(validatedTargetDir).toLowerCase();
    const normDest = normalizePosix(validatedFilePath).toLowerCase();
    if (normDest !== normTarget && !normDest.startsWith(normTarget + "/")) {
      throw new Error("Access denied: destination is not within targetDir");
    }

    await uploadFile(validatedFilePath, buffer);
    return NextResponse.json({ success: true, path: validatedFilePath });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload file";
    const status = message.includes("Access denied") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
