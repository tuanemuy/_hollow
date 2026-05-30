# PR Review #002 — P13 アップロードモーダル: LLM 提案精度の向上と登録 UX 改善

**PR:** #361
**Date:** 2026-05-30
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 解消確認
- Verdict: **APPROVED**

レイヤー: バックエンド（app/usecase + adapter/port）と フロントエンド/テスト の2視点で再レビュー。

---

## バックエンド（app/usecase + adapter/port）

#### Blockers
なし

#### Warnings
なし

1周目指摘の解消を確認:
- **W-A-001（循環ガード）** 解消 — `canonicalizeDirectoryPaths` に `visited: Set<string>` を導入。自己ループ・相互ループとも初回再訪で break→行スキップ。仮想 root 除外・孤立ノードの自然終了も確認。
- **W-B-001（leaf 長超過）** 解消 — `leaf.length > SUGGESTED_DIRECTORY_NAME_MAX_LENGTH` で id/name 両 null フォールバック。定数は domain VO から export して import。MAX ちょうど通過 / MAX+1 拒否でオフバイワン無し。
- **W-B-002（provider 片肺）** 解消 — `adapters/llm/prompts.ts` に純粋関数4つを集約、3 adapter すべてが参照。旧 private メソッド全削除・未使用 import ゼロ・外部参照ゼロを確認。anthropic の retry prefill / openai response_format / gemini responseMimeType は各 adapter に分離保持で無傷。
- 型・契約・後方互換の破綻なし。追加3テスト（near-miss / 多段 canonicalize / leaf 長超過）は実装の正しい性質を検証。

## フロントエンド/テスト

#### Blockers
なし

#### Warnings
なし

1周目指摘の解消を確認:
- **W-F-001（Link 二重遷移）** 解消 — CommittedView の Link から `onClick={onClose}` を除去（WHY コメント付き）。`UploadDialogMount` の `open = hash===upload && pathname!==/upload` を確認し、`/notes/$noteId` 遷移で hash が落ち自然に閉じる。「閉じる」ボタンは onClose を継続使用。
- **W-F-002 / W-T-001（committed view テスト）** 解消 — `UploadDialog.test.tsx` に editing→commit→committed テストを追加。編集 title が commit に渡る / 成功 announce / `to="/notes/$noteId"` / 即 navigate しない を検証。commitMock 配線も identity dispatch で妥当。
- a11y・規約準拠（utility-first / text-success token / motion-safe / data-primary / break-words / always-mounted role=status の流用）。`committed` は isPending 非該当で backdrop/Esc/× で閉じられる。

---

## Design Decisions
このラウンドでの新規設計判断なし（ADR-007 は review-001 ラウンドで記録済み）。

## 検証結果
- `pnpm typecheck`: クリーン
- `pnpm test:unit`: 2854 passed
- `pnpm test:integration`: 491 passed（41 files、新規3ケース含む）
- `./node_modules/.bin/biome check --write app/`: クリーン（残 warning は既存 test の biome-ignore）

## 結論
両視点とも Blocker 0 / Warning 0。**APPROVED**。Ready for review に切り替える。
