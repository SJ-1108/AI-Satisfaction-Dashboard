/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // 대용량 업로드 대비: 파싱된 행 배열이 기본 1MB 제한을 넘으면 업로드가 실패한다.
      // 수동 업로드는 서버 액션 단일 페이로드로 전송되므로 한도를 넉넉히 상향.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
