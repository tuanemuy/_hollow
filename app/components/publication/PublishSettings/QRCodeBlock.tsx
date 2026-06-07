"use client";

import { useEffect, useState } from "react";
import { QR_BLOCK, QR_CAPTION, QR_CODE } from "../styles";

/**
 * Renders a QR code for a share link URL alongside a scan caption.
 *
 * `qrcode` is dynamically imported inside the effect so it stays out of the SSR
 * server bundle and loads as a lazy client chunk only when an active link is
 * shown (the effect never runs during SSR). The `cancelled` guard prevents a
 * `setState` after unmount (the active share-link row disappears on revoke). On
 * generation failure nothing renders — the QR is only a convenience complement
 * to the copy affordance. The `dangerouslySetInnerHTML` is confined to the
 * self-generated SVG string (not user input); see `.issue/570/adr.md` ADR-001
 * for why this is outside the `.note-detail-content` style exception.
 */
export function QRCodeBlock({ url }: { url: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toString(url, { type: "svg", margin: 0 }),
      )
      .then(
        (generated) => {
          if (!cancelled) setSvg(generated);
        },
        () => {},
      );
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (svg === null) return null;

  return (
    <div className={QR_BLOCK}>
      <div
        className={QR_CODE}
        role="img"
        aria-label="QR コード"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: self-generated SVG string (see ADR-001), not user input.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className={QR_CAPTION}>
        スマホのカメラで読み取って共有できます。
        <br />
        リンクと同じアクセス範囲です。
      </p>
    </div>
  );
}
