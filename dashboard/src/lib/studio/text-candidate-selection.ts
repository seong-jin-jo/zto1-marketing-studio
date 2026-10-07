import type { TextCandidate } from "@/lib/studio/text-candidate-contract";

export function textCandidateLines(candidate: Pick<TextCandidate, "content">): string[] {
  return candidate.content.threads
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function textCandidateSelectionWouldDiscardEdits(input: {
  currentSelectedId?: string | null;
  currentLines: readonly string[];
  nextCandidateId: string;
  candidates: readonly TextCandidate[];
}): boolean {
  if (!input.currentSelectedId || input.currentSelectedId === input.nextCandidateId) return false;
  const currentCandidate = input.candidates.find((candidate) => candidate.id === input.currentSelectedId);
  if (!currentCandidate) return input.currentLines.length > 0;
  return JSON.stringify(input.currentLines) !== JSON.stringify(textCandidateLines(currentCandidate));
}
