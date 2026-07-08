export type ProfilePlatform =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "youtube"
  | "generic";

/** Classifies a profile URL by hostname. Unrecognized or unparsable URLs fall back to "generic". */
export function classifyProfileUrl(url: string | undefined): ProfilePlatform {
  if (!url) return "generic";

  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "generic";
  }

  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "fb.com" ||
    host.endsWith(".fb.com")
  )
    return "facebook";
  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be"
  )
    return "youtube";
  return "generic";
}
