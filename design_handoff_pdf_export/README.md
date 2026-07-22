# Handoff: 대시보드 PDF 내보내기 (PDF Export)

## Overview
AI 답변 만족도 평가 대시보드에서 "PDF 내보내기" 버튼을 눌러 대시보드 전체(핵심 지표, 기간별 만족도 평가 조회 패널, 차트 4종, 처리 현황 표)를 보고용 PDF로 저장하는 기능입니다. 브라우저의 인쇄(print-to-PDF) 파이프라인을 사용하며, 별도의 서버나 PDF 라이브러리가 필요 없습니다.

## About the Design Files
이 번들의 파일은 **HTML로 제작된 디자인 레퍼런스**입니다 — 의도된 모양과 동작을 보여주는 프로토타입이며, 그대로 복사할 프로덕션 코드가 아닙니다. 대상 코드베이스의 기존 환경(React, Vue 등)과 관행에 맞게 **이 디자인을 재구현**하는 것이 과제입니다. 환경이 아직 없다면 프로젝트에 가장 적합한 프레임워크를 선택해 구현하세요.

## Fidelity
**High-fidelity (hifi)**: 색상·타이포그래피·간격·동작이 확정된 상태입니다. 아래 명세대로 재현하세요.

## Feature Scope (이 핸드오프의 범위)
PDF 내보내기 기능만 포함합니다. 대시보드 자체의 구현은 범위 밖이며, 레퍼런스 파일(`대시보드.dc.html`)은 버튼 위치·인쇄 스타일 확인용입니다.

## UI: PDF 내보내기 버튼
- **위치**: 대시보드 화면 헤더 우측 상단. 헤더는 `display:flex; align-items:center; justify-content:space-between`으로 좌측에 페이지 타이틀(`대시보드`, 22px/700), 우측에 이 버튼.
- **구성**: 다운로드 아이콘(15×15 SVG, stroke `#5a616e`, stroke-width 2) + 라벨 `PDF 내보내기`
- **스타일**:
  - 높이 40px, 좌우 패딩 16px, 아이콘-라벨 간격 8px
  - 폰트: Pretendard 13px / 600
  - 색: 글자 `#5a616e`, 배경 `#fff`, 테두리 `1px solid #e2e5ea`, radius 10px
- **동작**: 클릭 시 `window.print()` 호출

## Print Stylesheet (핵심 명세)
```css
@media print {
  aside { display: none !important; }    /* 사이드바(LNB) 숨김 */
  button { display: none !important; }   /* 버튼류 전부 숨김 */
  main { padding: 0 !important; zoom: 0.55; }  /* 1280px 콘텐츠를 A4 폭에 맞게 축소 */
  main > div { margin-left: auto !important; margin-right: auto !important; } /* 가로 중앙 정렬 */
  body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } /* 패널/차트 색 보존 */
  div[style*="border-radius: 14px"], div[style*="border-radius: 16px"] { break-inside: avoid; } /* 카드가 페이지 경계에서 잘리지 않게 */
  table { break-inside: avoid; }
}
@page { size: A4 portrait; margin: 0; } /* 여백 0, 콘텐츠는 auto margin으로 중앙 정렬 */
```
- `zoom: 0.55`는 콘텐츠 폭 1280px 기준입니다. 대상 앱의 콘텐츠 폭이 다르면 `A4 인쇄 가능폭(≈794px) ÷ 콘텐츠 폭`으로 재계산하세요.
- 카드 선택자(`div[style*=...]`)는 프로토타입의 인라인 스타일 기준입니다. 실제 구현에서는 카드 컴포넌트 클래스에 `break-inside: avoid`를 직접 지정하세요.

## Chart Resolution (화질 필수 사항)
캔버스 차트(Chart.js)는 화면 해상도로 래스터되므로 인쇄 시 흐려집니다. 반드시 렌더링 해상도를 올리세요:
```js
Chart.defaults.devicePixelRatio = Math.max(3, window.devicePixelRatio || 1);
```
- 다른 차트 라이브러리 사용 시 동등한 고해상도 옵션(예: ECharts `devicePixelRatio`)을 적용하세요.
- SVG 렌더러를 지원하는 라이브러리라면 SVG 렌더링이 인쇄 품질에 가장 좋습니다.

## Interactions & Behavior
- 버튼 클릭 → `window.print()` → 사용자가 브라우저 인쇄 대화상자에서 "PDF로 저장" 선택
- 인쇄 화면에는 사이드바·모든 버튼이 제외되고 대시보드 콘텐츠만 A4 세로 기준 중앙 정렬로 출력
- 로딩/에러 상태 없음 (동기 호출)
- 주의: SPA에서 대시보드 외 다른 화면이 같은 DOM에 있으면 인쇄 시 함께 출력되지 않도록 현재 화면만 보이는 상태에서 print를 호출하거나, 인쇄용 클래스로 스코프를 제한하세요.

## Design Tokens
- 텍스트 기본: `#1a1d23`, 보조 `#5a616e`, 뮤트 `#8a909c`
- 테두리: `#e2e5ea`, 카드 테두리 `#eceef1`
- 카드: 배경 `#fff`, radius 14px, shadow `0 1px 2px rgba(16,24,40,.03)`
- 패널: 배경 `#f7f5f1`, 테두리 `#ece7de`, radius 16px
- 브랜드 블루: `#2f6bff` / 딥 블루(데이터): `#2450c8` / 불만족 레드: `#e8635d`
- 폰트: Pretendard (CDN: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css`)

## Assets
- 다운로드 아이콘: 인라인 SVG (별도 에셋 없음)

## Files
- `대시보드.dc.html` — 대시보드 프로토타입 전체. 참고 위치:
  - PDF 내보내기 버튼: 대시보드 헤더 (`exportPdf` 핸들러, `window.print()`)
  - 인쇄 CSS: 문서 상단 `<style>` 블록의 `@media print` / `@page` 규칙
  - 차트 해상도: 로직 `buildCharts()` 내 `Chart.defaults.devicePixelRatio`
