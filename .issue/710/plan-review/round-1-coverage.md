# Plan Review — Issue #710 (Round 1)

**視点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/710/plan.md` / `.issue/710/adr.md`
**レビュー日:** 2026-06-13

## 要件 → 受け入れ基準のトレース

Issue 本文（コメントは 0 件）で明記された要件を抽出し、AC との対応を確認した。

| Issue 要件 | 対応 AC | 判定 |
|---|---|---|
| パンくず表示への置き換え（`root › Documents › Research`、`nav` ナビ言語） | AC-1 | ○ |
| 各セグメントのリンク化（途中階層ジャンプ、`<Link to="/" search={{...HOME_SEARCH, directoryId}}>`） | AC-2 | ○ |
| 末尾の ×（解除、`clearDirectory`）の維持 | AC-3 | ○ |
| optimistic state の扱い（undefined で非表示／baseline でセグメント表示） | AC-4 | ○ |
| セグメント空時の従来フォールバック表示 | AC-5 | ○ |
| root セグメント除外・root id をフィルタに渡さない（#356 ADR-002 踏襲） | AC-6 | ○ |
| 別行レイアウト（チップ群と別行） | AC-7 | ○ |
| 追加 I/O 不要（`flat` から再構成） | スコープ「含まれないもの」+ 設計 | ○（基準化はされていないが性質上 AC 不要、後述 S-001） |
| 回帰防止（既存 facet / clearAll） | AC-8 | ○ |

Issue が明示したすべての要件が AC に落ちている。漏れは検出されなかった。

## 検証

- `FilterBar.tsx:373-387` のディレクトリチップ、props `directoryName?`（56, 134）、`clearDirectory`（252-256）、`hasAnyFilter`（296-301）はいずれも plan 記載の行番号どおりで、置換対象が正確に特定されている。
- `NoteBreadcrumb.tsx` の `nav aria-label="パンくず"` / `Separator`（ChevronRight 16px）/ 要素間のみ区切り（`index > 0 &&` と末尾 `segments.length > 0 &&`）/ `CRUMB_LINK` / 累積 id key / `{ ...HOME_SEARCH, directoryId }` は plan の踏襲対象記述と完全一致。
- `HomePage.tsx:179-182` の `directoryName` 単一解決と `:193` の条件付き受け渡しは plan の置換手順どおり。`FilterBar` の唯一の利用元であることも確認（grep で他参照なし。`DirectoryPicker.tsx:167` の `directoryName` は別コンポーネントの同名 prop で無関係）。
- `directoryTree.ts` の `FlatDirectory`（`id`/`parentId: string|null`/`name`/`depth`/`path`）と root の空名規約（`flattenDirectoryTree` が `name === ""` を落とす、32 行目コメント）は plan のヘルパー設計（root 除外・parentId 辿り）の前提と一致。
- 「追加 I/O 不要」の根拠が妥当であることを確認。詳細側は `DirectoryService.computeSegments`（`getNoteDetail.ts:104`、バックエンド I/O）で算出しているのに対し、一覧側は既ロード済み `flat` の `parentId` を辿る純粋再構成で代替できる。アプリ層不可侵・依存方向に整合する。
- #356 ADR-002（root の directoryId をフィルタに渡さない）、#497 ADR-001（ディレクトリは active チップのみ表示）の実在と内容を確認。plan/ADR の引用は正確で、#497 ADR-001 を #710 ADR-002 で上書きする判断も妥当。

## 結果

---

#### 問題点（要修正）

問題点ゼロ。

Issue 本文で合意された全要件（パンくず置換・セグメントリンク化・末尾 × 維持・optimistic 扱い・フォールバック・root 除外・別行レイアウト）が AC-1〜AC-8 に漏れなく落ちており、各 AC は検証可能な形（DOM 要素・属性・分岐条件）で書かれ、実装ステップ 1〜5 への紐づけも正しい。スコープ外作業の混入もない（バックエンド・`NoteBreadcrumb`・他 facet をいずれも「含まれないもの」で明示的に除外）。コメントが 0 件のため、議論との矛盾も発生しない。

---

#### 改善提案（検討推奨）

- **[S-001]** 「追加 I/O 不要」を検証可能な AC として明文化することを検討
  - 理由: 「追加 I/O 不要」は Issue 本文で明記された設計制約（要件級）だが、現状は AC 表ではなくスコープ「含まれないもの」と設計節にしか現れていない。`directoryAncestorSegments` を純粋関数として `directoryTree.ts` に置く方針自体は正しいが、実装時に誤って `loadDirectory*` 系の追加ロードや server-fn 呼び出しを足してもどの AC にも引っかからない。例えば「AC-9: ディレクトリパンくず描画のために `FilterSection` の `Promise.all`（loadAllTags / loadDirectoryTreeFlat / loadReferencingNoteTitle）以外の新規 I/O を追加しない」を加えると、レビュー・テスト時の検証点が明確になる。必須ではない（性質上ユニットテストで純粋性は担保される）。

- **[S-002]** AC-4 の過渡状態（optimistic ≠ baseline）時の挙動を AC に明示することを検討
  - 理由: plan 本文（実装ステップ 3・リスク節）では「`optimisticDirectoryId === directoryId` 一致時のみパンくず、不一致の過渡状態はフォールバックチップ」と明確に書かれているが、AC-4 の本文は「undefined で非表示／baseline 確定でセグメント表示」までしか述べておらず、「optimistic が baseline と不一致の過渡状態」がどちらの分岐に落ちるかが AC レベルでは曖昧。AC-4 か AC-5 に「optimistic と baseline が不一致の過渡状態はフォールバックチップ表示」を一文追記すると、3 分岐（非表示／パンくず／フォールバック）が AC だけで完全に閉じる。現状でも実装ステップ 3 と AC-5 の合わせ読みでカバーされるため軽微。

---

#### 良い点

- Issue 本文の要件を 1 対 1 で AC 化し、各 AC に「由来」列（Issue 対応方針／実装メモ／#356 ADR-002／回帰防止）を付けてトレーサビリティを担保している。要件の出所が追跡可能。
- 各 AC が DOM 要素（`nav`）・属性（`<Link search>`）・分岐条件（`optimisticDirectoryId === undefined`）といった検証可能な粒度で書かれており、テスト方針（ユニット＋コンポーネント、Link/useRouter モック）と整合している。
- スコープの「含まれないもの」でバックエンド・`NoteBreadcrumb` 共通化・他 facet 体裁変更を明示的に除外し、各除外に理由（追加 I/O 不要／末尾要素の意味差／対象外 facet）を添えている。スコープクリープの予防が効いている。
- `NoteBreadcrumb` を流用せず派生コンポーネントを新設する判断（ADR-001）に、末尾要素の意味差（title vs 解除 ×）という明確な根拠があり、Issue の「同じパンくず表示に置き換える＝パターン踏襲であって同一コンポーネント共有要求ではない」という解釈も妥当。
- #497 ADR-001（active チップのみ表示）との矛盾を認識し、#710 ADR-002 で上書きを明示、旧 ADR を履歴として残す方針も整合的。過渡状態・id 不在時にフォールバックを残す判断は AC-5/AC-8 の回帰防止と一貫。
- root 除外を「ヘルパー側で `name === ""` 除外」＋「root id をフィルタに渡さない」の二重で担保し、#356 ADR-002 を正しく踏襲している。
