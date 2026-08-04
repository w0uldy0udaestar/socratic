/**
 * 경량 필터 (D7): LLM 호출 없이 밀리초 단위로 "프로토콜 주입이 필요 없는 입력"을 거른다.
 * 모호함 판정 자체는 주입된 프로토콜(발산 측정)이 메인 모델에서 수행한다.
 */

/** macOS 등에서 들어오는 분해형(NFD) 한글 대응 */
export function norm(s: string): string {
  return s.normalize("NFC").trim();
}

const GREETING_OR_ACK =
  /^(안녕|하이|hi|hello|고마워|감사합니다|감사|땡큐|thanks|thank you|thx|ㅇㅋ|okay|ok|응|웅|넵|네|예|아니|아니오|좋아|그래|맞아|훌륭|잘했어|굿|good|nice|계속|continue|고|stop|그만)[.!~\s]*$/i;

/** 승인 어휘는 좁게 — 프로토콜이 "'승인'이라고 답해주세요"로 지정한다 (C3) */
const APPROVAL = /^(승인|승인합니다|승인할게|approve|approved|lgtm)[.!~\s]*$/i;

/** 승인 문장에 섞이면 승인이 아닌 것으로 확정하는 부정 신호 (C2) */
const NEGATION = /(안|못|말고|아직|전에|거부|아니|취소|보류|잠깐|기다|수정|다시|바꿔|말아|하지)/;

/** 승인인가 — 전체 일치 + 부정 가드 */
export function isApproval(prompt: string): boolean {
  const p = norm(prompt);
  if (NEGATION.test(p)) return false;
  return APPROVAL.test(p);
}

/**
 * AskUserQuestion 선택 답변이 승인인가 (M3 선택창 승인 채널).
 * 후행 괄호 장식("승인 (권장)" 등)만 걷어내고 전체 일치를 요구한다 — 라벨 *안에*
 * '승인'이 포함된 다른 옵션("비가역만 항상 승인")이 승인으로 오인되면 안 된다.
 */
export function isAskApproval(answer: string): boolean {
  const raw = norm(answer);
  // 부정 가드는 괄호를 걷어내기 전 원문에 적용한다 — 직접 입력 "승인 (수정 후에)" 같은
  // 조건부 답변이 무조건 승인으로 처리되면 안 된다. 채팅 채널(isApproval)과 판정을 맞춘다.
  if (NEGATION.test(raw)) return false;
  const a = raw.replace(/\s*[(（][^)）]*[)）]\s*$/, "").trim();
  return APPROVAL.test(a);
}

/** 의문형은 요청이 아니라 질의 — 요청 동사가 섞여 있어도 질의가 우선한다 (J6) */
const QUESTION_MARK = /[?？]\s*$/;
const QUESTION_WORD =
  /(왜|뭐야|뭔가요|뭐임|어디|어떻게|언제|누가|무엇|어떤가|인가요|맞나|나요|\b(what|why|how|where|when|who|which|is|are|does|do|did|can|could|should|would)\b)/i;
/** 물음표로 끝나면서 의문사가 있으면 확실한 질의 */
const CLEAR_QUESTION = (p: string) => QUESTION_MARK.test(p) && QUESTION_WORD.test(p);
/** 그 밖의 약한 의문 신호 */
const INTERROGATIVE = /[?？]|(왜|어디|어떻게|언제|누가|무엇|인가요|나요)/;

/** 요청 동사 힌트: 한국어는 짧아도 실질 요청일 수 있다 ("정리해줘" 5자) */
const REQUEST_HINT =
  /(해\s?줘|해\s?주|해봐|해라|하자|만들|고쳐|고치|바꿔|바꾸|수정|정리|추가|삭제|제거|작성|생성|구현|리팩|배포|실행|설치|분석|조사|알아봐|찾아|검토|리뷰|옮겨|합쳐|나눠|써\s?줘|짜\s?줘|\bfix\b|\bbuild\b|\bcreate\b|\bmake\b|\badd\b|\bremove\b|\bdelete\b|\bwrite\b|\bimplement\b|\bdeploy\b|\brefactor\b|\bclean\s?up\b)/i;

/** 프로토콜 주입 없이 통과시켜야 하는 입력인가 */
export function isPassthrough(prompt: string): boolean {
  const p = norm(prompt);
  if (p.length === 0) return true;
  if (p.startsWith("/") || p.startsWith("#") || p.startsWith("!")) return true;
  if (GREETING_OR_ACK.test(p)) return true;
  if (CLEAR_QUESTION(p)) return true; // 의문사 + 물음표 → 질의
  if (INTERROGATIVE.test(p) && !REQUEST_HINT.test(p)) return true; // 약한 질의
  if (REQUEST_HINT.test(p)) return false;
  if (p.length < 12) return true;
  return false;
}

/** approved 상태에서 새 사이클을 열어야 하는 입력인가 — 짧은 후속 지시도 포함 (J1) */
export function startsNewCycle(prompt: string): boolean {
  const p = norm(prompt);
  if (p.length === 0) return false;
  if (p.startsWith("/") || p.startsWith("#") || p.startsWith("!")) return false;
  if (GREETING_OR_ACK.test(p)) return false;
  if (INTERROGATIVE.test(p) && !REQUEST_HINT.test(p)) return false;
  return true; // 승인 후에는 보수적으로: 실질 발화면 새 사이클
}
