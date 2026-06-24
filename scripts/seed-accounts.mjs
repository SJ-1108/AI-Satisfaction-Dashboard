/**
 * 5인 계정 시드 스크립트 (FR-0.2).
 *
 * 사번 + 비밀번호로 Supabase Auth 사용자를 생성한다.
 * - 이메일은 사번 → {사번}@<도메인> 으로 내부 변환 (UI 비노출).
 * - user_metadata 의 emp_no/name 으로 0001_init.sql 의 트리거가 profiles 를 자동 생성.
 *
 * 사용법:
 *   1) .env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN 을 채운다.
 *   2) scripts/accounts.json 을 작성한다 (accounts.example.json 참고).
 *   3) node --env-file=.env.local scripts/seed-accounts.mjs
 *
 * service-role 키를 사용하므로 반드시 로컬/서버에서만 실행한다 (NFR-2).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN ?? "internal.local";

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

for (const acc of accounts) {
  const email = `${String(acc.emp_no).trim()}@${domain}`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: acc.password,
    email_confirm: true, // 내부 이메일이므로 확인 절차 생략
    user_metadata: { emp_no: String(acc.emp_no), name: acc.name ?? null },
  });

  if (error) {
    console.error(`✗ ${acc.emp_no} (${acc.name ?? ""}) 실패: ${error.message}`);
  } else {
    console.log(`✓ ${acc.emp_no} (${acc.name ?? ""}) 생성: ${data.user?.id}`);
  }
}

console.log("완료.");
