import fsp from "fs/promises";
import path from "path";
import { minimatch } from "minimatch";
import sharp from "sharp";
import { tool } from "ai";
import type { ToolResultOutput } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { readFileBuffer } from "@/lib/files/filesystem";
import { modelSupportsImages } from "@/lib/ai/models";
import { sniffImageMime } from "./image-sniff";
import type { AgentLlmContext, ToolContext } from "./types";

export type ReadImageToolSuccess = {
  ok: true;
  path: string;
  mediaType: string;
  width: number;
  height: number;
  byteSize: number;
  downscaled: boolean;
  duplicateSkipped?: boolean;
  fingerprint: string;
};

export type ReadImageToolFailure = {
  ok: false;
  error: string;
};

export type ReadImageToolOutput = ReadImageToolSuccess | ReadImageToolFailure;

function parseEnvInt(name: string, def: number): number {
  const v = parseInt(process.env[name] || "", 10);
  return Number.isFinite(v) && v > 0 ? v : def;
}

function imageGlobsConfigured(): string[] {
  const raw = process.env.READ_IMAGE_GLOBS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function passesImageGlob(relativePosixPath: string, patterns: string[]): boolean {
  return patterns.some((p) => minimatch(relativePosixPath, p, { dot: true }));
}

function textOnlyMode(): boolean {
  const v = process.env.AGENT_READ_IMAGE_AS_TEXT_ONLY?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function pipelineToOutput(
  pipeline: sharp.Sharp,
  format: keyof sharp.FormatEnum | undefined
): Promise<{
  buffer: Buffer;
  mediaType: string;
  width: number;
  height: number;
}> {
  const maxOut = parseEnvInt("READ_IMAGE_MAX_OUTPUT_BYTES", 4 * 1024 * 1024);

  let outBuffer: Buffer;
  let outMime: string;
  let width: number;
  let height: number;

  if (format === "jpeg" || format === "jpg") {
    outMime = "image/jpeg";
    const { data, info } = await pipeline
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    outBuffer = data;
    width = info.width ?? 0;
    height = info.height ?? 0;
  } else if (format === "png") {
    outMime = "image/png";
    const { data, info } = await pipeline
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    outBuffer = data;
    width = info.width ?? 0;
    height = info.height ?? 0;
  } else if (format === "webp") {
    outMime = "image/webp";
    const { data, info } = await pipeline
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    outBuffer = data;
    width = info.width ?? 0;
    height = info.height ?? 0;
  } else {
    outMime = "image/jpeg";
    const { data, info } = await pipeline
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    outBuffer = data;
    width = info.width ?? 0;
    height = info.height ?? 0;
  }

  if (outBuffer.length > maxOut) {
    const tighter = await sharp(outBuffer)
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
    if (tighter.length > maxOut) {
      throw new Error(
        `Image still exceeds READ_IMAGE_MAX_OUTPUT_BYTES (${maxOut}) after compression; use a smaller file.`
      );
    }
    outBuffer = tighter;
    outMime = "image/jpeg";
    const m = await sharp(outBuffer).metadata();
    width = m.width ?? width;
    height = m.height ?? height;
  }

  return { buffer: outBuffer, mediaType: outMime, width, height };
}

async function decodeAndLimit(input: Buffer): Promise<{
  buffer: Buffer;
  mediaType: string;
  width: number;
  height: number;
  downscaled: boolean;
}> {
  const maxEdge = parseEnvInt("READ_IMAGE_MAX_EDGE", 4096);
  const maxPixels = parseEnvInt("READ_IMAGE_MAX_PIXELS", 16_777_216);

  let pipeline = sharp(input, { failOnError: true, animated: false });
  let meta = await pipeline.metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Invalid or unsupported image: could not read dimensions.");
  }
  const w = meta.width;
  const h = meta.height;
  const pixels = w * h;
  let downscaled = false;

  if (w > maxEdge || h > maxEdge || pixels > maxPixels) {
    downscaled = true;
    pipeline = sharp(input, { failOnError: true, animated: false }).resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    });
    meta = await pipeline.metadata();
    if (!meta.width || !meta.height) {
      throw new Error("Failed to resize image.");
    }
  }

  const format = meta.format;
  const result = await pipelineToOutput(pipeline, format);

  return {
    buffer: result.buffer,
    mediaType: result.mediaType,
    width: result.width,
    height: result.height,
    downscaled,
  };
}

