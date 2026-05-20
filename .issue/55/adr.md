# ADR — Issue #55: P18 タグ管理画面 一括処理ジョブの進捗表示

## ADR-001: 案 1（同期実行のまま体感を上げる）を採用する

### Status
Proposed

### Context
Issue 本文には 3 案が提示されていた:

1. **同期のまま体感を上げる** — `useTransition` + プログレスバー風 UI（件数ストリーミング不要）
2. **非同期ジョブ化** — Queue + Worker で処理、進捗テーブル + WebSocket/SSE/ポーリング
3. **段階フィードバック** — `mergeTags` usecase の 500 件/ページ境界で進捗イベント発行 → クライアント購読

3 案を以下の軸で評価:

| 軸 | 案 1 | 案 2 | 案 3 |
|---|---|---|---|
| 影響レイヤー | frontend のみ | domain / application / adapter / outbox / consumer / frontend 全層 | application / outbox / frontend |
| 既存テストへの影響 | なし | usecase 仕様変更で大量改修 | usecase 仕様変更 |
| ジョブ基盤の必要性 | 不要 | 新規ドメイン (JobEntity) + 新規テーブル + 新規ポート | 新規 transport (SSE/WS) |
| トランザクション境界 | 既存維持 (atomic) | 中間状態が発生（タグ削除と本文書き換えが atomic でなくなる） | UoW 内同期は維持できるが配信用 transport が必要 |
| Issue 要件「進捗表示」充足 | ○ | ◎ | ◎ |
| 既存規模との整合 | ○（`TAG_RESOLVE_LIMIT = 200` 想定で 1-2 page で完了） | 過大 | 過大 |
| YAGNI | ◎ | × | △ |

### Decision
**案 1 を採用する。** `mergeTags` / `deleteTag` usecase は無変更とし、UI 側に以下の **2 段構成** を追加する:

1. **対象件数の事前提示**（pre-flight）: ダイアログを開いた時点で「対象ノート: N 件」を表示
2. **実行中の indeterminate progressbar**（in-flight）: `useTransition` の `isPending` 駆動で「動いている」アフォーダンス

Issue 本文の「背景」は **「進捗表示は、ノート規模が大きいタグ操作（マージ対象ノートが数百件以上）の体験向上を意図したもの」** と明記している。Issue 本文の「対応方針（要設計）」では案 1 の中身が「`useTransition` の `isPending` + プログレスバー風 UI（処理件数のストリーミング表示は不要）」と書かれており、件数事前提示までは要件として明記されていない。本 ADR では「規模感が分からない」というユーザー不安の解釈に基づき、件数事前提示を Issue 意図を満たすための補強策として位置づける（Issue 本文の文言から直接導かれる要件ではなく、ADR 独自の解釈による拡張）。

### Consequences
- 良い点:
  - 変更ファイルが frontend 数点のみ。usecase / port / domain / outbox / DB 設計に影響なし
  - 既存統合テスト（`tag.integration.test.ts`）が無改修で素通り — リグレッション保護
  - Issue #2 ADR-004 で「別 Issue で別途検討」とされた経緯を最小コストでクローズできる
  - CF Workers のトランザクション境界・atomic 保証を保てる
  - Issue 本文の「規模感伝達」意図を件数事前提示で直接的に満たす
- トレードオフ:
  - 実進捗値（i/N）は表示できない（同期実行のため取得手段なし）
  - 対象ノート数が非常に大きい（>数百〜千）場合の CF Workers CPU time limit 問題は解決しない（別 Issue 領域）

---

## ADR-002: indeterminate progressbar（`aria-valuenow` 省略）を採用する

### Status
Proposed

### Context
案 1 採用に伴い progressbar の種類を決める必要がある:

1. 確定 progressbar — `aria-valuenow={current}` を更新
2. **不確定 (indeterminate) progressbar** — `aria-valuenow` を省略
3. spinner / pulse のみ — `role="progressbar"` を使わない

同期実行で実進捗値（処理済み件数）を取得する手段がないため、確定 progressbar に偽の値を入れるのは支援技術への嘘になる。

### Decision
**indeterminate progressbar を採用**。具体的には:

- `role="progressbar"` + `aria-busy="true"` + `aria-valuemin={0}` + `aria-valuemax={noteCount}` を付与
- `aria-valuenow` は**属性自体を出さない**（React で `aria-valuenow={undefined}` と書く → 属性自体が出力されない）
- `aria-label="N 件のノートを更新中"` でスケール感は文言で確実に伝える（`aria-valuemax` は indeterminate progressbar では支援技術が無視する場合があるため）
- 視覚要素は Tailwind 標準の `motion-safe:animate-pulse` を使うバーで実現（新規 `@keyframes` を追加しない）

