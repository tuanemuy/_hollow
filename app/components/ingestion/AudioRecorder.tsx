"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Mic, MicOff, RotateCcw, Square, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  ALERT,
  ALERT_BODY,
  ALERT_CONTENT,
  ALERT_ICON,
  ALERT_TITLE,
  ALERT_WARNING,
  pillBtn,
  pillBtnDanger,
  pillBtnGhostDanger,
  pillBtnPrimary,
} from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { uploadFileFn } from "./actions";
import { notifyIngestionQueueChanged } from "./queueBadgeBus";

/**
 * Recording byte cap. OpenAI's transcription endpoint rejects audio over
 * 25 MB; we cap the in-browser recording a touch below that (24 MB) so the
 * File handed to `uploadFileFn` never trips the provider limit (and stays
 * well under the upload usecase's `DEFAULT_MAX_INGESTION_BYTES`, 50 MB).
 * When the live recording crosses this size we auto-stop and keep what was
 * captured so far.
 */
const MAX_RECORDING_BYTES = 24 * 1024 * 1024;

/**
 * Hard duration ceiling (30 min). A secondary guard so a forgotten open
 * recorder cannot run unbounded; the byte cap above is the primary limit.
 */
const MAX_RECORDING_SECONDS = 30 * 60;

/**
 * MIME candidates in preference order. `audio/webm;codecs=opus` is the
 * Chrome/Firefox default and maps to the `audio` kind via the `webm`
 * extension / `audio/` prefix; Safari only supports `audio/mp4`, which the
 * `audio/` MIME prefix still classifies as `audio`. The plain fallbacks
 * cover engines that report support without the codec suffix.
 */
const MIME_CANDIDATES: ReadonlyArray<{ mimeType: string; extension: string }> =
  [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    { mimeType: "audio/mp4", extension: "m4a" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
    { mimeType: "audio/ogg", extension: "ogg" },
  ];

type PickedMime = { mimeType: string; extension: string };

/**
 * Resolves the first supported recording MIME via `isTypeSupported`. Returns
 * `null` when none of the candidates are supported (caller falls back to the
 * browser default and a generic `.webm` name).
 */
function pickSupportedMime(): PickedMime | null {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return null;
  }
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }
  return null;
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type RecorderState =
  | { kind: "idle" }
  | { kind: "requesting-permission" }
  | { kind: "recording"; seconds: number; bytes: number }
  | { kind: "stopped"; blob: Blob; url: string; autoStopped: boolean }
  | { kind: "uploading" }
  | { kind: "permission-denied" };

/**
 * In-browser microphone recorder that funnels the captured audio into the
 * **same** ingestion path as file upload: the recording `Blob` is turned into
 * a `File` and posted through `uploadFileFn` (multipart). No recording-only
 * backend route exists — recording joins the existing upload → ingest →
 * commit flow (Issue #701 ADR-007).
 *
 * State machine: idle → requesting-permission → recording (elapsed time, live
 * size) → stopped (preview / discard / re-record / ingest) and a
 * permission-denied terminal with a fallback message pointing at file upload.
 */
