import { redirect } from "next/navigation";

/** 루트 진입 시 대시보드로 보낸다. 미인증이면 middleware가 /login 으로 돌린다. */
export default function Home() {
  redirect("/dashboard");
}
