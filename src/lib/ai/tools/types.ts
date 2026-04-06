/** Per-request LLM identity for tool behaviour (e.g. vision / tool-result shape). */
export interface AgentLlmContext {
  providerId: string;
  modelId: string;
}

/** Payload cached for readImage → toModelOutput (keyed by toolCallId). */
export interface ReadImageCachedPayload {
  base64: string;
  mediaType: string;
  width: number;
  height: number;
  fingerprint: string;
}

/** Shared context passed to each tool factory. */
export interface ToolContext {
  /** Validated absolute path to the workspace root. */
  validatedCwd: string;
  /** Resolve a relative or absolute file path against the workspace and validate it. */
  resolvePath: (filePath: string) => string;
  /** Absolute path to the kubeconfig file. */
  kubeconfigPath: string;
  /** Base environment variables for exec calls. */
  baseExecEnv: NodeJS.ProcessEnv;
  /** Optional workspace ID for recording cluster operations. */
  workspaceId?: string | null;
  /** Absolute path to the research history directory for the current session (if available). */
  researchHistoryDir?: string;
  /** Whether the agent is in long-agent mode (tighter truncation to conserve context). */
  isLongAgent?: boolean;
  /**
   * Session-scoped cache: tool execute stores base64 here; toModelOutput reads it.
   * Cleared per createAgentTools / HTTP request.
   */
  readImageBinaryByToolCallId?: Map<string, ReadImageCachedPayload>;
  /** Fingerprints (path + mtime) already sent to the model this request — skip duplicate image-data. */
  readImageSentFingerprints?: Set<string>;
}
