"use client";

import { useRouter } from "@tanstack/react-router";
import { useId, useState, useTransition } from "react";
import { Dialog } from "@/components/common/Dialog";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  dialogActions,
  dialogTitle,
  field,
  fieldControl,
  fieldLabel,
  formError,
  pillBtn,
  pillBtnPrimary,
  radioRow,
} from "@/components/common/styles";
import { DirectorySelectField } from "@/components/directory/DirectorySelectField";
import type { FlatDirectory } from "@/components/note/directoryTree";
import type { SavedViewDTO } from "@/core/application/dto/view";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { SAVED_VIEW_NAME_MAX } from "./schema";

type TagOption = Readonly<{ id: string; name: string }>;

type FormPayload = Readonly<{
  name: string;
  kind: "personal" | "public";
  query: Readonly<{
    tagNames: readonly string[];
    directoryId: string | null;
    dateRange: Readonly<{ from: string | null; to: string | null }> | null;
    keyword: string | null;
    referencingNoteId: string | null;
    visibilityFilter: ReadonlyArray<"private" | "unlisted" | "public">;
  }>;
  displayMode: "list" | "tile" | "calendar";
  calendarDateKey: "updated" | "created" | "frontMatterDate";
  sort: Readonly<{
    by: "updatedAt" | "createdAt" | "title";
    direction: "asc" | "desc";
  }>;
  isDefault: boolean;
}>;

type CreateProps = Readonly<{
  mode: "create";
  /** Bound server fn (already wrapped by `useServerFn` at the call site). */
  submit: (arg: { data: FormPayload }) => Promise<unknown>;
}>;

type EditProps = Readonly<{
  mode: "edit";
  view: SavedViewDTO;
  /** Resolved tag names for `view.query.tagIds` (loader-supplied). */
  initialTagNames: readonly string[];
  submit: (arg: { data: FormPayload & { viewId: string } }) => Promise<unknown>;
}>;

export type ViewFormDialogProps = Readonly<{
  open: boolean;
  onClose: () => void;
  directories: readonly FlatDirectory[];
  tags: readonly TagOption[];
}> &
  (CreateProps | EditProps);

const VISIBILITY_OPTIONS: ReadonlyArray<{
  value: "private" | "unlisted" | "public";
  label: string;
}> = [
  { value: "private", label: "非公開" },
  { value: "unlisted", label: "限定公開" },
  { value: "public", label: "公開" },
];

function toDateInputValue(iso: string | null): string {
  if (iso === null) return "";
  // `dateRange` carries either a plain `YYYY-MM-DD` (from this form) or a
  // full ISO timestamp (from the DTO). `<input type="date">` only accepts
  // the date portion.
  return iso.slice(0, 10);
}

