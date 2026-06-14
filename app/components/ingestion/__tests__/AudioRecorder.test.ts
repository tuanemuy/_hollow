import { describe, expect, it } from "vitest";
import {
  formatDuration,
  type IsTypeSupported,
  MIME_CANDIDATES,
  pickSupportedMime,
  type RecorderState,
  recorderStatusText,
} from "../AudioRecorder";

describe("formatDuration", () => {
  it("zero-pads both fields at 0 seconds", () => {
    expect(formatDuration(0)).toBe("00:00");
  });

  it("zero-pads single-digit seconds (tabular alignment)", () => {
    expect(formatDuration(5)).toBe("00:05");
  });

  it("rolls over the minute/second boundary at 60s", () => {
    expect(formatDuration(59)).toBe("00:59");
    expect(formatDuration(60)).toBe("01:00");
    expect(formatDuration(61)).toBe("01:01");
  });

  it("keeps a two-digit minutes field for double-digit minutes", () => {
    // 30-minute cap → 1800s; the running readout never widens past mm:ss.
    expect(formatDuration(1800)).toBe("30:00");
    expect(formatDuration(11 * 60 + 9)).toBe("11:09");
  });
});

describe("recorderStatusText", () => {
  // a11y contract (Round 1 W-002): the recording status is announced via a
  // polite live region, so the text must stay constant across ticks —
  // otherwise the SR re-announces "録音中 1秒, 録音中 2秒…" every second.
  it("returns a constant '録音中' independent of elapsed seconds/bytes", () => {
    const states: RecorderState[] = [
      { kind: "recording", seconds: 0, bytes: 0 },
      { kind: "recording", seconds: 1, bytes: 1024 },
      { kind: "recording", seconds: 599, bytes: 20 * 1024 * 1024 },
    ];
    const texts = states.map(recorderStatusText);
    for (const text of texts) {
      expect(text).toBe("録音中");
    }
    expect(new Set(texts).size).toBe(1);
  });

  it.each([
    ["idle", { kind: "idle" }, ""],
    [
      "requesting-permission",
      { kind: "requesting-permission" },
      "マイクの使用許可を待っています",
    ],
    ["uploading", { kind: "uploading" }, "録音を取り込んでいます"],
    [
      "permission-denied",
      { kind: "permission-denied" },
      "マイクを使用できませんでした",
    ],
  ] as ReadonlyArray<
    [string, RecorderState, string]
  >)("maps %s to its stable status text", (_label, state, expected) => {
    expect(recorderStatusText(state)).toBe(expected);
  });

  it("announces the stopped state regardless of auto-stop", () => {
    const blob = { size: 1 } as Blob;
    const manual: RecorderState = {
      kind: "stopped",
      blob,
      url: "blob:x",
      autoStopped: false,
    };
    const auto: RecorderState = {
      kind: "stopped",
      blob,
      url: "blob:x",
      autoStopped: true,
    };
    expect(recorderStatusText(manual)).toBe(
      "録音を停止しました。プレビューを確認できます",
    );
    expect(recorderStatusText(auto)).toBe(
      "録音を停止しました。プレビューを確認できます",
    );
  });
});

describe("pickSupportedMime", () => {
  /** Build an `IsTypeSupported` that returns true only for the listed MIMEs. */
  const supports =
    (...supported: string[]): IsTypeSupported =>
    (mimeType) =>
      supported.includes(mimeType);

  it("prefers audio/webm;codecs=opus when everything is supported", () => {
    expect(pickSupportedMime(() => true)).toEqual({
      mimeType: "audio/webm;codecs=opus",
      extension: "webm",
    });
  });

  it("falls back to plain audio/webm when the opus suffix is unsupported", () => {
    expect(pickSupportedMime(supports("audio/webm", "audio/mp4"))).toEqual({
      mimeType: "audio/webm",
      extension: "webm",
    });
  });

  it("falls back to audio/mp4 on Safari (no webm support)", () => {
    expect(pickSupportedMime(supports("audio/mp4", "audio/ogg"))).toEqual({
      mimeType: "audio/mp4",
      extension: "m4a",
    });
  });

  it("falls through the ogg candidates in order", () => {
    expect(
      pickSupportedMime(supports("audio/ogg;codecs=opus", "audio/ogg")),
    ).toEqual({ mimeType: "audio/ogg;codecs=opus", extension: "ogg" });
    expect(pickSupportedMime(supports("audio/ogg"))).toEqual({
      mimeType: "audio/ogg",
      extension: "ogg",
    });
  });

  it("returns null when no candidate is supported (engine-default fallback)", () => {
    expect(pickSupportedMime(() => false)).toBeNull();
  });

  it("walks candidates strictly in declared preference order", () => {
    // For every candidate, when *only* it (and everything after it) is
    // supported, it must still be the one chosen — pins the ordering so a
    // reshuffle of MIME_CANDIDATES is caught.
    for (let i = 0; i < MIME_CANDIDATES.length; i++) {
      const tail = MIME_CANDIDATES.slice(i).map((c) => c.mimeType);
      expect(pickSupportedMime(supports(...tail))).toEqual(MIME_CANDIDATES[i]);
    }
  });
});
