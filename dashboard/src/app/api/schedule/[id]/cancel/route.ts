import { DELETE as cancelById } from "@/app/api/schedule/[id]/route";

// POST /api/schedule/:id/cancel, 예약 발행 중지의 별칭 경로.
// 정본 로직은 DELETE /api/schedule/{id}에 있으며, 이 경로는 같은 계약을 호출만 한다.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return cancelById(request, { params: Promise.resolve({ id }) });
}
