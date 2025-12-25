# BTC 시세 MVP 모노레포

## 문제 정의
- 간단한 포트폴리오 프로젝트로, 외부 시세 API를 안정적으로 호출해 BTC 현재가를 제공한다.
- 사용자에게는 최신 가격을 보여주되, 외부 API 장애 시에도 서비스가 완전히 실패하지 않도록 한다.
- 구현과 운영 복잡도는 최소화하고, 확장 가능한 구조만 남긴다.

## MVP 범위
- Fastify 기반 API에서 `GET /api/btc` 제공
- 외부 시세 API(CoinGecko) 호출
- 5초 인메모리 캐시
- 외부 API 실패 시 이전 캐시 값 반환
- Next.js(App Router)에서 5초 폴링으로 현재가 표시

## 엔드포인트 / 샘플 응답

### GET /api/btc

응답 예시:

```json
{
  "symbol": "BTC",
  "currency": "USD",
  "price": 64250.12,
  "source": "coingecko",
  "cached": false,
  "stale": false,
  "fetchedAt": "2024-06-01T12:00:00.000Z"
}
```

## 아키텍처
- monorepo(pnpm workspace)
  - `apps/api`: Fastify API 서버
  - `apps/web`: Next.js 프론트
  - `packages/shared`: 공통 타입 정의
- 데이터 흐름
  - `web`이 `/api/btc`를 5초마다 호출
  - `api`가 외부 시세 API를 조회하고 캐시 갱신
  - 실패 시 캐시된 마지막 값을 반환

## 기술 선택 이유
- Node.js + TypeScript
  - 빠른 프로토타이핑과 타입 안정성의 균형
  - 백엔드와 프론트에서 타입을 공유 가능
- Fastify
  - 가벼운 런타임, 단순한 라우팅 구성
- Next.js(App Router)
  - 최소한의 구성으로 React 기반 UI 제공
  - 추후 확장(SEO, SSR) 여지를 확보
- pnpm workspace
  - 앱/패키지 분리로 구조를 명확히 하고 공통 타입을 공유

## 트레이드오프
- 인메모리 캐시 사용
  - 장점: 구현 단순, 지연 최소
  - 단점: 인스턴스 스케일아웃 시 캐시 불일치
- 클라이언트 폴링
  - 장점: 구현 단순, 서버 의존 최소
  - 단점: 불필요한 요청 발생, 실시간성 제한
- 엄격한 스키마 검증 생략
  - 장점: 코드량 감소, 개발 속도
  - 단점: 외부 API 스키마 변경에 취약

## 개선 아이디어
- 서버 캐시를 Redis로 분리해 멀티 인스턴스 대응
- 업스트림 호출에 타임아웃/재시도 정책 추가
- 응답 스키마 검증(zod) 도입으로 안정성 강화
- 클라이언트는 SWR/React Query 등으로 캐시 최적화
- API base URL 분리 및 프록시 설정으로 로컬/프로덕션 환경 일치