export function createImageTools(ctx: ToolContext, llm: AgentLlmContext) {
  const cache = ctx.readImageBinaryByToolCallId!;
  const sentFp = ctx.readImageSentFingerprints!;

  return {
    readImage: tool({
      description:
        "Load an image from the workspace for multimodal vision. Path is relative to the workspace root or absolute within allowed roots. Use when you need to see a screenshot, diagram, or photo. Returns image data to the model via the tool result (not a user attachment).",
      inputSchema: z.object({
        imagePath: z
          .string()
          .describe("Path to the image file (relative to workspace or absolute)."),
      }),
      execute: async (
        { imagePath },
        { toolCallId }
      ): Promise<ReadImageToolOutput> => {
        let resolved: string;
        try {
          resolved = ctx.resolvePath(imagePath);
        } catch (e) {
          return {
            ok: false,
            error:
              e instanceof Error ? e.message : "Invalid or denied image path.",
          };
        }

        const globs = imageGlobsConfigured();
        if (globs.length > 0) {
          const rel = path
            .relative(ctx.validatedCwd, resolved)
            .replace(/\\/g, "/");
          const relKey = rel === "" ? "." : rel;
          if (!passesImageGlob(relKey, globs)) {
            return {
              ok: false,
              error: `Path is not matched by READ_IMAGE_GLOBS patterns (${globs.join(", ")}). Relative path: ${relKey}`,
            };
          }
        }

        let st: Awaited<ReturnType<typeof fsp.stat>>;
        try {
          st = await fsp.stat(resolved);
        } catch (e) {
          return {
            ok: false,
            error:
              e instanceof Error
                ? `Cannot stat file: ${e.message}`
                : "Cannot stat file.",
          };
        }

        if (!st.isFile()) {
          return { ok: false, error: "Path is not a regular file." };
        }

        const maxBytes = parseEnvInt("READ_IMAGE_MAX_BYTES", 12 * 1024 * 1024);
        if (st.size > maxBytes) {
          return {
            ok: false,
            error: `File size ${st.size} exceeds READ_IMAGE_MAX_BYTES (${maxBytes}).`,
          };
        }

        const fingerprint = `${resolved}\0${st.mtimeMs}`;

        if (sentFp.has(fingerprint)) {
          return {
            ok: true,
            path: resolved,
            mediaType: "image/jpeg",
            width: 0,
            height: 0,
            byteSize: 0,
            downscaled: false,
            duplicateSkipped: true,
            fingerprint,
          };
        }

        let raw: Buffer;
        try {
          raw = await readFileBuffer(resolved);
        } catch (e) {
          return {
            ok: false,
            error:
              e instanceof Error ? e.message : "Failed to read image file.",
          };
        }

        const mimeSniff = sniffImageMime(raw);
        if (!mimeSniff) {
          return {
            ok: false,
            error:
              "File is not a recognized image format (magic bytes mismatch).",
          };
        }

        try {
          const {
            buffer: outBuf,
            mediaType,
            width,
            height,
            downscaled,
          } = await decodeAndLimit(raw);

          const b64 = outBuf.toString("base64");
          cache.set(toolCallId, {
            base64: b64,
            mediaType,
            width,
            height,
            fingerprint,
          });

          return {
            ok: true,
            path: resolved,
            mediaType,
            width,
            height,
            byteSize: outBuf.length,
            downscaled,
            fingerprint,
          };
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : "Failed to decode or process image.";
          return {
            ok: false,
            error: `Image processing failed: ${msg}`,
          };
        }
      },
      async toModelOutput({
        toolCallId,
        output,
      }): Promise<ToolResultOutput> {
        if (!output.ok) {
          return { type: "error-text", value: output.error };
        }

        const fallbackText = `readImage: ${output.path}\nThis model or deployment does not accept images in tool results. Attach the image in chat or switch to a vision-capable model.`;

        if (textOnlyMode() || !modelSupportsImages(llm.providerId, llm.modelId)) {
          return {
            type: "text",
            value: fallbackText,
          };
        }

        if (output.duplicateSkipped) {
          return {
            type: "text",
            value:
              `Duplicate readImage for the same file in this request (already attached earlier): ${output.path}\n` +
              `Use the earlier tool result for visual context.`,
          };
        }

        const payload = cache.get(toolCallId);
        if (!payload) {
          return {
            type: "error-text",
            value: "Internal error: image payload missing for this tool call.",
          };
        }

        if (sentFp.has(payload.fingerprint)) {
          return {
            type: "text",
            value:
              `The same image file was already provided to the model in this request: ${output.path}\n` +
              `Refer to the previous readImage tool result.`,
          };
        }

        sentFp.add(payload.fingerprint);

        const metaLine = `Loaded image: ${output.path} (${payload.width}x${payload.height}, ${payload.mediaType}${output.downscaled ? ", downscaled" : ""})`;

        return {
          type: "content",
          value: [
            { type: "text", text: metaLine },
            {
              type: "image-data",
              data: payload.base64,
              mediaType: payload.mediaType,
            },
          ],
        };
      },
    }),
  };
}