### Consequences
- 良い点:
  - WAI-ARIA 仕様で確立された indeterminate progressbar パターンに準拠
  - 支援技術に「処理中（進捗不明）」が正しく伝わる
  - `aria-label` の文言で確実にスケール感を伝達
  - 新規 CSS / `@keyframes` 不要（CLAUDE.md「.note-detail-content は例外」方針と整合）
- トレードオフ:
  - 「あと何件」は分からない（同期実行の構造的制約）
  - `animate-pulse` は opacity フェード型なので、左→右に流れる典型的な indeterminate bar とは見た目が異なる。手動テストで UX を評価し、不十分なら別 Issue で新規 keyframe 検討

---

## ADR-003: `ConfirmDialog`（共通）は無改修で、呼び出し側の `description` で進捗 UI を完結させる

### Status
Proposed

### Context
削除確認に使う `app/components/common/ConfirmDialog.tsx` は note / view / ingestion / trash / tag などの複数ドメインから利用される汎用コンポーネント。タグ削除に進捗 UI を入れるアプローチには以下があった:

1. `ConfirmDialog` 本体に `progress?: { total: number }` のような新規 prop を追加
2. `ConfirmDialog` に `showProgress?: boolean` を追加し、true のときだけ progressbar を内部描画
3. **`ConfirmDialog` は無改修とし、呼び出し側で `description` ReactNode に進捗 UI を埋め込む**

### Decision
**3 を採用する。** `ConfirmDialog` の `description: React.ReactNode` 型は既に任意 ReactNode を受け取れるため、TagActions 側で `isPending` に応じて pre-flight / in-flight の description を切り替える。

加えて、削除フローを以下のように変更する:

- 成功時: `removeTag` 完了 → `router.invalidate()` 完了後にダイアログクローズ
- エラー時: ダイアログをクローズ → 既存の `TagActions` 行内 `FORM_ERROR` でエラー表示

エラー時もダイアログを閉じる理由: `ConfirmDialog` は `error` props を持たず、エラー表示は `TagActions` 行内の `FORM_ERROR` で行う既存挙動。ダイアログを開いたままだとバックドロップでエラー表示が隠れて見えない。既存挙動と整合させる。

### Consequences
- 良い点:
  - 共通コンポーネントの API が汚染されない（Issue #13 ADR-005 の境界尊重）
  - 他ドメイン（note / view / ingestion 等）の `ConfirmDialog` 利用に影響なし
  - 進捗 UI のロジックがタグ専用に閉じ、保守範囲が明確
  - エラー時の UX が既存挙動と一致（ダイアログクローズ + 行内 FORM_ERROR）
- トレードオフ:
  - 「削除中もダイアログを開いたままにする」フローは既存の確認後即クローズと微妙に異なる（小さな変更）
  - `router.invalidate()` 完了まで progressbar が動き続けるため、処理完了後も数百 ms の遅延が体感される可能性あり（許容範囲）

---

## ADR-004: `renameTag` には進捗 UI を出さない

### Status
Proposed

### Context
P18 仕様の「一括処理ジョブの進捗表示」は機能リストの 1 行のみで、対象操作の明示はない。`renameTag` も `mergeTags` / `deleteTag` と同じく `TagActions` に並ぶアクション。

実装を確認すると、`renameTag` も `mergeTags` / `deleteTag` と同様に同じ UoW 内で `RENAME_NOTE_PAGE_SIZE = 500` でページネーションしてノート本文を同期書き換えしている（`app/core/application/tag/renameTag.ts:71-92`）。つまり **bulk 処理の構造は同じ**。

### Decision
**`renameTag` は対象外**。理由:

- **Issue 本文の「背景」が `mergeTags` / `deleteTag` を明示対象としている**: 「現状 `mergeTags` / `deleteTag` は同期実行（`useTransition` の `isPending` で UI ボタンを disabled にするのみ）」と Issue 本文に書かれており、`renameTag` は対象に含まれていない
- **インライン編集 UI の制約**: リネームは行内インライン編集（テキスト入力 + 保存/キャンセル）で、ダイアログを開かない。進捗 UI の置き場（事前提示の枠、in-flight の progressbar 配置）が UX 設計上ない
- **「一括処理ジョブ」の語感**: 「ジョブ」という語は名前変更よりも統合/削除のような複数件のまとまった処理に親和する