export function AudioRecorder() {
  const router = useRouter();
  const upload = useServerFn(uploadFileFn);

  const [state, setState] = useState<RecorderState>({ kind: "idle" });
  const [error, setError] = useState<SerializedError | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pickedRef = useRef<PickedMime | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  // Tracks the live byte count so the byte cap can auto-stop mid-recording.
  const bytesRef = useRef<number>(0);
  // The object URL currently held in a `stopped` state, so it can be revoked
  // when the user discards, re-records, ingests, or the component unmounts.
  const previewUrlRef = useRef<string | null>(null);
  // Whether the most recent stop was triggered by hitting a size/time cap.
  // Read in `onstop` (via a ref so the handler never closes over a stale value).
  const autoStopRef = useRef(false);

  const clearTick = useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current !== null) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current !== null) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  // Cleanup on unmount: stop the recorder, release the mic, revoke the URL.
  useEffect(() => {
    return () => {
      clearTick();
      if (
        recorderRef.current !== null &&
        recorderRef.current.state !== "inactive"
      ) {
        recorderRef.current.stop();
      }
      stopStream();
      revokePreview();
    };
  }, [clearTick, stopStream, revokePreview]);

  const beginRecording = useCallback(async () => {
    setError(null);
    revokePreview();
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setState({ kind: "permission-denied" });
      return;
    }
    setState({ kind: "requesting-permission" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Covers permission denial, no device, and insecure-context refusals —
      // all fall back to the file-upload guidance below.
      setState({ kind: "permission-denied" });
      return;
    }

    streamRef.current = stream;
    const picked = pickSupportedMime();
    pickedRef.current = picked;
    let recorder: MediaRecorder;
    try {
      recorder = picked
        ? new MediaRecorder(stream, { mimeType: picked.mimeType })
        : new MediaRecorder(stream);
    } catch {
      // A MIME the browser claimed to support but rejected on construction:
      // retry with the engine default rather than failing hard.
      pickedRef.current = null;
      recorder = new MediaRecorder(stream);
    }
    recorderRef.current = recorder;
    chunksRef.current = [];
    bytesRef.current = 0;
    startedAtRef.current = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
        bytesRef.current += event.data.size;
      }
      if (bytesRef.current >= MAX_RECORDING_BYTES) {
        // Reached the size cap — stop and flag so the `stopped` view can warn.
        autoStopRef.current = true;
        if (recorder.state !== "inactive") recorder.stop();
      }
    };

    recorder.onstop = () => {
      clearTick();
      stopStream();
      const type =
        pickedRef.current?.mimeType.split(";")[0] ??
        recorder.mimeType.split(";")[0] ??
        "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      const autoStopped = autoStopRef.current;
      autoStopRef.current = false;
      if (blob.size === 0) {
        // Nothing was captured (e.g. immediate stop) — return to idle.
        setState({ kind: "idle" });
        return;
      }
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setState({ kind: "stopped", blob, url, autoStopped });
    };

    // Emit a chunk per second so the live byte count updates and the cap can
    // trigger an auto-stop without waiting for the final `stop()`.
    autoStopRef.current = false;
    recorder.start(1000);
    setState({ kind: "recording", seconds: 0, bytes: 0 });
    tickRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setState((prev) =>
        prev.kind === "recording"
          ? { ...prev, seconds, bytes: bytesRef.current }
          : prev,
      );
      if (seconds >= MAX_RECORDING_SECONDS) {
        autoStopRef.current = true;
        if (recorderRef.current?.state !== "inactive") {
          recorderRef.current?.stop();
        }
      }
    }, 500);
  }, [clearTick, stopStream, revokePreview]);

  const stopRecording = useCallback(() => {
    autoStopRef.current = false;
    if (
      recorderRef.current !== null &&
      recorderRef.current.state !== "inactive"
    ) {
      recorderRef.current.stop();
    }
  }, []);

  const discard = useCallback(() => {
    revokePreview();
    setError(null);
    setState({ kind: "idle" });
  }, [revokePreview]);

  const reRecord = useCallback(() => {
    revokePreview();
    void beginRecording();
  }, [revokePreview, beginRecording]);

  const ingest = useCallback(
    (blob: Blob) => {
      setError(null);
      setState({ kind: "uploading" });
      void (async () => {
        try {
          const extension = pickedRef.current?.extension ?? "webm";
          const stamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, 19);
          const file = new File([blob], `recording-${stamp}.${extension}`, {
            type: blob.type || "audio/webm",
          });
          const formData = new FormData();
          formData.append("file", file);
          await upload({ data: formData });
          notifyIngestionQueueChanged();
          revokePreview();
          setState({ kind: "idle" });
          try {
            await routerInvalidate(router);
          } catch {
            // The job is already enqueued; a stale router view self-heals on
            // the next navigation / queue poll.
          }
        } catch (e) {
          setError(extractSerializedError(e));
          // Keep the recording so the user can retry the ingest.
          const url = URL.createObjectURL(blob);
          previewUrlRef.current = url;
          setState({ kind: "stopped", blob, url, autoStopped: false });
        }
      })();
    },
    [upload, router, revokePreview],
  );

  return (
    <div className="rounded-xl border border-hairline bg-surface-elevated p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex text-ink-secondary">
          <Icon icon={Mic} size={20} />
        </span>
        <p className="text-sm font-medium text-ink">マイクで録音して取り込む</p>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {recorderStatusText(state)}
      </div>

      {state.kind === "idle" ? (
        <IdleView onStart={() => void beginRecording()} />
      ) : null}

      {state.kind === "requesting-permission" ? (
        <p className="text-sm text-ink-secondary py-2">
          マイクの使用を許可してください…
        </p>
      ) : null}

      {state.kind === "recording" ? (
        <RecordingView
          seconds={state.seconds}
          bytes={state.bytes}
          onStop={stopRecording}
        />
      ) : null}

      {state.kind === "stopped" ? (
        <StoppedView
          url={state.url}
          autoStopped={state.autoStopped}
          onDiscard={discard}
          onReRecord={reRecord}
          onIngest={() => ingest(state.blob)}
        />
      ) : null}

      {state.kind === "uploading" ? (
        <p className="text-sm text-ink-secondary py-2">取り込み中…</p>
      ) : null}

      {state.kind === "permission-denied" ? <PermissionDeniedView /> : null}

      {error !== null ? (
        <p className="text-error text-sm mt-3" role="alert">
          {displayError(error)}
        </p>
      ) : null}
    </div>
  );
}

