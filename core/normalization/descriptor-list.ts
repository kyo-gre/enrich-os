import descriptors from "../../config/descriptor-list.json";

const DESCRIPTOR_PATTERN = new RegExp(
  `\\b(${descriptors
    .map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length) // longest-first so "co-founder" beats "founder"
    .join("|")})\\b`,
  "gi",
);

/** Strips known creator descriptors/titles (Coach, Founder, ...) from a name-like string. */
export function stripDescriptors(text: string): string {
  return text.replace(DESCRIPTOR_PATTERN, "");
}
