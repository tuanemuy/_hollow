# ブラウザ検証レポート — Issue #439

**実行日:** 2026-06-03
**判定:** スキップ（変更パスにUI接点が無い）

## スキップ理由（実際にコードで確認）

本Issueの変更は「trashed ノートを move しようとしたときに投げるエラーコードの値」を
`note_cannot_move_trashed` → `note_trashed` に変更する内部リファクタ。

ブラウザでこの変更箇所（trashed ノートの移動拒否）を検証することは不可能であると、以下をコードで確認した:

1. **単体ノート詳細の移動ボタンは trashed では描画されない** —
   `app/components/note/detail/NoteActions.tsx:128-137` で `status === "trashed"` のとき
   「ゴミ箱を開く」リンクのみを返して early return する。移動ボタン（`onClick={() => setOpen("move")}`）は
   active ノートにしか描画されない。

2. **一括移動（BulkActionBar）の対象も active ノート一覧** —
   `app/components/note/list/BulkActionBar.tsx` の一括移動はノート一覧（active）からの選択に対して動く。
   trashed ノートは `/trash` に隔離されており、一括移動の選択肢に現れない。

→ 変更した throw 分岐（`status !== "active"`）は UI から到達できない防御的ガードであり、
   API 直叩き等でしか踏めない。ブラウザ検証で踏むことができない。

3. **UI から到達可能な active ノートの移動成功パスは本リファクタで未変更** —
   触ったのは `status !== "active"` の throw 分岐のみ。active 経路（`Note.moveTo` の正常系・
   `note.moved` イベント発火・save）はバイト単位で不変。

## 自動テストでの担保

変更箇所の挙動は以下の自動テストで担保済み（いずれも PASS）:

- `pnpm typecheck` — `CannotMoveTrashed` 定数削除後に未参照が残らないことを型で保証
- `pnpm test:unit`（`entity.test.ts`）— `Note.moveTo` が trashed ノートで `NoteErrorCode.Trashed` を投げる
- `pnpm test:integration`（`moveNote.integration.test.ts`）— MoveNote / BulkMoveNotes の既存挙動が壊れない（558 件 PASS）

## 結論

ブラウザ検証はスキップ。変更パスにUI接点が無く、UI到達可能な経路は未変更で自動テストにより担保済みのため、
ブラウザ検証は本変更に対してシグナルを持たない。
