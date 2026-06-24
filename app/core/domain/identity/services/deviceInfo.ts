/**
 * Parsed, display-oriented summary of a session's `userAgent`. Pure
 * derived data — not a business invariant — so it lives as a stateless
 * domain service rather than a value object on an aggregate.
 *
 * Every field that cannot be determined from the UA string is `null`:
 * fabricating an OS / browser name is forbidden. `label` is only synthesised
 * when both `os` and `browser` are known; otherwise it stays `null` and
 * the presentation layer falls back to the raw UA or a neutral label.
 *
 * - `kind` is the minimal classification driving the row icon glyph.
 *   `unknown` means the UA gave us nothing to classify (or was absent).
 * - Version numbers and exhaustive device names are intentionally not
 *   parsed: they are easily spoofed and add fabrication risk for little
 *   display value. Only the major OS / browser token is matched.
 */
export type DeviceInfo = Readonly<{
  kind: "desktop" | "mobile" | "tablet" | "unknown";
  os: string | null;
  browser: string | null;
  label: string | null;
}>;

/**
 * Derive a {@link DeviceInfo} from a `userAgent` string. Pure: no I/O,
 * no ambient time, no randomness — only the structure of the input
 * string determines the output.
 *
 * Indeterminate fields are returned as `null` (never guessed). The
 * matcher recognises only the major OS / browser tokens listed below;
 * anything else yields `unknown` / `null`.
 */
export function parseDeviceInfo(userAgent: string | null): DeviceInfo {
  if (userAgent === null) {
    return { kind: "unknown", os: null, browser: null, label: null };
  }
  const ua = userAgent.trim();
  if (ua === "") {
    return { kind: "unknown", os: null, browser: null, label: null };
  }

  const os = detectOs(ua);
  const browser = detectBrowser(ua);
  const kind = detectKind(ua, os);
  const label = os !== null && browser !== null ? `${browser} on ${os}` : null;

  return { kind, os, browser, label };
}

function detectOs(ua: string): string | null {
  // iPad must be checked before the generic "Mac" branch: iPadOS UAs
  // report "Macintosh" on desktop-class Safari, but a literal "iPad"
  // token is authoritative when present.
  if (/\biPad\b/.test(ua)) return "iPadOS";
  if (/\biPhone\b/.test(ua)) return "iOS";
  if (/\biPod\b/.test(ua)) return "iOS";
  if (/\bAndroid\b/.test(ua)) return "Android";
  if (/Windows NT/.test(ua)) return "Windows";
  // "Mac OS X" / "Macintosh" → macOS. Checked after iOS/iPad so those
  // more specific tokens win.
  if (/\bMac OS X\b/.test(ua) || /\bMacintosh\b/.test(ua)) return "macOS";
  // Generic Linux last: many mobile UAs also contain "Linux", so this
  // only matches when no more specific OS token did.
  if (/\bLinux\b/.test(ua)) return "Linux";
  return null;
}

function detectBrowser(ua: string): string | null {
  // Order matters: Edge / Chrome UAs also contain "Safari", and Edge
  // contains "Chrome", so the most specific token is checked first.
  if (/\bEdg(?:e|A|iOS)?\//.test(ua)) return "Edge";
  if (/\bFirefox\//.test(ua) || /\bFxiOS\//.test(ua)) return "Firefox";
  if (/\b(?:Chrome|CriOS)\//.test(ua)) return "Chrome";
  // Safari only when it is genuinely Safari (has the Version/ token and
  // is not one of the above engines that also advertise "Safari").
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) return "Safari";
  return null;
}

function detectKind(ua: string, os: string | null): DeviceInfo["kind"] {
  if (os === "iPadOS") return "tablet";
  if (os === "iOS") return "mobile";
  if (os === "Android") {
    // Android phones carry the "Mobile" token; Android tablets omit it.
    return /\bMobile\b/.test(ua) ? "mobile" : "tablet";
  }
  if (/\bTablet\b/.test(ua)) return "tablet";
  if (os === "Windows" || os === "macOS" || os === "Linux") return "desktop";
  return "unknown";
}