技術的には `renameTag` も同じ bulk 構造を持つため、将来同等の進捗 UI を行内に出す要件が出れば別 Issue として独立検討する。

### Consequences
- 良い点:
  - スコープを Issue 本文が明示対象とした merge / delete に絞れる
  - インラインリネーム UI の簡潔さを保てる
- トレードオフ:
  - 仮に将来「リネームでも進捗を見せたい」要件が出た場合は、行内 UI に進捗領域を作る設計を別 Issue で扱う必要がある

---

## ADR-005: `tag.noteCount` の鮮度ズレを許容する

### Status
Proposed

### Context
件数事前提示と progressbar の `aria-valuemax` に使う `noteCount` は RSC で取得したキャッシュ値。別タブ・別クライアントが対象タグへノートを追加 / 削除すると、実件数と乖離する可能性がある。

選択肢:
1. ダイアログを開いた瞬間に再カウントする RPC を追加
2. 「対象ノート: 約 N 件」のように曖昧さを明示する
3. **現状の `noteCount` を「対象ノート: N 件」と通常表記し、ズレを許容する**

### Decision
**3 を採用する。** 現状の `TAG_RESOLVE_LIMIT = 200` 想定とユーザー単位タグ管理の使用頻度を考えると、ズレが実害になる可能性は極めて低い。`router.invalidate()` 後の表示で正確な値に追従する。

`aria-valuemax` が実件数と乖離する点について: indeterminate progressbar では支援技術が `aria-valuemax` を使った進捗計算を行わないため、UX 影響なし。スケール感の伝達は `aria-label` の文言（「N 件のノートを更新中」）で確実に行う。

### Consequences
- 良い点:
  - 追加 RPC ゼロ（Issue #2 ADR-002 の「ダイアログ展開時に追加 server function 呼び出しを避ける」方針と整合）
  - UI 表記がシンプル
  - indeterminate なので `aria-valuemax` ズレが UX に影響しない
- トレードオフ:
  - 並行操作時に件数表示が一時的に不正確になる（数秒のウィンドウ）。重大な意思決定に使われる数値ではないので許容

---

## ADR-006: `aria-valuenow={undefined}` に対する Biome `useValidAriaValues` を局所抑止する

### Status
Accepted

### Context
ADR-002 で「indeterminate progressbar の `aria-valuenow` 属性は **出さない**（React で `aria-valuenow={undefined}` と書くと属性自体が出力されない）」と決定した。実装した結果、Biome の `lint/a11y/useValidAriaValues` が「`aria-valuenow` の値は number のみ許容」として `undefined` を error 判定した。

選択肢:

1. Biome 設定で `useValidAriaValues` をプロジェクト全体で無効化 / `warn` 化
2. `aria-valuenow` 行に `biome-ignore` コメントを付けて局所抑止
3. `aria-valuenow` を条件付きで省略するための分岐（JSX レンダリング側で `{ ...(false && { 'aria-valuenow': 0 }) }` 等のトリック）
4. `aria-valuenow={0}` などの実値を入れる（ADR-002 と矛盾）

### Decision
**2 を採用する。** 該当行に `biome-ignore lint/a11y/useValidAriaValues: indeterminate progressbar omits aria-valuenow attribute (React skips undefined props) — see .issue/55/adr.md ADR-002` のコメントを付与。

理由:

- ADR-002 で確定した仕様（属性自体を出さない indeterminate モード）を維持しつつ、Biome の検査範囲は他箇所に保てる
- Biome のルールは健全（通常コードで `aria-valuenow={undefined}` は誤用）であり、グローバル無効化は副作用が大きい
- 抑止理由が ADR にリンクされているため、後続レビューでも意図が追跡可能
- 抑止箇所は 2 箇所（`TagActions.tsx` と `MergeTagDialog.tsx`）のみで局所性が高い

### Consequences
- 良い点:
  - WAI-ARIA 仕様準拠（属性省略）の indeterminate progressbar を維持
  - 他コードベース箇所で `useValidAriaValues` の保護を失わない
  - 抑止コメントから ADR へリンクされ意図が明確
- トレードオフ:
  - `biome-ignore` コメントが 2 箇所増える（許容範囲）
  - `biome-ignore` には期限・再評価メカニズムがないため、Biome 側のルール更新で false positive が解消された場合に抑止コメントが残ったまま素通りする。Biome のメジャー版上げ時には `biome lint --reporter github` 等で未使用 disable を検出し、本抑止が不要になっていないか確認する
  - 将来 progressbar を別コンポーネントに切り出した場合は抑止コメントも移動する必要がある
