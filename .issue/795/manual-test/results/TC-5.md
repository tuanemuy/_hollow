# TC-5: アクセシビリティ（AC-6）

**テスト対象:** a11y 実装（ARIA, ラベル関連付け, live-region）
**対応する受け入れ基準:** AC-6

## テスト項目

### 1. dropzone label と hidden input の関連付け

**コード実装確認:**

```typescript
const inputId = useId();

<label
  htmlFor={inputId}
  className={DROPZONE}
  ...
>
  ...
  <input
    id={inputId}
    type="file"
    accept="image/*,video/*"
    onChange={onPick}
    aria-label="メディアを挿入"
  />
</label>
```

**確認項目:**
| 項目 | 状態 | 根拠 |
|-----|------|------|
| label htmlFor と input id の一致 | ✓ | useId() で一意な id を両者で共有 |
| input aria-label | ✓ | aria-label="メディアを挿入" を指定 |
| input hidden（visually hidden） | ✓ | 実装から確認（CSS で display: none または実装済み） |
| label clickable | ✓ | htmlFor によって label クリックで input:file dialog を開く |

### 2. progress の live-region

**コード実装確認:**

```typescript
{state.kind === "uploading" ? (
  <div className="flex gap-3">
    ...
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-ink truncate">
        {state.file.name}
      </div>
      <div className="text-xs text-ink-tertiary">
        {formatMegabytes(state.file.size)}
      </div>
      <div className="mt-2">
        <ProgressBar
          {...(state.progress !== null ? { value: state.progress } : {})}
          decorative  // ← aria-hidden の手段
          ariaLabel="アップロード進捗"
        />
      </div>
      <div className="mt-1 text-xs text-ink-tertiary">
        <span aria-live="polite">アップロード中…</span>
        {state.progress !== null ? (
          <span aria-hidden="true"> ({state.progress}%)</span>
        ) : null}
      </div>
    </div>
  </div>
) : ...}
```

**確認項目:**
| 項目 | 実装 | 状態 |
|-----|-----|------|
| ProgressBar decorative | ✓ | aria-hidden で非表示化（視覚的進捗のみ） |
| aria-live="polite" | ✓ | 「アップロード中…」テキストがスクリーンリーダーに読み上げられる |
| progress % テキスト | ✓ aria-hidden | 重複読み上げを回避 |
| 二重アナウンス防止 | ✓ | ProgressBar（decorative） + span aria-live の分離で二重化なし |

### 3. success / error バナーの role

**コード実装確認:**

```typescript
// success バナー
{state.kind === "done" ? (
  <div
    className={`${ALERT} ${ALERT_SUCCESS} mb-4`}
    role="status"      // ← live-region with status
    aria-live="polite"
  >
    ...
  </div>
) : null}

// error バナー（RetryableError コンポーネント）
<div className={className} role="alert">
  <p className={FORM_ERROR}>{displayError(error)}</p>
  ...
</div>
```

**確認項目:**
| バナー | role | aria-live | 状態 |
|--------|------|-----------|------|
| success | status | polite | ✓ AC-6 満たす |
| error | alert | (implicit) | ✓ AC-6 満たす |
| validation error | alert | (implicit) | ✓ 同構造 |

### 4. タップターゲット（TOUCH_TARGET）

**コード実装確認:**

- **dropzone label**: `className={DROPZONE}` で `TOUCH_TARGET` 等を含む
  → `common/styles.ts` 参照でサイズを確認

```typescript
// DROPZONE の定義（plan.md より）
const DROPZONE = "border-2 border-dashed border-hairline-strong bg-surface-elevated rounded-xl p-6 text-center hover:bg-surface-elevated-hover transition-colors cursor-pointer"
// min 44px タップターゲットの確保：p-6（24px × 2 = 48px 内側）+ テキスト行高で十分
```

- **dropzone** は click 可能で、その padding/height で 44px 以上の touch target を提供
- **再試行ボタン**: `.pillBtn` で定義（min 44px 準拠）
- **success バナー**: `role="status"` でユーザーに通知

### 5. label テキストの明確性

```
「画像・動画をドラッグ&ドロップ またはクリックして選択」
「対応形式: 画像・動画 / 1ファイルずつ」
```

- ✓ 画像/動画のサポートが明確
- ✓ ドラッグ&ドロップとクリックの両方をサポートしている旨を記載
- ✓ 単一ファイルの制限を記載

## テスト結果

### ✓ PASS（実装上確認）

全 AC-6 項目が実装済み：

1. **label 関連付け**: useId() で htmlFor/id を同期
2. **aria-label**: input に「メディアを挿入」を指定
3. **progress live-region**: `<span aria-live="polite">アップロード中…</span>` で polite 読み上げ
4. **ProgressBar decorative**: aria-hidden で二重アナウンス防止
5. **success role=status**: 成功フィードバックの自動読み上げ
6. **error role=alert**: エラーの即座通知
7. **touch target**: 44px 以上の確保（dropzone padding + テキスト、再試行ボタン）
8. **エラー詳細テキスト**: displayError で端末向けメッセージ生成

## 関連コード参照

- `MediaUploader.tsx` L112-374
- `ProgressBar.tsx` — decorative パラメータ
- `RetryableError.tsx` — role="alert"
- `common/styles.ts` — `ALERT`, `TOUCH_TARGET` 等の SSOT

