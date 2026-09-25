// entry.tsx가 번들하는 CardDeckPanel이 "@/lib/auth"의 authHeaders를 쓴다(사진 업로드
// 등). 이 하네스는 인증·업로드를 실제로 쓰지 않으므로 빈 헤더만 돌려준다.
export function authHeaders(): Record<string, string> {
  return {};
}
