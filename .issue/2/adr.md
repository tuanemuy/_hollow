# ADR — Issue #2: [spec-sync] frontend: P18 タグ管理画面に統合（マージ）機能と削除時ブラックリスト化が未実装

## ADR-001: マージ先選択 UI はモーダルダイアログ + `<select>` で実装する

### Status
Proposed

### Context
マージ先タグの選択 UI には以下の選択肢があった:

1. インラインの `<select>` を `TagActions` の行内に展開（Agent 3 提案）
2. モーダルダイアログ + `<select>`（Agent 1 / Agent 2 提案）
3. Combobox / 検索付き選択 UI

### Decision
モーダルダイアログ + `<select>` を採用する。`app/components/note/list/MoveNoteDialog.tsx` の構造（`dialog-backdrop` / `dialog` / `dialog-title` / `dialog-actions` + `<form>` ベース）にそろえる。

### Consequences
- 良い点:
  - プロジェクト既存の対象選択ダイアログと UI / 操作感が一致し、利用者・コード読み手両方の認知負荷を抑える
  - インライン編集中のリネームフローと UI 状態が交錯せず、責務分離が明確
- トレードオフ:
  - 行内 `<select>` よりクリック数が 1 増える（許容範囲）
  - Combobox / 検索付き選択にしないため、200 を超えるタグを抱えるケースでは候補から外れるタグが出る可能性が残る（`TAG_RESOLVE_LIMIT = 200` の挙動を踏襲）

---

## ADR-002: マージ候補は RSC 側 `TagManager` で組み立てて props 経由で渡す

### Status
Proposed

### Context
マージ先候補（自分以外の同オーナータグ一覧）の取得方法に以下の選択肢があった:

1. `TagManager`（RSC）で既に取得済みの `tags` をフィルタして `TagActions` へ props 渡し
2. ダイアログを開いた瞬間にクライアント側で別 server function を呼んで取得
3. 候補組み立てを `buildMergeCandidates(...)` のような純粋関数に切り出して別ファイル化 + 単体テスト

### Decision
1（RSC 側の既存 `tags` を `.filter()` で再利用、`TagManager.tsx` 内にインライン）を採用する。3 の純粋関数抽出は採用しない。

### Consequences
- 良い点:
  - ダイアログ展開時に追加 server function 呼び出しが発生せず、ラウンドトリップが少ない
  - `TAG_RESOLVE_LIMIT = 200` のキャップが画面表示と候補で一致するため、ユーザーが「表示されているタグの中から選ぶ」感覚と整合する
  - ファイル増加・テスト増加なし
- トレードオフ:
  - `TagManager` の `tags` が更新されてから `TagActions` のダイアログを開くまでの間に他クライアントが新規タグを作成した場合、新タグは候補に出ない。`router.invalidate()` でそのうち反映されるため許容範囲

---

## ADR-003: 削除確認の `window.confirm` 文言にブラックリスト化挙動を明示する

### Status
Proposed

### Context
`deleteTag` usecase は既に `tagBlacklistRepository.add(...)` を実行しており、削除後に同名タグの自動再抽出を抑止する仕様。一方 UI の `window.confirm` 文言は「参照ノートからも除去されます」とのみあり、ブラックリスト挙動の存在をユーザーが理解できない。

選択肢:
1. 文言を更新し、ブラックリスト化（再抽出されない）旨を明示
2. 専用モーダルに置き換えてブラックリスト除外オプション等の UI を追加
3. 現状維持

### Decision
1 を採用する。`window.confirm` のままで文言のみ更新し、UI 構造は変更しない。

### Consequences
- 良い点:
  - spec の「ブラックリスト化（再抽出防止）」挙動を UX に反映する最小変更
  - バックエンド変更不要
- トレードオフ:
  - 「ブラックリスト除外を選べる」ような将来要件には拡張余地がない（その時点で別 Issue 化する）

---

## ADR-005: ダイアログのフォーカストラップ・Esc クローズ・Portal 化は本 PR で対応せず別 Issue 化

### Status
Proposed

### Context
Phase 3 レビュー（review-001.md）で以下が Warning として指摘された:

- **[W-001]** `MergeTagDialog` にフォーカストラップ・Esc クローズが未実装
- **[W-002]** ダイアログがリスト項目（`<li>` 配下）にレンダリングされており Portal 化されていない

選択肢:
1. 本 PR で `MergeTagDialog` だけ修正
2. 本 PR で `MoveNoteDialog` と `MergeTagDialog` の両方を修正
3. 共通 `<Dialog>` ラッパーを別 Issue で導入し、既存ダイアログを段階的に置き換え

### Decision
3 を採用する。本 PR では既存パターン（`MoveNoteDialog` 踏襲）のままとし、別 Issue（#54）として起票する。

### Consequences
- 良い点:
  - 本 PR のスコープを「マージ機能の UI 接続 + 削除確認文言の更新」に絞り続けられる
  - `MoveNoteDialog` と `MergeTagDialog` の片方だけ直して整合性が崩れる事態を回避できる
  - 共通化のタイミングで focus trap / Esc / Portal を一括で導入できる
- トレードオフ:
  - 本 PR がマージされた時点でダイアログのアクセシビリティ改善は未着手のまま残る
  - 別 Issue (#54) を確実にフォローしないと放置される懸念

---

## ADR-004: 「一括処理ジョブの進捗表示」は本 Issue のスコープ外

### Status
Proposed

### Context
spec/pages/index.md の P18 仕様には「一括処理ジョブの進捗表示」が含まれるが、本 Issue 本文の「対応方針」セクションは `MergeTags usecase を TagActions の UI に接続し、削除時に TagBlacklist へ登録する分岐を追加する` の 2 点のみを target としている。

また現状 `mergeTags` / `deleteTag` ともに UoW 内同期実行であり、進捗イベント基盤（ジョブテーブル / WebSocket / SSE 等）は存在しない。

### Decision
本 Issue では進捗表示を実装しない。マージ・削除実行中は `useTransition` の `isPending` で操作ボタンを disabled にするのみとし、進捗 UI は別 Issue で別途検討する。

### Consequences
- 良い点:
  - Issue のスコープを「UI 接続」に絞り、変更量とレビュー負荷を抑えられる
  - 進捗基盤の設計（同期 vs 非同期ジョブ化、イベント配信方式）を独立 Issue で議論できる
- トレードオフ:
  - spec の P18 機能リストとの差分（進捗表示未実装）が残る — 必要なら spec-sync で別 Issue として起票する
