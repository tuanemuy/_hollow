# Plan Review — Issue #663 / Round 2（アーキテクチャ・実現可能性・リスク視点）

レビュー対象: `.issue/663/plan.md` / `.issue/663/adr.md`（Round 1 反映後）
レビュー日: 2026-06-13

## 総評

Round 1 の指摘はすべて正しく反映されている。特に P-001（純関数引数に定数条件を渡す形では Rollup の DCE が成立しない問題）は、提案どおり「エントリのトップレベル短絡 `&&` の左辺に `import.meta.env?.MODE !== "production"` を直接置き、純関数は `viteDev ∨ flag === "true"` のみ」という 2 段ゲート構造に再設計され、設計セクション・ステップ 1〜3・リスク欄・ADR-001 追記まで一貫して書き直されている。S-001〜S-003 の取り込みも確認した。

実コードとの突き合わせでも計画は成立する見込み:

- `app/server.cloudflare.ts:57-58` の既存ゲートは `(import.meta as {...}).env?.DEV === true` というキャスト + optional chaining 形で、docs の DCE grep ゲートが現に通っている。`MODE` も同じ `import.meta.env` define オブジェクトに含まれるため、同形の置換・畳み込みが効く蓋然性は高い。効かない場合のフォールバック（参照形の調整）と実ビルド grep での実証がステップ 3 / 7-2 に明記されており、リスクは閉じている。
- `pnpm start`（wrangler dev が `main = "app/server.cloudflare.ts"` を直接バンドル）では `import.meta.env` が `undefined` → 左辺 true → `wrangler.toml [vars]` の `DEV_INLINE_RELAY` で有効化、という経路は現行の `R2_DEV_OBJECT_PROXY`（同じく `pnpm start` で実働中）と同一機構であり実現可能。
- `InlineRelayTrigger` 本体・`RelayTrigger` ポート・staging/production テンプレートに手を入れない範囲設定も実コードと整合。

## 問題点

問題点ゼロ。

## 改善提案

- **[S-001]** ステップ 7 前提の「二次 outbox イベント要否の机上確認」は、本レビューで実コードを確認した結果を先取りして計画に書き込んでよい
  - 確認結果: `app/core/application/export/runExportJob.ts` は job の complete / fail を consumer container 内の UoW で `exportJobRepository.save(entity, expectedVersion)` により**直接**書き込む。ポーリング serverFn が読むのは job 行そのものなので、ステータス遷移とアーティファクト URL の可視化に二次 outbox dispatch は不要 — AC-1 は 1 kick（ジョブ作成 UoW commit 起点）で成立する見込み。
  - 補足: `ExportJob.fail` / complete 時に `collectEvents(eventDrafts)` で積まれる二次イベントは、InlineRelayTrigger の consumer container が `RELAY` を strip して `NoopRelayTrigger` になるため**次の UoW commit 起点の kick まで滞留する**（#66 ADR-002 の既知挙動）。AC-1 には影響しないが、`pnpm start` では完了イベント起点のダウンストリーム副作用（通知・projection 等があれば）が遅延する点を docs 更新（ステップ 6）か検証記録に一言残すと、将来の manual-test で「イベントが来ない」と誤判断されにくい。

## 良い点

- **P-001 の反映が表面的でない。** ゲート構造の変更に合わせて、単体テストの責務（「production で無効」をテストから外し grep 検証へ移管）、AC-2 の位置づけ（「保証の唯一の検証点」）、JSDoc に書く注意書き、ADR-001 の追記まで、保証の所在が一貫して付け替えられている。責務の二重記載や旧設計の残骸がない。
- **DCE の残存リスク（define 置換がキャスト形に効くか）を「実ビルドで実証 + 失敗時の修正手順」として計画内に閉じている。** 推測で正しさを主張せず、検証ステップに帰着させているのは、この種のビルド最適化依存の設計として正しい姿勢。
- **`R2_DEV_OBJECT_PROXY`（#657）パターンの忠実な踏襲。** 「ローカル `wrangler.toml [vars]` 限定 + toml コメントで staging/production への追加禁止 + docs に運用ルール」という 3 点セットが既存前例と同形で、規約の一貫性が保たれる。
- **AC-3 の検証が機械的**（テンプレート差分なし + DCE grep 通過の 2 点）で、「実行時挙動は不変」という否定形の基準を観測可能な形に落とせている。
- **`pnpm dev` 側の OR 条件の無害性（S-002）を docs に明記する判断**により、「この var は `pnpm start` 専用」という誤読への手当てができている。

## 集計

- 問題点: 0
- 改善提案: 1（S-001）
