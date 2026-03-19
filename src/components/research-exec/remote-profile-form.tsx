"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Terminal, Plus, X } from "lucide-react";
import type { RJobMount, RJobProfileConfig } from "@/lib/research-exec/types";

/**
 * Parse an SSH command string into profile fields.
 * Supports patterns like:
 *   ssh user@host
 *   ssh -p 2222 user@host
 *   ssh -i ~/.ssh/key user@host
 *   ssh -CAXY user.something@host.example.com
 *   ssh -J jumphost user@host
 *   ssh -o ProxyJump=jump user@host
 */
function parseSshCommand(raw: string): {
  username: string;
  host: string;
  port: string;
  sshKeyRef: string;
} | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Tokenize respecting quoted strings
  const tokens: string[] = [];
  let i = 0;
  while (i < trimmed.length) {
    // skip whitespace
    while (i < trimmed.length && /\s/.test(trimmed[i])) i++;
    if (i >= trimmed.length) break;
    if (trimmed[i] === '"' || trimmed[i] === "'") {
      const q = trimmed[i];
      i++;
      let tok = "";
      while (i < trimmed.length && trimmed[i] !== q) {
        tok += trimmed[i];
        i++;
      }
      i++; // skip closing quote
      tokens.push(tok);
    } else {
      let tok = "";
      while (i < trimmed.length && !/\s/.test(trimmed[i])) {
        tok += trimmed[i];
        i++;
      }
      tokens.push(tok);
    }
  }

  if (tokens.length === 0) return null;
  // Strip leading "ssh" if present
  if (tokens[0].toLowerCase() === "ssh") tokens.shift();
  if (tokens.length === 0) return null;

  let port = "22";
  let sshKeyRef = "";
  let destination = "";

  let idx = 0;
  while (idx < tokens.length) {
    const tok = tokens[idx];
    if (tok === "-p" && idx + 1 < tokens.length) {
      port = tokens[idx + 1];
      idx += 2;
    } else if (tok === "-i" && idx + 1 < tokens.length) {
      sshKeyRef = tokens[idx + 1];
      idx += 2;
    } else if (tok === "-J" || tok === "-o" || tok === "-L" || tok === "-R" || tok === "-D" || tok === "-W" || tok === "-F" || tok === "-l" || tok === "-w" || tok === "-b" || tok === "-c" || tok === "-e" || tok === "-m" || tok === "-O" || tok === "-Q" || tok === "-S" || tok === "-E") {
      // flags that consume next arg — skip both
      idx += 2;
    } else if (tok.startsWith("-")) {
      // flags like -CAXY, -v, -N, etc. — skip
      // Check for combined flags with value, e.g. -p2222
      const portMatch = tok.match(/^-[A-Za-z]*p(\d+)/);
      if (portMatch) {
        port = portMatch[1];
      }
      const keyMatch = tok.match(/^-[A-Za-z]*i(.+)/);
      if (keyMatch) {
        sshKeyRef = keyMatch[1];
      }
      idx++;
    } else {
      // This should be the destination (user@host or host)
      destination = tok;
      idx++;
    }
  }

  if (!destination) return null;

  let username = "";
  let host = "";

  const atIdx = destination.indexOf("@");
  if (atIdx !== -1) {
    username = destination.slice(0, atIdx);
    host = destination.slice(atIdx + 1);
  } else {
    host = destination;
  }

  // Strip trailing :path if someone pasted scp-style
  const colonIdx = host.indexOf(":");
  if (colonIdx !== -1) {
    host = host.slice(0, colonIdx);
  }

  if (!host) return null;

  return { username, host, port, sshKeyRef };
}

interface RemoteProfileFormProps {
  workspaceId: string;
  editProfile?: import("@/lib/research-exec/types").RemoteExecutionProfile | null;
  onCreated: () => void;
  onCancelEdit?: () => void;
}

