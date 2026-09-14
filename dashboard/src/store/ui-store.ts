"use client";

import { create } from "zustand";

// 활성 워크스페이스(테넌트). 멀티테넌트 컨텍스트. localStorage persist.
export interface Workspace {
  id: string;
  slug: string;
  name: string;
  tier?: string; // team | private(19금)
}

export type StudioRoom = "create" | "edit" | "publish";

const WS_KEY = "active_workspace";
function loadWorkspace(): Workspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WS_KEY);
    return raw ? (JSON.parse(raw) as Workspace) : null;
  } catch {
    return null;
  }
}

interface UIState {
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (w: Workspace | null) => void;

  subTab: string;
  queueFilter: string;
  sidebarCollapsed: Record<string, boolean>;
  studioRoom: StudioRoom;
  editingPost: string | null;
  selectedIds: Set<string>;
  editingChannel: string | null;
  showDetail: string | null;
  imagePickerPostId: string | null;
  expandedFeature: string | null;
  expandedPopular: number | null;
  dismissedOnboarding: boolean;

  setSubTab: (tab: string) => void;
  setQueueFilter: (filter: string) => void;
  toggleSidebar: (key: string) => void;
  setStudioRoom: (room: StudioRoom) => void;
  setEditingPost: (id: string | null) => void;
  toggleSelect: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setEditingChannel: (ch: string | null) => void;
  setShowDetail: (key: string | null) => void;
  setImagePickerPostId: (id: string | null) => void;
  setExpandedFeature: (key: string | null) => void;
  setExpandedPopular: (idx: number | null) => void;
  dismissOnboarding: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeWorkspace: loadWorkspace(),
  subTab: "queue",
  queueFilter: "all",
  sidebarCollapsed: {},
  // 처음 온 사람이 /studio 로 들어오면 생성실이 열려야 한다. 종전 기본값은 발행실이라
  // 아직 만든 것이 하나도 없는 사람에게 "발행할 것을 고르세요" 화면이 먼저 떴다.
  // 사업계획과 네 방 설계 둘 다 "만들기 먼저, 채널 연결은 발행 직전" 으로 확정돼 있다
  // (2026-09-08 코드 감사 F-02).
  studioRoom: "create",
  editingPost: null,
  selectedIds: new Set(),
  editingChannel: null,
  showDetail: null,
  imagePickerPostId: null,
  expandedFeature: null,
  expandedPopular: null,
  dismissedOnboarding: false,

  setActiveWorkspace: (w) => {
    if (typeof window !== "undefined") {
      if (w) localStorage.setItem(WS_KEY, JSON.stringify(w));
      else localStorage.removeItem(WS_KEY);
    }
    set({ activeWorkspace: w });
  },
  setSubTab: (tab) => set({ subTab: tab }),
  setQueueFilter: (filter) => set({ queueFilter: filter }),
  toggleSidebar: (key) =>
    set((s) => ({
      sidebarCollapsed: { ...s.sidebarCollapsed, [key]: !s.sidebarCollapsed[key] },
    })),
  setStudioRoom: (studioRoom) => set({ studioRoom }),
  setEditingPost: (id) => set({ editingPost: id }),
  toggleSelect: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),
  selectAll: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),
  setEditingChannel: (ch) => set({ editingChannel: ch }),
  setShowDetail: (key) => set((s) => ({ showDetail: s.showDetail === key ? null : key })),
  setImagePickerPostId: (id) => set({ imagePickerPostId: id }),
  setExpandedFeature: (key) => set((s) => ({ expandedFeature: s.expandedFeature === key ? null : key })),
  setExpandedPopular: (idx) => set((s) => ({ expandedPopular: s.expandedPopular === idx ? null : idx })),
  dismissOnboarding: () => set({ dismissedOnboarding: true }),
}));
