export type RequiredDraftPersistenceResult =
  | { ok: true; draftId: string }
  | { ok: false };

export async function attemptRequiredDraftPersistence(
  persist: () => Promise<string | undefined>,
): Promise<RequiredDraftPersistenceResult> {
  try {
    const draftId = await persist();
    return draftId ? { ok: true, draftId } : { ok: false };
  } catch {
    return { ok: false };
  }
}