export function RemoteProfileForm({ workspaceId, editProfile, onCreated, onCancelEdit }: RemoteProfileFormProps) {
  const t = useTranslations("researchExec");

  // Parse rjob config from edit profile if present
  const editRjobConfig: RJobProfileConfig | null = (() => {
    if (!editProfile?.rjobConfigJson) return null;
    try { return JSON.parse(editProfile.rjobConfigJson) as RJobProfileConfig; } catch { return null; }
  })();

  const [name, setName] = useState(editProfile?.name ?? "");
  const [host, setHost] = useState(editProfile?.host ?? "");
  const [port, setPort] = useState(String(editProfile?.port ?? 22));
  const [username, setUsername] = useState(editProfile?.username ?? "");
  const [remotePath, setRemotePath] = useState(editProfile?.remotePath ?? "");
  const [schedulerType, setSchedulerType] = useState<string>(editProfile?.schedulerType ?? "shell");
  const [sshKeyRef, setSshKeyRef] = useState(editProfile?.sshKeyRef ?? "");
  const [pollInterval, setPollInterval] = useState(String(editProfile?.pollIntervalSeconds ?? 60));
  const [saving, setSaving] = useState(false);
  const [sshInput, setSshInput] = useState("");
  const [showQuickPaste, setShowQuickPaste] = useState(!editProfile);

  // rjob-specific state
  const [rjobChargedGroup, setRjobChargedGroup] = useState(editRjobConfig?.chargedGroup ?? "");
  const [rjobPrivateMachine, setRjobPrivateMachine] = useState(editRjobConfig?.privateMachine ?? "");
  const [rjobImage, setRjobImage] = useState(editRjobConfig?.image ?? "");
  const [rjobMemory, setRjobMemory] = useState(String(editRjobConfig?.defaultMemoryMb ?? 400000));
  const [rjobCpu, setRjobCpu] = useState(String(editRjobConfig?.defaultCpu ?? 32));
  const [rjobGpu, setRjobGpu] = useState(String(editRjobConfig?.defaultGpu ?? 2));
  const [rjobPriority, setRjobPriority] = useState(String(editRjobConfig?.priority ?? 1));
  const [rjobHostNetwork, setRjobHostNetwork] = useState(editRjobConfig?.hostNetwork ?? false);
  const [rjobMounts, setRjobMounts] = useState<RJobMount[]>(editRjobConfig?.mounts ?? []);
  const [rjobEnv, setRjobEnv] = useState<{ key: string; value: string }[]>(
    editRjobConfig?.env ? Object.entries(editRjobConfig.env).map(([key, value]) => ({ key, value })) : [],
  );
  const [rjobExampleCommands, setRjobExampleCommands] = useState(
    editRjobConfig?.exampleCommands?.join("\n") ?? "",
  );

  const handleParseSsh = () => {
    const parsed = parseSshCommand(sshInput);
    if (!parsed) {
      toast.error(t("sshParseFailed"));
      return;
    }
    if (parsed.host) setHost(parsed.host);
    if (parsed.username) setUsername(parsed.username);
    if (parsed.port) setPort(parsed.port);
    if (parsed.sshKeyRef) setSshKeyRef(parsed.sshKeyRef);
    // Auto-generate profile name from user@host
    if (!name) {
      setName(parsed.username ? `${parsed.username}@${parsed.host}` : parsed.host);
    }
    setSshInput("");
    setShowQuickPaste(false);
    toast.success(t("sshParsed"));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !host || !username || !remotePath) {
      toast.error(t("profileMissingFields"));
      return;
    }
    setSaving(true);
    try {
      let rjobConfig: RJobProfileConfig | null = null;
      if (schedulerType === "rjob" && rjobImage) {
        rjobConfig = {
          chargedGroup: rjobChargedGroup || undefined,
          privateMachine: rjobPrivateMachine || undefined,
          mounts: rjobMounts.filter((m) => m.source && m.target),
          image: rjobImage,
          defaultMemoryMb: parseInt(rjobMemory, 10) || undefined,
          defaultCpu: parseInt(rjobCpu, 10) || undefined,
          defaultGpu: parseInt(rjobGpu, 10) || undefined,
          priority: parseInt(rjobPriority, 10) || undefined,
          hostNetwork: rjobHostNetwork || undefined,
          env: rjobEnv.reduce(
            (acc, { key, value }) => {
              if (key) acc[key] = value;
              return acc;
            },
            {} as Record<string, string>,
          ),
          exampleCommands: rjobExampleCommands
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
        };
        if (Object.keys(rjobConfig.env!).length === 0) delete rjobConfig.env;
        if (!rjobConfig.exampleCommands?.length) delete rjobConfig.exampleCommands;
      }

      const payload = {
        workspaceId,
        name,
        host,
        port: parseInt(port, 10) || 22,
        username,
        remotePath,
        schedulerType,
        sshKeyRef: sshKeyRef || null,
        pollIntervalSeconds: parseInt(pollInterval, 10) || 60,
        rjobConfig,
      };

      const isEditing = !!editProfile;
      const res = await fetch("/api/research-exec/profiles", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { id: editProfile.id, ...payload } : payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || (isEditing ? "Failed to update profile" : "Failed to create profile"));
      }
      toast.success(isEditing ? t("profileUpdated") : t("profileCreated"));
      if (!isEditing) {
        setName("");
        setHost("");
        setPort("22");
        setUsername("");
        setRemotePath("");
        setSshKeyRef("");
        setRjobChargedGroup("");
        setRjobPrivateMachine("");
        setRjobImage("");
        setRjobMemory("400000");
        setRjobCpu("32");
        setRjobGpu("2");
        setRjobPriority("1");
        setRjobHostNetwork(false);
        setRjobMounts([]);
        setRjobEnv([]);
        setRjobExampleCommands("");
      }
      onCreated();
      if (isEditing && onCancelEdit) onCancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 border rounded-lg">
      <h4 className="text-sm font-semibold">{editProfile ? t("editProfile") : t("addProfile")}</h4>

      {/* Quick paste SSH command */}
      {showQuickPaste && (
        <div className="space-y-2 rounded-md border border-dashed p-3 bg-muted/30">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Terminal className="h-3.5 w-3.5" />
            {t("sshQuickPaste")}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={t("sshCommandPlaceholder")}
              value={sshInput}
              onChange={(e) => setSshInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleParseSsh();
                }
              }}
              className="flex-1 font-mono text-xs"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleParseSsh}
              disabled={!sshInput.trim()}
            >
              {t("sshParseButton")}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("sshQuickPasteHint")}</p>
        </div>
      )}

      {!showQuickPaste && (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          onClick={() => setShowQuickPaste(true)}
        >
          {t("sshQuickPaste")}
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder={t("profileName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          placeholder={t("profileHost")}
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
        <Input
          placeholder={t("profilePort")}
          value={port}
          onChange={(e) => setPort(e.target.value)}
          type="number"
        />
        <Input
          placeholder={t("profileUsername")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          placeholder={t("profileRemotePath")}
          value={remotePath}
          onChange={(e) => setRemotePath(e.target.value)}
          className="col-span-2"
        />
        <Select value={schedulerType} onValueChange={setSchedulerType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shell">Shell (nohup)</SelectItem>
            <SelectItem value="slurm">Slurm (sbatch)</SelectItem>
            <SelectItem value="rjob">rjob (container)</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder={t("profileSshKeyRef")}
          value={sshKeyRef}
          onChange={(e) => setSshKeyRef(e.target.value)}
        />
        <Input
          placeholder={t("profilePollInterval")}
          value={pollInterval}
          onChange={(e) => setPollInterval(e.target.value)}
          type="number"
        />
      </div>

      {/* rjob-specific configuration */}
      {schedulerType === "rjob" && (
        <div className="space-y-3 rounded-md border p-3 bg-muted/20">
          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            rjob Configuration
          </h5>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Image (e.g. registry.h.pjlab.org.cn/...)"
              value={rjobImage}
              onChange={(e) => setRjobImage(e.target.value)}
              className="col-span-2 font-mono text-xs"
            />
            <Input
              placeholder="Charged Group (e.g. ai4sdata_gpu)"
              value={rjobChargedGroup}
              onChange={(e) => setRjobChargedGroup(e.target.value)}
            />
            <Input
              placeholder="Private Machine (e.g. group)"
              value={rjobPrivateMachine}
              onChange={(e) => setRjobPrivateMachine(e.target.value)}
            />
            <Input
              placeholder="Memory (MB)"
              value={rjobMemory}
              onChange={(e) => setRjobMemory(e.target.value)}
              type="number"
            />
            <Input
              placeholder="CPU"
              value={rjobCpu}
              onChange={(e) => setRjobCpu(e.target.value)}
              type="number"
            />
            <Input
              placeholder="GPU"
              value={rjobGpu}
              onChange={(e) => setRjobGpu(e.target.value)}
              type="number"
            />
            <Input
              placeholder="Priority (-P)"
              value={rjobPriority}
              onChange={(e) => setRjobPriority(e.target.value)}
              type="number"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="rjob-host-network"
              checked={rjobHostNetwork}
              onCheckedChange={(v) => setRjobHostNetwork(v === true)}
            />
            <Label htmlFor="rjob-host-network" className="text-xs">
              Host Network (--host-network)
            </Label>
          </div>

          {/* Mounts */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Mounts</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setRjobMounts([...rjobMounts, { source: "", target: "" }])}
              >
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
            {rjobMounts.map((mount, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <Input
                  placeholder="Source (e.g. gpfs://gpfs1/...)"
                  value={mount.source}
                  onChange={(e) => {
                    const next = [...rjobMounts];
                    next[i] = { ...next[i], source: e.target.value };
                    setRjobMounts(next);
                  }}
                  className="flex-1 font-mono text-xs"
                />
                <span className="text-xs text-muted-foreground">:</span>
                <Input
                  placeholder="Target (e.g. /mnt/...)"
                  value={mount.target}
                  onChange={(e) => {
                    const next = [...rjobMounts];
                    next[i] = { ...next[i], target: e.target.value };
                    setRjobMounts(next);
                  }}
                  className="flex-1 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive"
                  onClick={() => setRjobMounts(rjobMounts.filter((_, j) => j !== i))}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          {/* Environment Variables */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Environment Variables</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setRjobEnv([...rjobEnv, { key: "", value: "" }])}
              >
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
            {rjobEnv.map((env, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <Input
                  placeholder="KEY"
                  value={env.key}
                  onChange={(e) => {
                    const next = [...rjobEnv];
                    next[i] = { ...next[i], key: e.target.value };
                    setRjobEnv(next);
                  }}
                  className="w-1/3 font-mono text-xs"
                />
                <span className="text-xs text-muted-foreground">=</span>
                <Input
                  placeholder="value"
                  value={env.value}
                  onChange={(e) => {
                    const next = [...rjobEnv];
                    next[i] = { ...next[i], value: e.target.value };
                    setRjobEnv(next);
                  }}
                  className="flex-1 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive"
                  onClick={() => setRjobEnv(rjobEnv.filter((_, j) => j !== i))}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          {/* Example Commands */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Example Commands</span>
            <Textarea
              placeholder={"Paste example rjob submit commands (one per line) for the agent to reference.\ne.g. rjob submit --name my-job --memory=400000 --cpu=32 --gpu=2 ..."}
              value={rjobExampleCommands}
              onChange={(e) => setRjobExampleCommands(e.target.value)}
              className="font-mono text-xs min-h-[80px]"
              rows={4}
            />
            <p className="text-[10px] text-muted-foreground">
              The agent will see these examples and follow the same format when submitting jobs.
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? t("saving") : editProfile ? t("saveProfile") : t("addProfile")}
        </Button>
        {editProfile && onCancelEdit && (
          <Button type="button" variant="outline" size="sm" onClick={onCancelEdit}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
