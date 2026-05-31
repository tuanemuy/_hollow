# PR Review #001 — fix(issue/296): root の loadAppContext をナビゲーションごとに発火させない

**PR:** #366
**Date:** 2026-05-31
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1（W-001。両レビュアーが独立に検出）
- Notes: 多数（設計判断の妥当性をコード根拠で確認）
- Verdict: **BLOCKED**（Warning を修正してから再レビュー）

---

## Frontend / TanStack Router 整合性

### Blockers
なし

### Warnings

- **[W-001]** 失敗したプロミスが恒久キャッシュされる
  - 場所: `app/routes/__root.tsx`（`clientAppContext ??= loadAppContext()`）
  - 理由: `??=` は `undefined` のときだけ代入するため、初回クライアント取得が reject すると rejected promise がモジュールスコープに残り続ける。以降の全ナビゲーションが同じ失敗プロミスを再利用し、root の `beforeLoad` が永続的に失敗 → 全ルートで config 欠落（head の meta/OG/canonical 落ち）かつ自己回復不能。修正前は per-nav に fresh 取得していたため一過性失敗は次のナビゲーションで自然回復していた → 明確な後退。`defaultPreload: "intent"`（`app/router.tsx`）のホバー先読みでも初回呼び出しが発火しうる。
  - 提案: 成功時のみキャッシュ／reject 時はキャッシュを `undefined` に戻して次回リトライ可能にする。

- **[W-002]** `ReturnType<typeof loadAppContext>` の型は現状機能しているが、server fn が将来 callable + プロパティ体になりうる点だけ意図確認（注意喚起レベル、現状問題なし）。

### Notes
- **[N-001]** SSR ガードの tree-shaking・RSC manifest 登録は健全（`import.meta.env.SSR` 静的 boolean 置換で client 側 SSR 分岐は DCE。`loadAppContext` はガード外からも参照され登録維持）。
- **[N-002]** hydration mismatch は理論上も解消（新旧とも Promise を返し context への積まれ方は同一。client も server 値をキャッシュ再利用するため appUrl 一致）。
- **[N-003]** staleTime 削除は正しい（root に loader なし → no-op）。`_app/route.tsx` は実 loader を持つため staleTime 維持が整合的。
- **[N-004]** SSR キャッシュバイパス判断は Cloudflare Workers のモジュールスコープ共有性に対し正しい。
- **[N-005]** コメント品質は CLAUDE.md「WHY のみ」に合致。命名も明確。

---

## Performance & Risk

### Blockers
なし

### Warnings

- **[W-001]**（Frontend レビューと同一）失敗したプロミスが恒久キャッシュされ、以降の全ナビゲーションが失敗し続けるリスク
  - 場所: `app/routes/__root.tsx`（`clientAppContext ??= loadAppContext()`）
  - 理由: 一過性のネットワーク断/5xx で `clientAppContext` が「毒入り」になると、リロード（モジュール再評価）まで SPA ナビゲーションが全滅。修正前は次ナビゲーションで自然回復していたため明確な後退。ADR/plan のリスク欄でも未言及。
  - 提案: 成功時のみキャッシュ。reject 時に `undefined` へ戻す。ADR に失敗時挙動を一文追記。

### Notes
- **[N-001]** `import.meta.env.SSR` は server バンドルで確実に `true` 解決され client ブランチは server 側に物理的に存在しない（`vite.config.cloudflare.ts` の ssr/rsc env）。
- **[N-002]** 仮にサーバーで書き込まれても config に機微情報なし（静的 content + env の appUrl のみ。secrets は `createRequestContainer` で除外）。二重に安全。
- **[N-003]** キャッシュ無効化不要の前提は妥当（`AppConfig` に DB 由来設定は含まれない）。将来サイト設定を DB 化するとキャッシュ stale 化の注意点はあるが現状無害。
- **[N-004]** SSR 側の後退なし（SSR は getContainer の in-process 解決でネットワーク RPC なし）。
- **[N-005]** パフォーマンス効果は実証済み（summary.md TC-002 で per-nav 0 回）。残る初回1回は appUrl 一致とのトレードオフで妥当。

---

## Design Decisions

- W-001 への対応として「クライアントキャッシュは成功したプロミスのみ保持し、失敗時はクリアして次回リトライ可能にする」を採用。ADR-001 に追記する。

---

## 修正方針

- **W-001（両視点）**: `resolveAppContext` を「reject 時にキャッシュをクリアする」形へ変更。同ファイル内で完結する軽微修正のため本 PR で対応。
- **W-002**: 現状問題なしのため対応不要（型は typecheck で担保済み）。
