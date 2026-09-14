import type { StudioRoom } from "@/store/ui-store";

const STUDIO_ROOMS = new Set<StudioRoom>(["create", "edit", "publish"]);

/**
 * 성과실은 이 화면의 방이 아니라 별도 주소(/performance)다. 그런데 `?room=metrics`
 * 처럼 없는 방을 넣으면 종전에는 아무 말 없이 마지막 방(대개 발행실)을 그렸다. 아무 일도
 * 안 일어나는 것보다 나쁘다 — 틀린 화면이 정상인 것처럼 보인다(ADR-007 조용한 실패 금지).
 * 알려진 별칭은 제 주소로 보내고, 모르는 값은 그 사실을 부르는 쪽에 알린다.
 */
const ROOM_ALIASES: Record<string, string> = {
  metrics: "/performance",
  performance: "/performance",
  "성과실": "/performance",
};

export interface RoomResolution {
  room: StudioRoom;
  /** 다른 주소로 보내야 하면 그 경로. 없으면 null. */
  redirectTo: string | null;
  /** 요청한 방 이름이 이 화면에 없을 때 그 원문. 화면이 이유를 말하는 데 쓴다. */
  unknownRoom: string | null;
}

export function resolveStudioRoom(search: string, fallback: StudioRoom): RoomResolution {
  const requested = new URLSearchParams(search).get("room");
  if (!requested) return { room: fallback, redirectTo: null, unknownRoom: null };
  if (STUDIO_ROOMS.has(requested as StudioRoom)) {
    return { room: requested as StudioRoom, redirectTo: null, unknownRoom: null };
  }
  const alias = ROOM_ALIASES[requested];
  if (alias) return { room: fallback, redirectTo: alias, unknownRoom: null };
  return { room: fallback, redirectTo: null, unknownRoom: requested };
}

export function resolveStudioRoomFromSearch(search: string, fallback: StudioRoom): StudioRoom {
  return resolveStudioRoom(search, fallback).room;
}

export function shouldLoadPublishResources(room: StudioRoom): boolean {
  return room === "publish";
}
