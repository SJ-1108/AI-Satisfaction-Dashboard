/**
 * 5인 계정 시드 스크립트 (FR-0.2).
 *
 * - 사번 → {사번}@<도메인> 으로 이메일 내부 변환 (UI 비노출).
 * - 초기 비밀번호 = 사번 (앱 전용, 회사 계정과 무관). 최초 로그인 후 변경 강제.
 * - user_metadata 의 emp_no/name/must_change_password 로 0002 트리거가 profiles 자동 생성.
 * - 재실행 안전: 이미 있으면 초기 비번/플래그로 "리셋" (테스트 재현용).
 * - 보안: 실제 비밀번호 값은 콘솔/로그에 출력하지 않는다.
 *
 * 사용법:
 *   1) .env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN(megastudyedu.com) 을 채운다.
 *   2) scripts/accounts.json 을 작성한다 (accounts.example.json 참고, 비번 필드 불필요).
 *   3) node --env-file=.env.local scripts/seed-accounts.mjs
 *
 * service-role 키를 사용하므로 반드시 로컬/서버에서만 실행한다 (NFR-2).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN ?? "megastudyedu.com";

if (!url || !serviceKey) {
  console.error(
    "환경변수 누락: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요",
  );
  process.exit(1);
}

const accounts = JSON.parse(
  readFileSync(new URL("./accounts.json", import.meta.url), "utf8"),
);

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 기존 사용자 email → id 맵 (재실행 시 리셋 판단용)
const existingByEmail = new Map();
{
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      console.error(`기존 사용자 조회 실패: ${error.message}`);
      process.exit(1);
    }
    for (const u of data.users) existingByEmail.set(u.email, u.id);
    if (data.users.length < 200) break;
    page += 1;
  }
}

for (const acc of accounts) {
  const empNo = String(acc.emp_no).trim();
  const email = `${empNo}@${domain}`;
  const password = empNo; // 초기 비밀번호 = 사번 (값은 출력하지 않음)
  const metadata = {
    emp_no: empNo,
    name: acc.name ?? null,
    must_change_password: true,
  };

  const existingId = existingByEmail.get(email);

  if (!existingId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // 내부 변환 이메일 — 확인 메일 발송 안 함
      user_metadata: metadata,
    });
    if (error) {
      console.error(`✗ ${empNo} (${acc.name ?? ""}) 생성 실패: ${error.message}`);
    } else {
      console.log(`✓ ${empNo} (${acc.name ?? ""}) 생성: ${data.user?.id}`);
    }
    continue;
  }

  // 이미 존재 → 초기 비번/메타데이터로 리셋 + profiles 플래그 복구 (재테스트용)
  const { error: updErr } = await supabase.auth.admin.updateUserById(existingId, {
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (updErr) {
    console.error(`✗ ${empNo} (${acc.name ?? ""}) 리셋 실패: ${updErr.message}`);
    continue;
  }

  // 트리거는 INSERT 시에만 동작하므로, 기존 행은 직접 갱신 (service-role → RLS 우회)
  const { error: profErr } = await supabase
    .from("profiles")
    .update({ emp_no: empNo, name: acc.name ?? null, must_change_password: true })
    .eq("id", existingId);
  if (profErr) {
    console.error(`! ${empNo} profiles 갱신 경고: ${profErr.message}`);
  }
  console.log(`↻ ${empNo} (${acc.name ?? ""}) 리셋: ${existingId}`);
}

console.log("완료. (초기 비밀번호 = 사번 / 최초 로그인 후 변경 필요)");