export function ViewFormDialog(props: ViewFormDialogProps) {
  const { open, onClose, directories, tags } = props;
  const router = useRouter();

  const editView = props.mode === "edit" ? props.view : null;

  const [name, setName] = useState(editView?.name ?? "");
  const [kind, setKind] = useState<"personal" | "public">(
    editView?.kind ?? "personal",
  );
  const [directoryId, setDirectoryId] = useState<string | null>(
    editView?.query.directoryId ?? null,
  );
  const [tagText, setTagText] = useState(
    props.mode === "edit" ? props.initialTagNames.join(", ") : "",
  );
  const [keyword, setKeyword] = useState(editView?.query.keyword ?? "");
  const [from, setFrom] = useState(
    toDateInputValue(editView?.query.dateRange?.from ?? null),
  );
  const [to, setTo] = useState(
    toDateInputValue(editView?.query.dateRange?.to ?? null),
  );
  const [visibility, setVisibility] = useState<
    ReadonlyArray<"private" | "unlisted" | "public">
  >(editView?.query.visibilityFilter ?? []);
  const [displayMode, setDisplayMode] = useState<"list" | "tile" | "calendar">(
    editView?.displayMode ?? "list",
  );
  const [sortBy, setSortBy] = useState<"updatedAt" | "createdAt" | "title">(
    editView?.sort.by ?? "updatedAt",
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(
    editView?.sort.direction ?? "desc",
  );

  const [error, setError] = useState<SerializedError | null>(null);
  const [isPending, startTransition] = useTransition();

  const nameId = useId();
  const keywordId = useId();
  const fromId = useId();
  const toId = useId();
  const titleId = useId();

  // Tag names map directly to existing tags; the server fn drops unknown
  // names (treated as broken conditions, not errors). Parse the
  // comma-separated input into trimmed, de-duplicated names.
  const parseTagNames = (text: string): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of text.split(",")) {
      const trimmed = raw.trim().replace(/^#/, "");
      if (trimmed === "" || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
    return out;
  };

  const toggleVisibility = (value: "private" | "unlisted" | "public") => {
    setVisibility((cur) =>
      cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
    );
  };

  const buildPayload = (): FormPayload => {
    const trimmedKeyword = keyword.trim();
    const fromVal = from === "" ? null : from;
    const toVal = to === "" ? null : to;
    const dateRange =
      fromVal === null && toVal === null ? null : { from: fromVal, to: toVal };
    return {
      name: name.trim(),
      kind,
      query: {
        tagNames: parseTagNames(tagText),
        directoryId,
        dateRange,
        keyword: trimmedKeyword === "" ? null : trimmedKeyword,
        referencingNoteId:
          editView?.query.referencingNoteId === undefined ||
          editView?.query.referencingNoteId === null
            ? null
            : (editView.query.referencingNoteId as unknown as string),
        visibilityFilter: visibility,
      },
      displayMode,
      calendarDateKey: editView?.calendarDateKey ?? "updated",
      sort: { by: sortBy, direction: sortDirection },
      isDefault: editView?.isDefault ?? false,
    };
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length === 0) return;
    setError(null);
    const payload = buildPayload();
    startTransition(async () => {
      try {
        if (props.mode === "edit") {
          await props.submit({
            data: { ...payload, viewId: props.view.id as unknown as string },
          });
        } else {
          await props.submit({ data: payload });
        }
        // submit success = server-confirmed, so close immediately rather
        // than blocking the dialog on the loader round-trip (Issue #414
        // ADR-004). Updates inside an async transition are batched until the
        // action settles, so `routerInvalidate` must NOT be awaited here —
        // awaiting it would defer the close until the re-fetch finishes,
        // defeating the point. Fire it detached; its failure is swallowed
        // because the dialog is already closed (next navigation recovers).
        onClose();
        routerInvalidate(router).catch(() => {});
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const nameFieldErrors =
    error?.kind === "validation" ? error.fieldErrors?.name : undefined;
  const summary =
    error !== null && nameFieldErrors === undefined ? displayError(error) : "";

  const inputSm =
    "h-9 px-3 rounded-md border border-hairline bg-surface text-sm text-ink outline-none focus:border-accent";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      closable={!isPending}
    >
      <form onSubmit={onSubmit}>
        <h2 id={titleId} className={dialogTitle}>
          {props.mode === "edit" ? "ビューを編集" : "新しいビュー"}
        </h2>

        <div className={field}>
          <label htmlFor={nameId} className={fieldLabel}>
            名前
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={SAVED_VIEW_NAME_MAX}
            className={fieldControl}
            aria-invalid={nameFieldErrors !== undefined}
          />
          {nameFieldErrors !== undefined ? (
            <p className={formError} role="alert">
              {nameFieldErrors[0]}
            </p>
          ) : null}
        </div>

        <fieldset className={field}>
          <legend className={fieldLabel}>公開範囲</legend>
          {/* `updateSavedView` does not support changing kind, so the radios
              are read-only in edit mode — leaving them editable would
              silently discard the change. */}
          <label className={radioRow}>
            <input
              type="radio"
              name="view-form-kind"
              checked={kind === "personal"}
              onChange={() => setKind("personal")}
              disabled={props.mode === "edit"}
            />
            個人用
          </label>
          <label className={radioRow}>
            <input
              type="radio"
              name="view-form-kind"
              checked={kind === "public"}
              onChange={() => setKind("public")}
              disabled={props.mode === "edit"}
            />
            インスタンス内で共有
          </label>
          {props.mode === "edit" ? (
            <p className="text-xs text-ink-tertiary">
              公開範囲は作成後に変更できません。
            </p>
          ) : null}
        </fieldset>

        <div className={field}>
          <DirectorySelectField
            label="ディレクトリ"
            options={directories}
            value={directoryId}
            onChange={setDirectoryId}
            clearable
          />
        </div>

        <div className={field}>
          <label htmlFor={`${nameId}-tags`} className={fieldLabel}>
            タグ（カンマ区切り）
          </label>
          <input
            id={`${nameId}-tags`}
            type="text"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            list={`${nameId}-tag-options`}
            placeholder="例: research, essay"
            className={fieldControl}
          />
          <datalist id={`${nameId}-tag-options`}>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.name} />
            ))}
          </datalist>
        </div>

        <div className={field}>
          <label htmlFor={keywordId} className={fieldLabel}>
            キーワード
          </label>
          <input
            id={keywordId}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className={fieldControl}
          />
        </div>

        <div className={field}>
          <span className={fieldLabel}>期間</span>
          <div className="flex items-center gap-2 flex-wrap">
            <label htmlFor={fromId} className="sr-only">
              開始日
            </label>
            <input
              id={fromId}
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputSm}
            />
            <span aria-hidden="true" className="text-ink-tertiary">
              –
            </span>
            <label htmlFor={toId} className="sr-only">
              終了日
            </label>
            <input
              id={toId}
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputSm}
            />
          </div>
        </div>

        <fieldset className={field}>
          <legend className={fieldLabel}>公開状態</legend>
          {VISIBILITY_OPTIONS.map((opt) => (
            <label key={opt.value} className={radioRow}>
              <input
                type="checkbox"
                checked={visibility.includes(opt.value)}
                onChange={() => toggleVisibility(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </fieldset>

        <div className={field}>
          <label htmlFor={`${nameId}-display`} className={fieldLabel}>
            表示モード
          </label>
          <select
            id={`${nameId}-display`}
            value={displayMode}
            onChange={(e) =>
              setDisplayMode(e.target.value as "list" | "tile" | "calendar")
            }
            className={fieldControl}
          >
            <option value="list">リスト表示</option>
            <option value="tile">タイル表示</option>
            <option value="calendar">カレンダー表示</option>
          </select>
        </div>

        <div className={field}>
          <span className={fieldLabel}>ソート</span>
          <div className="flex items-center gap-2 flex-wrap">
            <label htmlFor={`${nameId}-sort-by`} className="sr-only">
              ソート基準
            </label>
            <select
              id={`${nameId}-sort-by`}
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "updatedAt" | "createdAt" | "title")
              }
              className={inputSm}
            >
              <option value="updatedAt">更新日</option>
              <option value="createdAt">作成日</option>
              <option value="title">タイトル</option>
            </select>
            <label htmlFor={`${nameId}-sort-dir`} className="sr-only">
              ソート方向
            </label>
            <select
              id={`${nameId}-sort-dir`}
              value={sortDirection}
              onChange={(e) =>
                setSortDirection(e.target.value as "asc" | "desc")
              }
              className={inputSm}
            >
              <option value="desc">降順</option>
              <option value="asc">昇順</option>
            </select>
          </div>
        </div>

        {summary !== "" ? (
          <p className={formError} role="alert">
            {summary}
          </p>
        ) : null}

        <div className={dialogActions}>
          <button
            type="button"
            className={pillBtn}
            onClick={onClose}
            disabled={isPending}
          >
            キャンセル
          </button>
          <button
            type="submit"
            data-primary
            className={`${pillBtn} ${pillBtnPrimary}`}
            disabled={isPending || name.trim().length === 0}
          >
            {isPending ? "保存中..." : props.mode === "edit" ? "保存" : "作成"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
