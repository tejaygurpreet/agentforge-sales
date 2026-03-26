/**
 * Strips AgentForge-appended research digests and internal recovery lines from `lead.notes`
 * so exports/PDFs stay readable and don't duplicate the Research section (Prompt 26).
 */
export function userFacingLeadNotes(notes: string | null | undefined): string {
  if (notes == null || !notes.trim()) return "";

  const strippedRecovery = notes
    .split("\n")
    .filter((line) => !/^\s*Research(\s+recovery|\s*:| LLM shape)/i.test(line))
    .join("\n")
    .trim();

  const chunks = strippedRecovery.split(/\n---\n/).map((c) => c.trim()).filter(Boolean);
  if (chunks.length <= 1) {
    return chunks[0] ?? "";
  }

  const digestMarker =
    /^(ICP score:|Industry:|News\/funding note:|BANT \(confidence\):|Size:|Tech hints:|Angles:)/m;
  const rest = chunks.slice(1);
  const restLooksLikeDigest = rest.some((c) => digestMarker.test(c));

  if (restLooksLikeDigest) {
    return chunks[0] ?? "";
  }

  return strippedRecovery;
}
