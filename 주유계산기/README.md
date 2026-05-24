# 수도전 주유 시간 계산기

화이트아웃 서바이벌 수도전 방어용 주유/출발 시간 계산기입니다.

## 기능

- 관리자가 멤버 이름과 행군시간을 저장합니다.
- 관리자가 공통 집결을 올리면 접속 중인 화면에 자동 반영됩니다.
- 수비 인원은 자기 닉네임을 선택해서 집결별 출발 시간을 크게 봅니다.
- 개인 임시 집결은 각자 브라우저에만 저장됩니다.
- 출발 임박 시 소리 알림을 켤 수 있습니다.
- 화면의 현재 시각, 상대 도착 시각, 출발 시각은 UTC 기준으로 표시됩니다.

## Supabase 설정

1. Supabase 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase.sql` 내용을 실행합니다.
3. Project Settings에서 `Project URL`과 `service_role` 키를 확인합니다.

## Vercel 환경 변수

Vercel 프로젝트에 아래 환경 변수를 추가합니다.

```text
SUPABASE_URL=Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role key
ADMIN_PASSWORD=관리자 비밀번호
```

`SUPABASE_SERVICE_ROLE_KEY`는 서버 API에서만 사용되며, 화면 코드에는 노출되지 않습니다.

## 배포

이 폴더를 Vercel 프로젝트로 연결해 배포하면 됩니다.

로컬에서 확인하려면 Vercel CLI가 필요합니다.

```text
npm run start
```

## 시간 입력

아래 형식을 지원합니다.

```text
5:00
1:30
01:02:03
90
```

숫자만 입력하면 초 단위로 계산합니다.

집결 남은시간과 행군시간은 시간대와 상관없는 남은 시간이고, 결과로 표시되는 시각은 UTC 기준입니다.
