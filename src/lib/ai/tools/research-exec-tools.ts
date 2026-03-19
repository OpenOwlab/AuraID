import { tool } from "ai";
import { z } from "zod";
import { execInWorkspace } from "@/lib/utils/shell";
import { getCapabilities, requireCapability } from "@/lib/research-exec/capabilities";
import { checkJobStatus } from "@/lib/research-exec/job-monitor";
import { TRUNCATE, BUFFER } from "@/lib/constants";
import type { RJobProfileConfig } from "@/lib/research-exec/types";
import type { ToolContext } from "./types";

/**
 * Create research execution tools — all capability-gated.
 * Follows the same factory pattern as k8s-tools.
 */
export function createResearchExecTools(ctx: ToolContext) {
  /** Helper: load capabilities for the current workspace. */
  async function loadCaps() {
    if (!ctx.workspaceId) {
      return { blocked: true as const, error: "No workspace context for research execution." };
    }
    return getCapabilities(ctx.workspaceId);
  }

  /** Build a complete rjob submit command from profile config. */
  function buildRjobCommand(cfg: RJobProfileConfig, jobName: string, userCommand: string): string {
    const parts = ["rjob submit", `--name=${jobName}`];
    if (cfg.defaultMemoryMb) parts.push(`--memory=${cfg.defaultMemoryMb}`);
    if (cfg.defaultCpu) parts.push(`--cpu=${cfg.defaultCpu}`);
    if (cfg.defaultGpu) parts.push(`--gpu=${cfg.defaultGpu}`);
    if (cfg.chargedGroup) parts.push(`--charged-group=${cfg.chargedGroup}`);
    if (cfg.privateMachine) parts.push(`--private-machine=${cfg.privateMachine}`);
    for (const m of cfg.mounts) {
      parts.push(`--mount=${m.source}:${m.target}`);
    }
    parts.push(`--image=${cfg.image}`);
    if (cfg.priority != null) parts.push(`-P ${cfg.priority}`);
    if (cfg.hostNetwork) parts.push("--host-network=true");
    if (cfg.env) {
      for (const [k, v] of Object.entries(cfg.env)) {
        parts.push(`-e ${k}=${v}`);
      }
    }
    parts.push(`-- /bin/bash -lc '${userCommand.replace(/'/g, "'\\''")}'`);
    return parts.join(" ");
  }

  return {
    listRemoteProfiles: tool({
      description:
        "List all configured remote execution profiles for the current workspace. Use this to discover available profileIds before calling other research execution tools (previewRemoteSync, executeRemoteSync, submitRemoteJob, etc.).",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.workspaceId) {
          return { blocked: true as const, error: "No workspace context for research execution." };
        }
        const { db } = await import("@/lib/db");
        const { remoteProfiles } = await import("@/lib/db/schema");
        const { eq } = await import("drizzle-orm");
        const profiles = await db
          .select()
          .from(remoteProfiles)
          .where(eq(remoteProfiles.workspaceId, ctx.workspaceId));

        if (profiles.length === 0) {
          return {
            profiles: [],
            message: "No remote profiles configured. Ask the user to create one in the Research Execution → Remote Profiles panel.",
          };
        }

        return {
          profiles: profiles.map((p) => {
            let rjobConfig: RJobProfileConfig | null = null;
            if (p.rjobConfigJson) {
              try {
                rjobConfig = JSON.parse(p.rjobConfigJson) as RJobProfileConfig;
              } catch { /* ignore malformed JSON */ }
            }
            return {
              id: p.id,
              name: p.name,
              host: p.host,
              port: p.port,
              username: p.username,
              remotePath: p.remotePath,
              schedulerType: p.schedulerType,
              sshKeyRef: p.sshKeyRef,
              ...(rjobConfig ? { rjobConfig } : {}),
            };
          }),
        };
      },
    }),

    inspectCodeWorkspace: tool({
      description:
        "Inspect the codebase workspace: list directory structure, identify experiment entrypoints, config files, and output directories. Requires canReadCodebase capability.",
      inputSchema: z.object({
        maxDepth: z
          .number()
          .optional()
          .describe("Max directory depth to scan (default: 3)"),
      }),
      execute: async ({ maxDepth }) => {
        const caps = await loadCaps();
        if ("blocked" in caps) return caps;
        const block = requireCapability(caps, "canReadCodebase", "inspect code workspace");
        if (block) return block;

        const depth = Math.max(1, Math.min(maxDepth ?? 3, 5));
        const result = await execInWorkspace(
          `find . -maxdepth ${depth} -type f -not -path './.git/*' -not -path '*/node_modules/*' -not -path '*/__pycache__/*' -not -path '*.pyc' | head -500`,
          ctx.validatedCwd,
          { timeout: 10_000 },
        );

        return {
          files: result.stdout.slice(0, TRUNCATE.STDOUT_LARGE),
          cwd: ctx.validatedCwd,
          exitCode: result.exitCode,
        };
      },
    }),

    proposeExperimentPatch: tool({
      description:
        "Generate a structured summary of proposed code/config changes for an experiment. Does NOT apply changes — just plans them. Requires canReadCodebase.",
      inputSchema: z.object({
        objective: z.string().describe("What the experiment change should accomplish"),
        targetFiles: z
          .array(z.string())
          .optional()
          .describe("Specific files to focus on (relative paths)"),
      }),
      execute: async ({ objective, targetFiles }) => {
        const caps = await loadCaps();
        if ("blocked" in caps) return caps;
        const block = requireCapability(caps, "canReadCodebase", "propose experiment patch");
        if (block) return block;

        // Read target files for context
        const fileContents: Record<string, string> = {};
        if (targetFiles) {
          for (const f of targetFiles.slice(0, 5)) {
            try {
              const resolved = ctx.resolvePath(f);
              const result = await execInWorkspace(`cat '${resolved.replace(/'/g, "'\\''")}'`, ctx.validatedCwd, {
                timeout: 5_000,
                maxBuffer: BUFFER.DEFAULT,
              });
              fileContents[f] = result.stdout.slice(0, TRUNCATE.FILE_CONTENT);
            } catch { /* skip unreadable files */ }
          }
        }

        return {
          objective,
          targetFiles: targetFiles ?? [],
          fileContents,
          instruction: "Based on the objective and file contents, propose specific changes. Return a structured patch plan with: files to change, what to change in each, and why.",
        };
      },
    }),

    applyExperimentPatch: tool({
      description:
        "Apply a code/config change to the workspace. Requires canWriteCodebase. IMPORTANT: Only call after the user has reviewed and approved the proposed patch.",
      inputSchema: z.object({
        filePath: z.string().describe("Path to the file to modify (relative to workspace root)"),
        content: z.string().describe("New file content"),
        confirmApply: z
          .boolean()
          .optional()
          .describe("Must be true to actually apply. Set to false or omit for dry-run."),
      }),
      execute: async ({ filePath, content, confirmApply }) => {
        const caps = await loadCaps();
        if ("blocked" in caps) return caps;
        const block = requireCapability(caps, "canWriteCodebase", "apply experiment patch");
        if (block) return block;

        if (!confirmApply) {
          return {
            dryRun: true,
            filePath,
            contentLength: content.length,
            message: "Dry run — set confirmApply=true to write the file.",
          };
        }

        const resolved = ctx.resolvePath(filePath);
        const { writeFile } = await import("@/lib/files/filesystem");
        await writeFile(resolved, content);

        return {
          success: true,
          path: resolved,
          bytesWritten: content.length,
        };
      },
    }),

    previewRemoteSync: tool({
      description:
        "Preview what files would be synced to the remote target (dry-run rsync). Requires canSyncRemote.",
      inputSchema: z.object({
        profileId: z.string().describe("Remote execution profile ID"),
        excludePatterns: z
          .array(z.string())
          .optional()
          .describe("Patterns to exclude from sync (e.g. '.git', 'node_modules')"),
      }),
      execute: async ({ profileId, excludePatterns }) => {
        const caps = await loadCaps();
        if ("blocked" in caps) return caps;
        const block = requireCapability(caps, "canSyncRemote", "preview remote sync");
        if (block) return block;

        // Load profile from DB
        const { db } = await import("@/lib/db");
        const { remoteProfiles } = await import("@/lib/db/schema");
        const { eq } = await import("drizzle-orm");
        const [profile] = await db
          .select()
          .from(remoteProfiles)
          .where(eq(remoteProfiles.id, profileId))
          .limit(1);

        if (!profile) {
          return { error: `Remote profile "${profileId}" not found.` };
        }

        const excludes = (excludePatterns ?? [".git", "node_modules", "__pycache__", "*.pyc"])
          .map((p) => `--exclude='${p.replace(/'/g, "'\\''")}'`)
          .join(" ");

        const sshOpt = profile.sshKeyRef
          ? `-e "ssh -o StrictHostKeyChecking=no -i ${profile.sshKeyRef} -p ${profile.port}"`
          : `-e "ssh -o StrictHostKeyChecking=no -p ${profile.port}"`;

        const cmd = `rsync -avnz ${sshOpt} ${excludes} ./ ${profile.username}@${profile.host}:${profile.remotePath}/`;

        const result = await execInWorkspace(cmd, ctx.validatedCwd, {
          timeout: 30_000,
          maxBuffer: BUFFER.DEFAULT,
        });

        return {
          dryRun: true,
          profile: { name: profile.name, host: profile.host, remotePath: profile.remotePath },
          stdout: result.stdout.slice(0, TRUNCATE.STDOUT_LARGE),
          stderr: result.stderr.slice(0, TRUNCATE.STDERR),
          exitCode: result.exitCode,
        };
      },
    }),

    executeRemoteSync: tool({
      description:
        "Execute rsync to sync workspace files to the remote target. Requires canSyncRemote AND canUseSSH. Only call after user has reviewed the sync preview.",
      inputSchema: z.object({
        profileId: z.string().describe("Remote execution profile ID"),
        excludePatterns: z
          .array(z.string())
          .optional()
          .describe("Patterns to exclude from sync"),
        confirmSync: z
          .boolean()
          .optional()
          .describe("Must be true to execute. User must approve first."),
      }),
      execute: async ({ profileId, excludePatterns, confirmSync }) => {
        const caps = await loadCaps();
        if ("blocked" in caps) return caps;
        let block = requireCapability(caps, "canSyncRemote", "execute remote sync");
        if (block) return block;
        block = requireCapability(caps, "canUseSSH", "execute remote sync (SSH)");
        if (block) return block;

        if (!confirmSync) {
          return {
            blocked: true,
            error: "Sync not confirmed. Set confirmSync=true after user approval.",
          };
        }

        const { db } = await import("@/lib/db");
        const { remoteProfiles } = await import("@/lib/db/schema");
        const { eq } = await import("drizzle-orm");
        const [profile] = await db
          .select()
          .from(remoteProfiles)
          .where(eq(remoteProfiles.id, profileId))
          .limit(1);

        if (!profile) {
          return { error: `Remote profile "${profileId}" not found.` };
        }

        const excludes = (excludePatterns ?? [".git", "node_modules", "__pycache__", "*.pyc"])
          .map((p) => `--exclude='${p.replace(/'/g, "'\\''")}'`)
          .join(" ");

        const sshOpt = profile.sshKeyRef
          ? `-e "ssh -o StrictHostKeyChecking=no -i ${profile.sshKeyRef} -p ${profile.port}"`
          : `-e "ssh -o StrictHostKeyChecking=no -p ${profile.port}"`;

        const cmd = `rsync -avz ${sshOpt} ${excludes} ./ ${profile.username}@${profile.host}:${profile.remotePath}/`;

        const result = await execInWorkspace(cmd, ctx.validatedCwd, {
          timeout: 120_000,
          maxBuffer: BUFFER.LARGE,
        });

        return {
          success: result.exitCode === 0,
          profile: { name: profile.name, host: profile.host, remotePath: profile.remotePath },
          stdout: result.stdout.slice(0, TRUNCATE.STDOUT_LARGE),
          stderr: result.stderr.slice(0, TRUNCATE.STDERR),
          exitCode: result.exitCode,
        };
      },
    }),

    prepareJobSubmission: tool({
      description:
        "Prepare a structured job submission manifest for the remote target. Does NOT submit — just plans. Requires canSubmitJobs.",
      inputSchema: z.object({
        profileId: z.string().describe("Remote execution profile ID"),
        command: z.string().describe("The command to run on the remote"),
        jobName: z.string().optional().describe("Optional job name for tracking"),
      }),
      execute: async ({ profileId, command, jobName }) => {
        const caps = await loadCaps();
        if ("blocked" in caps) return caps;
        const block = requireCapability(caps, "canSubmitJobs", "prepare job submission");
        if (block) return block;

        const { db } = await import("@/lib/db");
        const { remoteProfiles } = await import("@/lib/db/schema");
        const { eq } = await import("drizzle-orm");
        const [profile] = await db
          .select()
          .from(remoteProfiles)
          .where(eq(remoteProfiles.id, profileId))
          .limit(1);

        if (!profile) {
          return { error: `Remote profile "${profileId}" not found.` };
        }

        const name = jobName || `rex-${Date.now()}`;

        if (profile.schedulerType === "slurm") {
          return {
            manifest: {
              type: "slurm",
              jobName: name,
              command: `sbatch --job-name=${name} --wrap='${command.replace(/'/g, "'\\''")}'`,
              profile: { name: profile.name, host: profile.host },
            },
            instruction: "Review this manifest, then call submitRemoteJob with the jobName and userCommand to submit.",
          };
        }

        if (profile.schedulerType === "rjob") {
          let cfg: RJobProfileConfig = {
            mounts: [],
            image: "pytorch/pytorch:latest",
            defaultMemoryMb: 16384,
            defaultCpu: 4,
            defaultGpu: 1,
          };
          if (profile.rjobConfigJson) {
            try {
              cfg = { ...cfg, ...JSON.parse(profile.rjobConfigJson) as RJobProfileConfig };
            } catch { /* use defaults */ }
          }

          const rjobCmd = buildRjobCommand(cfg, name, command);

          return {
            manifest: {
              type: "rjob",
              jobName: name,
              rjobSpec: {
                jobName: name,
                memoryMb: cfg.defaultMemoryMb ?? 16384,
                cpu: cfg.defaultCpu ?? 4,
                gpu: cfg.defaultGpu ?? 1,
                chargedGroup: cfg.chargedGroup,
                privateMachine: cfg.privateMachine,
                mounts: cfg.mounts,
                image: cfg.image,
                priority: cfg.priority,
                hostNetwork: cfg.hostNetwork,
                env: cfg.env,
                command: command,
                commandArgs: [],
              },
              command: rjobCmd,
              profile: { name: profile.name, host: profile.host },
              ...(cfg.exampleCommands?.length ? { exampleCommands: cfg.exampleCommands } : {}),
            },
            instruction: "Review this manifest. To submit, call submitRemoteJob with the jobName and userCommand — the tool will automatically use the profile's stored config for all rjob flags. Do NOT modify the rjob flags.",
          };
        }

        return {
          manifest: {
            type: "shell",
            jobName: name,
            command: `nohup bash -c '${command.replace(/'/g, "'\\''")}' > ${profile.remotePath}/${name}.log 2>&1 &`,
            profile: { name: profile.name, host: profile.host },
          },
          instruction: "Review this manifest, then call submitRemoteJob with the jobName and userCommand to submit.",
        };
      },
    }),

    submitRemoteJob: tool({
      description:
        "Submit a job to the remote target. Does exactly one thing: SSH login → run the command → exit. No other operations. For rjob profiles, builds the command from stored profile config automatically. If exit code is non-zero, show raw output to user and let them decide. Requires canSubmitJobs AND canUseSSH.",
      inputSchema: z.object({
        profileId: z.string().describe("Remote execution profile ID"),
        jobName: z.string().describe("Job name (used for --name= in rjob, or log file name for shell)"),
        userCommand: z.string().describe("The actual command to run (e.g. 'python train.py ...'). For rjob, this is wrapped in the container. For shell, this is run via nohup."),
        confirmSubmit: z
          .boolean()
          .optional()
          .describe("Must be true to submit. User must approve the manifest first."),
      }),
      execute: async ({ profileId, jobName, userCommand, confirmSubmit }) => {
        const caps = await loadCaps();
        if ("blocked" in caps) return caps;
        let block = requireCapability(caps, "canSubmitJobs", "submit remote job");
        if (block) return block;
        block = requireCapability(caps, "canUseSSH", "submit remote job (SSH)");
        if (block) return block;

        if (!confirmSubmit) {
          return {
            blocked: true,
            error: "Job submission not confirmed. Set confirmSubmit=true after user approval.",
          };
        }

        const { db } = await import("@/lib/db");
        const { remoteProfiles } = await import("@/lib/db/schema");
        const { eq } = await import("drizzle-orm");
        const [profile] = await db
          .select()
          .from(remoteProfiles)
          .where(eq(remoteProfiles.id, profileId))
          .limit(1);

        if (!profile) {
          return { error: `Remote profile "${profileId}" not found.` };
        }

        // Build the command based on scheduler type — agent cannot modify rjob flags
        let remoteCommand: string;
        if (profile.schedulerType === "rjob") {
          let cfg: RJobProfileConfig = {
            mounts: [],
            image: "pytorch/pytorch:latest",
            defaultMemoryMb: 16384,
            defaultCpu: 4,
            defaultGpu: 1,
          };
          if (profile.rjobConfigJson) {
            try {
              cfg = { ...cfg, ...JSON.parse(profile.rjobConfigJson) as RJobProfileConfig };
            } catch { /* use defaults */ }
          }
          remoteCommand = buildRjobCommand(cfg, jobName, userCommand);
        } else if (profile.schedulerType === "slurm") {
          remoteCommand = `sbatch --job-name=${jobName} --wrap='${userCommand.replace(/'/g, "'\\''")}'`;
        } else {
          remoteCommand = `nohup bash -c '${userCommand.replace(/'/g, "'\\''")}' > ${profile.remotePath}/${jobName}.log 2>&1 &`;
        }

        const sshBase = profile.sshKeyRef
          ? `ssh -o StrictHostKeyChecking=no -i ${profile.sshKeyRef} -p ${profile.port} ${profile.username}@${profile.host}`
          : `ssh -o StrictHostKeyChecking=no -p ${profile.port} ${profile.username}@${profile.host}`;

        // SSH login → run exactly the rjob command → exit. Nothing else.
        const fullCmd = `${sshBase} ${JSON.stringify(remoteCommand)}`;

        const result = await execInWorkspace(fullCmd, ctx.validatedCwd, {
          timeout: 120_000,
          maxBuffer: BUFFER.DEFAULT,
        });

        // Return raw output — let the user decide if anything looks wrong
        return {
          success: result.exitCode === 0,
          profile: { name: profile.name, host: profile.host },
          commandExecuted: remoteCommand,
          stdout: result.stdout.slice(0, TRUNCATE.STDOUT),
          stderr: result.stderr.slice(0, TRUNCATE.STDERR),
          exitCode: result.exitCode,
          ...(result.exitCode !== 0 ? {
            note: "Command exited with non-zero status. Please review the output and decide how to proceed.",
          } : {}),
        };
      },
    }),

    monitorJob: tool({
      description:
        "Check the status of a submitted experiment job on the remote target. SSHes in to check scheduler status (Slurm squeue/sacct) or process state (shell PID), plus marker files (DONE/FAILED), heartbeat, and log tail. Returns a structured status snapshot with a decision (still_running/completed/failed/needs_attention) and retryAfterSeconds. Requires canCollectRemoteResults AND canUseSSH.",
      inputSchema: z.object({
        profileId: z.string().describe("Remote execution profile ID"),
        runId: z.string().describe("Experiment run ID"),
        overrides: z
          .object({
            heartbeatPath: z.string().optional(),
            doneMarkerPath: z.string().optional(),
            failedMarkerPath: z.string().optional(),
            logPaths: z.array(z.string()).optional(),
          })
          .optional()
          .describe("Optional overrides for monitoring file paths"),
      }),
      execute: async ({ profileId, runId, overrides }) => {
        const caps = await loadCaps();
        if ("blocked" in caps) return caps;
        let block = requireCapability(caps, "canCollectRemoteResults", "monitor job");
        if (block) return block;
        block = requireCapability(caps, "canUseSSH", "monitor job (SSH)");
        if (block) return block;

        const { db } = await import("@/lib/db");
        const { remoteProfiles, experimentRuns } = await import("@/lib/db/schema");
        const { eq } = await import("drizzle-orm");

        const [profile] = await db
          .select()
          .from(remoteProfiles)
          .where(eq(remoteProfiles.id, profileId))
          .limit(1);
        if (!profile) {
          return { error: `Remote profile "${profileId}" not found.` };
        }

        const [run] = await db
          .select()
          .from(experimentRuns)
          .where(eq(experimentRuns.id, runId))
          .limit(1);
        if (!run) {
          return { error: `Experiment run "${runId}" not found.` };
        }

        // Build a typed profile for checkJobStatus
        const typedProfile = {
          id: profile.id,
          workspaceId: profile.workspaceId,
          name: profile.name,
          host: profile.host,
          port: profile.port,
          username: profile.username,
          remotePath: profile.remotePath,
          schedulerType: profile.schedulerType as "shell" | "slurm" | "rjob",
          sshKeyRef: profile.sshKeyRef,
          pollIntervalSeconds: profile.pollIntervalSeconds,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        };

        const typedRun = {
          ...run,
          status: run.status as import("@/lib/research-exec/types").ExperimentRunStatus,
          manifest: run.manifestJson ? JSON.parse(run.manifestJson) : null,
          monitoringConfig: run.monitoringConfigJson ? JSON.parse(run.monitoringConfigJson) : null,
          lastPolledAt: run.lastPolledAt,
          statusSnapshot: run.statusSnapshotJson ? JSON.parse(run.statusSnapshotJson) : null,
          collectApprovedAt: run.collectApprovedAt,
          resultSummary: run.resultSummaryJson ? JSON.parse(run.resultSummaryJson) : null,
          recommendation: run.recommendationJson ? JSON.parse(run.recommendationJson) : null,
        };

        const decision = await checkJobStatus(
          typedProfile,
          typedRun,
          ctx.validatedCwd,
          overrides ?? undefined,
        );

        // Persist snapshot and poll timestamp
        await db
          .update(experimentRuns)
          .set({
            statusSnapshotJson: JSON.stringify(decision.snapshot),
            lastPolledAt: decision.snapshot.observedAt,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(experimentRuns.id, runId));

        return decision;
      },
    }),

    collectRunResults: tool({
      description:
        "Collect experiment logs and results from the remote target via SSH/SCP. If a runId is provided, first verifies job completion — returns still_running or awaiting_manual_approval if not ready. Requires canCollectRemoteResults AND canUseSSH.",
      inputSchema: z.object({
        profileId: z.string().describe("Remote execution profile ID"),
        remotePaths: z
          .array(z.string())
          .describe("Remote file/directory paths to collect (relative to remote root)"),
        runId: z
          .string()
          .optional()
          .describe("Experiment run ID — if provided, verifies job completion before collecting"),
        localDestDir: z
          .string()
          .optional()
          .describe("Local directory to store results (default: ./results/)"),
      }),
      execute: async ({ profileId, remotePaths, runId, localDestDir }) => {
        const caps = await loadCaps();
        if ("blocked" in caps) return caps;
        let block = requireCapability(caps, "canCollectRemoteResults", "collect run results");
        if (block) return block;
        block = requireCapability(caps, "canUseSSH", "collect run results (SSH)");
        if (block) return block;

        // Pre-check: if runId provided, verify job is done and collection is approved
        if (runId) {
          const { db: runDb } = await import("@/lib/db");
          const { experimentRuns: runsTable } = await import("@/lib/db/schema");
          const { eq: runEq } = await import("drizzle-orm");
          const [run] = await runDb
            .select()
            .from(runsTable)
            .where(runEq(runsTable.id, runId))
            .limit(1);

          if (run) {
            const snapshot = run.statusSnapshotJson
              ? JSON.parse(run.statusSnapshotJson)
              : null;
            const completionState = snapshot?.completionState;
            if (completionState === "in_progress" || completionState === "not_started") {
              return {
                kind: "still_running" as const,
                ...(snapshot ? { snapshot } : {}),
                retryAfterSeconds: 60,
                message: "Job is still running. Use monitorJob to check status.",
              };
            }
            if (!run.collectApprovedAt) {
              return {
                kind: "awaiting_manual_approval" as const,
                ...(snapshot ? { snapshot } : {}),
                message: "Result collection requires manual approval. Set collectApprovedAt on the run to proceed.",
              };
            }
          }
        }

        const { db } = await import("@/lib/db");
        const { remoteProfiles } = await import("@/lib/db/schema");
        const { eq } = await import("drizzle-orm");
        const [profile] = await db
          .select()
          .from(remoteProfiles)
          .where(eq(remoteProfiles.id, profileId))
          .limit(1);

        if (!profile) {
          return { error: `Remote profile "${profileId}" not found.` };
        }

        const dest = localDestDir || "results";
        await execInWorkspace(`mkdir -p '${dest}'`, ctx.validatedCwd, { timeout: 5_000 });

        const sshOpt = profile.sshKeyRef
          ? `-e "ssh -o StrictHostKeyChecking=no -i ${profile.sshKeyRef} -p ${profile.port}"`
          : `-e "ssh -o StrictHostKeyChecking=no -p ${profile.port}"`;

        const results: Array<{ path: string; success: boolean; error?: string }> = [];
        for (const rp of remotePaths.slice(0, 10)) {
          const remoteFull = `${profile.username}@${profile.host}:${profile.remotePath}/${rp}`;
          const cmd = `rsync -avz ${sshOpt} ${remoteFull} ${dest}/`;
          const result = await execInWorkspace(cmd, ctx.validatedCwd, {
            timeout: 60_000,
            maxBuffer: BUFFER.LARGE,
          });
          results.push({
            path: rp,
            success: result.exitCode === 0,
            error: result.exitCode !== 0 ? result.stderr.slice(0, 500) : undefined,
          });
        }

        return { collected: results, localDestDir: dest };
      },
    }),

    analyzeRunResults: tool({
      description:
        "Read and summarize experiment output files (logs, metrics, CSVs) from the local workspace. Requires canReadCodebase.",
      inputSchema: z.object({
        resultPaths: z
          .array(z.string())
          .describe("Paths to result files or directories to analyze (relative to workspace)"),
      }),
      execute: async ({ resultPaths }) => {
        const caps = await loadCaps();
        if ("blocked" in caps) return caps;
        const block = requireCapability(caps, "canReadCodebase", "analyze run results");
        if (block) return block;

        const contents: Record<string, string> = {};
        for (const rp of resultPaths.slice(0, 10)) {
          try {
            const resolved = ctx.resolvePath(rp);
            const result = await execInWorkspace(
              `cat '${resolved.replace(/'/g, "'\\''")}'`,
              ctx.validatedCwd,
              { timeout: 5_000, maxBuffer: BUFFER.DEFAULT },
            );
            contents[rp] = result.stdout.slice(0, TRUNCATE.FILE_CONTENT);
          } catch { /* skip */ }
        }

        return {
          resultFiles: contents,
          instruction: "Analyze these outputs: summarize the run outcome, key metrics, likely success/failure factors, and confidence level.",
        };
      },
    }),

    recommendNextStep: tool({
      description:
        "Generate a structured next-step recommendation based on experiment analysis. No special capability required.",
      inputSchema: z.object({
        analysisSummary: z.string().describe("Summary of the experiment analysis"),
        originalObjective: z.string().describe("The original research/experiment objective"),
      }),
      execute: async ({ analysisSummary, originalObjective }) => {
        return {
          analysisSummary,
          originalObjective,
          instruction: "Based on the analysis and original objective, recommend the best next step. Format: (1) recommended action, (2) reasoning, (3) confidence, (4) type (code_change/config_change/new_ablation/rerun/direction_change), (5) alternatives.",
        };
      },
    }),
  };
}
