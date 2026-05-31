# ADR — Issue #387: サイドバーでディレクトリを選択してもノート一覧が変わらない

## ADR-001: list 経路のディレクトリフィルタは「直下equality一致」とする

### Status
Accepted（ユーザー確認済み 2026-05-31）

### Context
サイドバーのディレクトリ選択は2つの一覧経路に流れる:

- **検索経路**（`q` あり）= `searchOwnNotes`：`resolveDirectoryPathPrefix` で `directoryPath` の**プレフィックス一致**＝サブツリー（子孫含む）を返す。
- **フィルタ経路**（`q` なし）= 本Issueで新規に `directoryId` を通す経路。

`notes` テーブルは `directoryId`（FK）のみ保持し path カラムを持たない。`idx_notes_directory_status (directory_id, status, updatedAt)` があるため `eq(notes.directoryId, ...)` の直下一致は高速。サブツリー一致にするには子孫ディレクトリID群の解決と `IN (...)`（D1 host-var 上限への配慮）が必要で実装が重い。

選択肢:
1. 直下equality一致（最小・高速、検索経路と非対称）
2. サブツリー一致（検索経路とUX一貫、実装が重い）

### Decision
**直下equality一致（選択肢1）** を採用。Issue のバグ（「一覧が切り替わらない」）は直下一致で解消でき、既存インデックスに乗る最小実装。サブツリー一致は本Issueのスコープ外とする。

### Consequences
- 良い点: 最小変更・高速・既存 `referencingNoteId` フィルタと同型で port→adapter→usecase→loader を素直に貫通できる。
- トレードオフ: 検索キーワードの有無で挙動が非対称になる（キーワードありはサブツリー、なしは直下のみ）。子を持つ親ディレクトリを選ぶと、キーワードなしでは子のノートが見えない。この非対称はフォローアップ Issue 候補として Phase 4 で扱う。
- 不正/存在しない directoryId の扱いも2経路で非対称: 検索経路は `DirectoryId.create` → `NotFoundError('directory')` を throw、フィルタ経路は `referencingNoteId` 同様 try/catch で握りつぶし空一覧にフォールバック。「サイドバー選択で一覧が切り替わる」目的には silent-empty で十分なため許容する。

---
