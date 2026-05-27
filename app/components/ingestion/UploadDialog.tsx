"use client";

import { Link } from "@tanstack/react-router";
import { Dialog } from "@/components/common/Dialog";
import { dialogTitle, pillBtn } from "@/components/common/styles";
import { UploadForm } from "./UploadForm";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function UploadDialog({ open, onClose }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabel="アップロード"
      closeOnBackdropClick
      showCloseButton
    >
      <h2 className={dialogTitle}>アップロード</h2>
      <p className="text-sm text-ink-secondary mb-4">
        ファイルから新規ノートを作成します。HTML / Markdown / Office / PDF /
        画像 / 音声に対応しています。
      </p>
      <UploadForm />
      <div className="mt-6 flex justify-end">
        {/*
         * Explicit empty `hash` keeps the URL clean (`/upload`) instead
         * of the router potentially preserving `#upload` from the
         * outgoing location. UploadDialogMount also suppresses the
         * dialog on the `/upload` pathname, so we do not call
         * onClose() — that would race with the Link navigation.
         */}
        <Link to="/upload" hash={() => ""} className={pillBtn}>
          取り込みキューを見る
        </Link>
      </div>
    </Dialog>
  );
}
