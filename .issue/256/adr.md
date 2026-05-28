# ADR — Issue #256: アップロードモーダル系のアクセシビリティ強化

## ADR-001: `Dialog.initialFocusRef` の API 形

### Status
Accepted

### Context
A11y-H2 解消のため、`Dialog` プリミティブに「子コンポーネントが初期 focus 対象を明示的に指定する API」を導入する必要がある。以下の選択肢を検討:

- (A) `initialFocusRef?: React.RefObject<HTMLElement | null> | undefined`（optional ref）
- (B) `initialFocus?: HTMLElement | (() => HTMLElement | null)` (柔軟な値 or 関数)
- (C) `initialFocusRef: React.RefObject<HTMLElement | null>` (必須化)

### Decision
(A) **optional ref オブジェクト**を採用する。

- `null` / `current === null` / panel 外要素は静かにフォールバック（防御的契約）
- `role="alertdialog"` の場合は無視（WAI-ARIA Authoring Practices 準拠で panel focus を維持）
- effect 依存配列には含めず、ref オブジェクトの不変性を前提とする

### Consequences

- **良い点**: 後方互換を保てる（既存 6 呼び出し元は変更不要）。React の慣習的な ref パターンに沿う。フォールバックがあるため race condition でクラッシュしない
- **トレードオフ**: 「明示的に指定したのにフォールバックされる」状況がデバッグしづらい可能性。JSDoc で挙動を明示してカバー

---

## ADR-002: `Dialog` の `ariaLabel | ariaLabelledBy` 排他制約

### Status
Accepted

### Context
A11y-H1 を厳密に保証するなら「`ariaLabel` か `ariaLabelledBy` のいずれかは必ず指定する」を型レベルで強制したい。選択肢:

- (A) 型レベル排他 union（`{ ariaLabel: string } | { ariaLabelledBy: string }`）で必須化
- (B) JSDoc とランタイム警告に留める
- (C) 何もしない

### Decision
(B) **JSDoc で「いずれか必須」を明示**するが、型レベル強制はしない。

### Consequences

- **良い点**: 本 Issue で 7 呼び出し元すべてを `ariaLabelledBy` パターンに統一するため、強制せずとも実態として整合する。型変更の破壊性を回避できる
- **トレードオフ**: 将来新規 Dialog 呼び出し元が `ariaLabel` だけで `<h2>` を持たないケースを防げない。これは別 Issue（型レベル強制 / lint ルール追加）として切り出す価値がある

---

## ADR-003: status region の実装場所

### Status
Accepted

### Context
A11y-H3 解消には常設の `aria-live="polite"` 領域が必要。実装場所の選択肢:

- (A) `UploadDialog` 内に集約（view machine と同居）
- (B) `Dialog` プリミティブに `statusMessage?: string` プロップを追加
- (C) 独立した `<LiveRegion />` コンポーネントを抽出

### Decision
(A) **`UploadDialog` 内**に `<div role="status" aria-live="polite" className="sr-only">` を 1 つ配置する。

view 切替のステータス文字列は同ファイル module-scope の純関数 `viewStatusText(view: View): string` で導出する。

### Consequences

- **良い点**: view machine を持つのは `UploadDialog` だけなので、責務がきれいに収まる。他 Dialog は静的タイトルで status 領域を必要としないため YAGNI に沿う
- **トレードオフ**: 将来他の Dialog（例えば `BulkExportDialog` の進捗）にも status announce が必要になったら、その時点でパターン抽出を検討（YAGNI のまま進める）

---

## ADR-004: focus 契約の責務分離

### Status
Accepted（レビュー 1 周目で更新）

### Context
`Dialog` の rAF 初期フォーカス effect は `[mounted, role]` 依存で 1 度だけ走る。`UploadDialog` のように `Dialog` 内で view が遷移するケースでは、`waiting → editing` 遷移時に `initialFocusRef={titleInputRef}` を渡しても自動 focus は再発火しない。

加えて、`UploadDialog` の view は必ず `select` から始まり、`select → uploading → waiting → editing` の経路を辿る。**`editing` が初回 view であることはあり得ない**ため、`Dialog` の初回フォーカス時点で `titleInputRef.current` は常に `null`。`<Dialog initialFocusRef={titleInputRef}>` を配線しても editing 突入時には機能しない（rAF 初期 focus は select 時点で発火済み）。

選択肢:

- (A) `Dialog` の初期フォーカス effect 依存に `initialFocusRef.current` を含める（ref unwrap 必要、不可）
- (B) `Dialog` に `key={view.kind}` を渡して view 切替時に DialogInner をマウントし直す
- (C) `UploadDialog` 内に `view.kind` を依存にした focus effect を置き、`Dialog.initialFocusRef` は使わない

### Decision
(C) **`UploadDialog` 内で view machine effect として focus を寄せる。`Dialog.initialFocusRef` は `UploadDialog` 起点では使わない**。

```tsx
useEffect(() => {
  if (view.kind === "editing") titleInputRef.current?.focus();
}, [view.kind]);
```

- `select` view の初期 focus は `Dialog` の `INITIAL_FOCUS_SELECTOR` フォールバックでファイル input が自然に focus される（現状維持）
- `editing` 遷移時の focus は view machine effect の単一経路で `titleInputRef.current?.focus()` を呼ぶ
- `Dialog.initialFocusRef` プロップは Dialog プリミティブの API として残す（将来「マウント時点で初期 focus 対象が定まる」ケースに有用）が、`UploadDialog` 起点では配線しない

### Consequences

- **良い点**: 責務分離が明確（プリミティブ = マウント時の宣言、view machine = 遷移時の制御）。`UploadDialog` の focus 制御経路が単一に統一され、A11y-H2 の「二重契約」が完全に解消される
- **トレードオフ**: 一見「`IngestionPreviewForm` の `useEffect(focus, [])` を `UploadDialog` に移しただけ」に見えるが、フォーカス契約の所有者が「フォームコンポーネント」から「dialog を駆動する view machine」に移った点が本質。今後の form 構造変更に強くなる
- **却下した代替案 (B)**: `key` で DialogInner をマウントし直すと、focus restore / scroll lock / backdrop guard など `Dialog` 内部の状態がリセットされる副作用があり危険
- **却下した「(C) + initialFocusRef も配線」**: 初稿で検討した「`Dialog.initialFocusRef={view.kind === "editing" ? titleInputRef : undefined}`」配線は、editing が初回 view にならない `UploadDialog` では無価値かつ二重契約の再導入になるためレビュー 1 周目で削除

---
