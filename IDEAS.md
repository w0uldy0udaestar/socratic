# IDEAS.md — 아이디어 백로그

> 계획(PLAN.md) 밖의 아이디어는 여기에 기록하고 본 계획으로 복귀한다. 계획을 바꿀 가치가 있으면 사용자 승인 후 PLAN.md 갱신.

- **세션 간 개인화**: 사용자의 과거 답변 패턴을 학습해 자주 같은 답을 하는 축은 질문 대신 가정으로 (근거: arXiv:2607.26611 "Fewer Clarifications, Better Code" — 개인화된 모호성 적응)
- **평가 하네스**: RegretBench 프레임(정확도+효율+질문 근거성+regret) 차용한 자체 벤치마크 — 프로토콜 버전 간 A/B
- **선택지 개수 A/B**: 2 vs 3 vs 5 (문헌에 답 없음, 자체 실측 필요)
- **MCP 상태 서버**: 다중 에이전트 지원 시 세션 상태·명세를 MCP 리소스로 공유 (v0.4 이후 검토)
- **Cursor CLI 부분 지원**: L0(지침)+L2(게이트)만이라도 (주입 불가 구조 한계)
- **EARS 표기법 옵션**: 명세를 정형 문법으로 출력하는 모드 (강제 금지, 옵션만)
- **내부 식별자 socratic 리네임** (2026-08-04 리브랜딩 후속): `~/.mind-reader/` → `~/.socratic/`, `MIND_READER_OFF` → `SOCRATIC_OFF`, `.mind-reader-off` → `.socratic-off`, 설치 마커 `_mindReader`, 게이트 메시지 "mind-reader gate". 코드·테스트·설치 스크립트 연쇄 수정이라 별도 작업 단위로. 기존 식별자 하위호환(둘 다 인식) 여부도 결정 필요
