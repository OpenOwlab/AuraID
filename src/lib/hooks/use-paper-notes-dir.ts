"use client";

import { useCallback, useMemo, useState, useEffect } from "react";

const STORAGE_KEY_PREFIX = "paperStudy.notesDir.";

function getStoredNotesDir(storageKey: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(storageKey) || "";
}

export function usePaperNotesDir(workspaceId?: string) {
  const storageKey = useMemo(
    () => (workspaceId ? `${STORAGE_KEY_PREFIX}${workspaceId}` : `${STORAGE_KEY_PREFIX}__none__`),
    [workspaceId]
  );

  const [notesDir, setNotesDirState] = useState(() => getStoredNotesDir(storageKey));

  useEffect(() => {
    // workspaceId 切换时，重新读取该 workspace 的 notesDir。
    setNotesDirState(getStoredNotesDir(storageKey));
  }, [storageKey]);

  const setNotesDir = useCallback(
    (dir: string) => {
      const trimmed = dir.trim();
      localStorage.setItem(storageKey, trimmed);
      setNotesDirState(trimmed);
    },
    [storageKey]
  );

  return { notesDir, setNotesDir };
}
