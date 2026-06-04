"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useRef, useState, useTransition } from "react";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { FORM_ERROR } from "../layout/styles";
import { uploadFileFn } from "./actions";

const DROPZONE =
  "block border-2 border-dashed border-hairline-strong rounded-xl px-6 py-12 text-center text-ink-secondary bg-surface-elevated transition-all motion-reduce:transition-none cursor-pointer hover:border-accent hover:bg-accent-surface data-[dragover]:border-accent data-[dragover]:bg-accent-surface [&_input[type=file]]:hidden";

export function UploadForm() {
  const router = useRouter();
  const upload = useServerFn(uploadFileFn);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const inputId = useId();

  const submitFiles = (files: FileList | null) => {
    if (files === null || files.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files.item(i);
          if (file === null) continue;
          const formData = new FormData();
          formData.append("file", file);
          await upload({ data: formData });
        }
        await routerInvalidate(router);
        if (fileInputRef.current !== null) {
          fileInputRef.current.value = "";
        }
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <>
      <label
        htmlFor={inputId}
        className={DROPZONE}
        data-dragover={isDragOver ? "" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          submitFiles(e.dataTransfer.files);
        }}
      >
        <p>
          <strong className="text-ink">ファイルをドラッグ&ドロップ</strong>{" "}
          またはクリックして選択
        </p>
        <p className="text-sm mt-2 text-ink-tertiary">
          {isPending ? "アップロード中..." : "複数選択にも対応"}
        </p>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          multiple
          onChange={(e) => submitFiles(e.target.files)}
          disabled={isPending}
        />
      </label>
      {error !== null ? (
        <p className={FORM_ERROR} role="alert">
          {displayError(error)}
        </p>
      ) : null}
    </>
  );
}
