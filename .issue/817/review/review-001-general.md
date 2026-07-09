### General Review

対象 PR: #820 / Issue #817（`/admin/users` の `formatDate`・`/admin/jobs` の `formatDateTime` に `timeZone: "Asia/Tokyo"` を明示して hydration mismatch を決定論的に解消）

結論: 修正は正しく、受け入れ基準 AC-1〜AC-3 を満たし、スコープも計画どおり2ファイルに限定されている。**Blocker なし**。マージ可能。

#### Blockers
- なし

#### Warnings
- **[W-001]** `formatDate`（UsersTable）と `formatDateTime`（Jobs）は「無効値 early-return → `ja-JP` + `timeZone: "Asia/Tokyo"` で整形」という同型ロジックを別ファイルに重複保持しており、今回追加した WHY コメントも2箇所に逐語コピーされた。
  - 場所: `app/components/admin/UsersTable/index.tsx:91-102` / `app/components/admin/Jobs/index.tsx:159-172`
  - 理由: 表示 TZ を変える・ICU 差異の注記を直す等の将来変更が2箇所同期を要する。`app/components/common/relativeTime.ts` という日付整形の共通置き場が既に存在し、`formatInTokyo(value, options)` 的な薄い共通ヘルパーに寄せられる余地がある。ただし重複は本 PR 以前から存在し、今回は各1行追加の最小修正としては妥当な判断でもある。
  - 提案: 本 PR のスコープでは現状維持で可。横断修正（下記 N-002 の別 Issue）を起こす際に、admin 共通の TZ 固定整形ヘルパーへの集約を併せて検討するとよい。**この PR のブロックにはしない。**

#### Notes
- **[N-001]** 修正の妥当性を確認。整形オプションが `year:"numeric"` / `month:"2-digit"` / `day:"2-digit"`（Jobs は加えて `hour`/`minute` の `2-digit`）と全て数値フィールド固定のため、出力は `YYYY/MM/DD`（`HH:MM`）となり、workerd と各ブラウザ間の ICU バージョン差の影響を受けない。`timeZone` 固定により SSR（workerd 既定 UTC）とクライアント（ブラウザ TZ）が確実に同一文字列となり、mismatch が原理的に消える。ADR-001 の「選択肢1」判断は堅実。
- **[N-002]** `app/components/admin/Dashboard/index.tsx:145` の `formatActivityTime` は同じ admin 領域・同じく SSR される `"use client"` コンポーネントでありながら、JSDoc が明示的に「viewer's locale time zone」と謳い `timeZone` 未指定（`Intl.DateTimeFormat("ja-JP", {hour, minute})`）で、本 Issue とまったく同型の hydration mismatch を抱えうる。plan.md「含まれないもの」で意図的にスコープ外とされており本 PR の欠陥ではないが、横断修正の別 Issue（plan Phase 4）に確実に含めるべき代表例として記録しておく。
- **[N-003]** 細部いずれも問題なし。(a) `timeZone` は `Number.isNaN(date.getTime())` の early-return より後の整形オプション内に置かれ、不正値はこれまでどおり元文字列を返す既存挙動を維持。(b) 関数シグネチャ・呼び出し側（`formatDate(user.createdAt)` 等）・戻り値型は不変で波及なし。(c) コメントは「Workers が Intl 既定を UTC にする」という非自明な WHY のみを述べ、`#817` 参照付きで CLAUDE.md のコメント方針に合致（Issue 参照はユーザー規約上も設計根拠ポインタとして残置が正）。
- **[N-004]** ビルド健全性を確認: `pnpm typecheck` 通過、変更2ファイルの Biome lint / format ともに no fixes。各ファイルに他の `toLocale*` 呼び出しは無く（UsersTable=`formatDate` 1系統、Jobs=`formatDateTime` 1系統）、対象2画面の日付表示は今回の修正で完全にカバーされている。product コードの変更は当該2ファイルのみで、残りの差分は `.issue/817/` 配下の計画・ADR・テスト成果物のみ。スコープ規律良好。
