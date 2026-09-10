const DEFAULT_WORKSPACE_NAME = "기본 작업 공간";
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function workspaceDisplayName(name?: string | null): string {
  const trimmed = name?.trim() || "";
  if (!trimmed || EMAIL_LIKE.test(trimmed)) return DEFAULT_WORKSPACE_NAME;
  return trimmed;
}