function recorderStatusText(state: RecorderState): string {
  switch (state.kind) {
    case "idle":
      return "";
    case "requesting-permission":
      return "マイクの使用許可を待っています";
    case "recording":
      return `録音中 ${formatDuration(state.seconds)}`;
    case "stopped":
      return "録音を停止しました。プレビューを確認できます";
    case "uploading":
      return "録音を取り込んでいます";
    case "permission-denied":
      return "マイクを使用できませんでした";
    default:
      return "";
  }
}

function IdleView({ onStart }: Readonly<{ onStart: () => void }>) {
  return (
    <>
      <p className="text-sm text-ink-secondary mb-3">
        録音した音声は文字起こしして新規ノートにします。最大 30 分・24 MB まで。
      </p>
      <button
        type="button"
        className={`${pillBtn} ${pillBtnPrimary}`}
        data-primary=""
        onClick={onStart}
      >
        <Icon icon={Mic} size={16} />
        録音を開始
      </button>
    </>
  );
}

function RecordingView({
  seconds,
  bytes,
  onStop,
}: Readonly<{ seconds: number; bytes: number; onStop: () => void }>) {
  const nearLimit =
    bytes >= MAX_RECORDING_BYTES * 0.8 ||
    seconds >= MAX_RECORDING_SECONDS * 0.9;
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 rounded-full bg-error motion-safe:animate-pulse"
        />
        <span className="text-lg font-mono tabular-nums text-ink">
          {formatDuration(seconds)}
        </span>
        <span className="text-xs text-ink-tertiary">
          {(bytes / (1024 * 1024)).toFixed(1)} MB
        </span>
      </div>
      {nearLimit ? (
        <div className={`${ALERT} ${ALERT_WARNING} mb-3`} role="alert">
          <span className={ALERT_ICON}>
            <Icon icon={MicOff} size={20} />
          </span>
          <div className={ALERT_CONTENT}>
            <p className={ALERT_TITLE}>まもなく上限に達します</p>
            <p className={ALERT_BODY}>
              上限（30 分 / 24 MB）に達すると自動的に停止します。
            </p>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className={`${pillBtn} ${pillBtnDanger}`}
        data-danger=""
        onClick={onStop}
      >
        <Icon icon={Square} size={16} />
        録音を停止
      </button>
    </div>
  );
}

function StoppedView({
  url,
  autoStopped,
  onDiscard,
  onReRecord,
  onIngest,
}: Readonly<{
  url: string;
  autoStopped: boolean;
  onDiscard: () => void;
  onReRecord: () => void;
  onIngest: () => void;
}>) {
  return (
    <div>
      {autoStopped ? (
        <div className={`${ALERT} ${ALERT_WARNING} mb-3`} role="alert">
          <span className={ALERT_ICON}>
            <Icon icon={MicOff} size={20} />
          </span>
          <div className={ALERT_CONTENT}>
            <p className={ALERT_TITLE}>上限に達したため録音を停止しました</p>
            <p className={ALERT_BODY}>
              録音は上限（30 分 / 24
              MB）に達したため自動的に停止しました。ここまでの録音を取り込めます。
            </p>
          </div>
        </div>
      ) : null}
      {/* biome-ignore lint/a11y/useMediaCaption: user-recorded audio has no caption track */}
      <audio src={url} controls className="w-full mb-3" />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${pillBtn} ${pillBtnPrimary}`}
          data-primary=""
          onClick={onIngest}
        >
          <Icon icon={Upload} size={16} />
          この録音を取り込む
        </button>
        <button type="button" className={pillBtn} onClick={onReRecord}>
          <Icon icon={RotateCcw} size={16} />
          録り直す
        </button>
        <button
          type="button"
          className={`${pillBtn} ${pillBtnGhostDanger}`}
          data-ghost-danger=""
          onClick={onDiscard}
        >
          <Icon icon={Trash2} size={16} />
          取り消す
        </button>
      </div>
    </div>
  );
}

function PermissionDeniedView() {
  return (
    <div className={`${ALERT} ${ALERT_WARNING}`} role="alert">
      <span className={ALERT_ICON}>
        <Icon icon={MicOff} size={20} />
      </span>
      <div className={ALERT_CONTENT}>
        <p className={ALERT_TITLE}>マイクを使用できませんでした</p>
        <p className={ALERT_BODY}>
          マイクの使用が許可されていないか、利用できる録音デバイスがありません。ブラウザの権限設定を確認するか、上のファイルアップロードから音声ファイルを取り込んでください。
        </p>
      </div>
    </div>
  );
}
