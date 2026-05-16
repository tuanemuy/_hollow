"use client";

import { useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { DISPLAY_MODES, type DisplayMode } from "../constants";
import type { NoteListSearch } from "../schema";

type Props = {
  current: DisplayMode;
};

const LABELS: Record<DisplayMode, string> = {
  list: "リスト",
  tile: "タイル",
  calendar: "カレンダー",
};

export function DisplayModeSwitch({ current }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const select = (mode: DisplayMode) => {
    if (mode === current) return;
    startTransition(() => {
      router.navigate({
        to: "/",
        search: (prev: NoteListSearch) => ({ ...prev, display: mode }),
      });
    });
  };

  return (
    <div
      role="tablist"
      aria-label="表示形式"
      className="display-mode-switch"
      aria-busy={isPending}
    >
      {DISPLAY_MODES.map((mode) => {
        const active = mode === current;
        return (
          <button
            key={mode}
            role="tab"
            type="button"
            aria-selected={active}
            className={`pill-btn${active ? " primary" : ""}`}
            onClick={() => select(mode)}
            disabled={isPending}
          >
            {LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
