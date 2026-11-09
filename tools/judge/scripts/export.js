// 판정 결과 JSON → 업로드용 XLSX. 스키마 검증 후 원본 파일 행에 판정 컬럼을 붙인다.
// 사용법: node scripts/export.js <판정결과.json> <입력_YYMMDD.json 또는 원본 파일> [--out 파일]
//   - 업로드 원본 모드: 원본 전체 행 + 판정 컬럼(원인 분류·유관 부서·처리 상태·피드백 내용·메모·단계·확신도) → 그대로 대시보드에 업로드
//   - 대시보드 내보내기 모드: 판정된 행만, 내보내기 열 이름으로 채움(참고용)
const fs = require('fs'), path = require('path');
const XLSX = require('xlsx'); // 레포 루트 node_modules (npm install 후 사용)
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const [resFile, srcArg] = args.filter(a => !a.startsWith('--'));
if (!resFile || !srcArg) { console.error('사용법: node scripts/export.js <판정결과.json> <입력.json|원본파일> [--out 파일]'); process.exit(1); }
const outIdx = args.indexOf('--out');

// 입력 메타(모드·원본 경로): 입력_YYMMDD.json 이면 거기서, 아니면 원본 파일로 간주
let mode = null, srcFile = srcArg;
if (srcArg.endsWith('.json')) { const meta = JSON.parse(fs.readFileSync(srcArg, 'utf8')); mode = meta.mode; srcFile = meta.source; }

const CAUSES = ['학습과 무관한 질의', '질의어 의도 판단 불가', '답변/서비스 범위 벗어남', '데이터 없음', '데이터 부족·보완', '질의 의도 불일치', 'AI 개발 이슈', '사실 오류', '기능 개선', '기타'];
const STATUS = ['처리 불가', '검토중', '보류', '처리완료', '미확인'];
const TIERS = ['1단', '2단'];
const deptDoc = fs.readFileSync(path.join(root, 'docs/유관부서_배정기준_v1.0_261109.md'), 'utf8');

// ── 검증 ──
const results = JSON.parse(fs.readFileSync(resFile, 'utf8'));
const errors = [], seen = new Set();
for (const r of results) {
  const tag = `No.${r.no}`;
  if (seen.has(String(r.no))) errors.push(`${tag} 중복`);
  seen.add(String(r.no));
  if (!CAUSES.includes(r.cause_category)) errors.push(`${tag} 원인 분류 값 오류: ${r.cause_category}`);
  if (!STATUS.includes(r.status)) errors.push(`${tag} 처리 상태 값 오류: ${r.status}`);
  if (!TIERS.includes(r.tier)) errors.push(`${tag} 단계 값 오류: ${r.tier}`);
  if (!Array.isArray(r.related_departments)) errors.push(`${tag} 유관 부서는 배열이어야 함`);
  else for (const d of r.related_departments) if (d && !deptDoc.includes(d)) errors.push(`${tag} 배정기준에 없는 부서명: ${d}`);
  if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1) errors.push(`${tag} 확신도는 0~1 숫자여야 함`);
  if (!r.action || !r.action.trim()) errors.push(`${tag} 피드백 내용 비어 있음`);
  else if (/(니다|어요|아요|해요|예요|에요)\.?\s*$/.test(r.action.trim())) errors.push(`${tag} 피드백 내용 종결 어미 확인(~함/~됨/~임): "${r.action.trim().slice(-20)}"`);
  if (r.tier === '1단' && Array.isArray(r.related_departments) && r.related_departments.length) errors.push(`${tag} 1단인데 유관 부서 지정됨 → 2단으로 변경 필요`);
}
if (errors.length) { console.error('검증 실패:\n' + errors.map(e => ' - ' + e).join('\n')); process.exit(2); }

// ── 원본 읽기 ──
const wb = XLSX.readFile(srcFile);
const srcRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
const headers = srcRows.length ? Object.keys(srcRows[0]) : [];
const norm = h => String(h ?? '').toLowerCase().replace(/[\s_-]+/g, '').trim();
if (!mode) mode = headers.some(h => norm(h) === norm('No. (record_no)')) ? 'dashboard' : 'upload';
const byNo = new Map(results.map(r => [String(r.no), r]));
const memoOf = r => (r.tier_reason || '') + (r.alternatives && r.alternatives.length ? ` (대안 분류: ${r.alternatives.join(', ')})` : '');
const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');

let upload = [], outFile, matched = 0;
if (mode === 'upload') {
  // 원본 전체 행을 그대로 두고(업로드 중복 판단 키 보존) 판정 컬럼만 덧붙인다. no = 데이터 행 번호(1부터)
  upload = srcRows.map((row, i) => {
    const r = byNo.get(String(i + 1));
    if (r) matched++;
    return {
      ...row,
      '원인 분류': r ? r.cause_category : '',
      '유관 부서': r ? r.related_departments.join(', ') : '',
      '처리 상태': r ? r.status : '',
      '피드백 내용': r ? r.action : '',
      '메모': r ? memoOf(r) : '',
      '단계': r ? r.tier : '',
      '확신도': r ? r.confidence : '',
    };
  });
  const base = path.basename(srcFile).replace(/\.(xlsx|xls|csv)$/i, '');
  outFile = outIdx >= 0 ? args[outIdx + 1] : path.join(root, 'output', `${base}_판정.xlsx`);
} else {
  const H = { no: 'No. (record_no)', cause: '원인 분류 (cause_category)', dept: '유관 부서 (related_department)', act: '피드백 내용 (action)', st: '처리 상태 (status)', by: '담당자명 (updated_by)', upd: '수정일시 (updated_at)' };
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  for (const row of srcRows) {
    const r = byNo.get(String(row[H.no]));
    if (!r) continue;
    matched++;
    upload.push({ ...row, [H.cause]: r.cause_category, [H.dept]: r.related_departments.join(', '), [H.act]: r.action, [H.st]: r.status, [H.by]: r.tier === '1단' ? '자동판정' : '자동판정(확인필요)', [H.upd]: now, '단계': r.tier, '확신도': r.confidence, '메모': memoOf(r) });
  }
  outFile = outIdx >= 0 ? args[outIdx + 1] : path.join(root, 'output', `판정_${stamp}.xlsx`);
}
if (matched !== results.length) console.warn(`주의: 판정 ${results.length}건 중 원본과 연결된 건 ${matched}건`);

const qOf = r => r.q || '';
const review = results.filter(r => r.tier === '2단').map(r => ({ 'No.': r.no, '질의어': qOf(r), '원인 분류 초안': r.cause_category, '유관 부서 초안': r.related_departments.join(', '), '처리 상태 초안': r.status, '피드백 내용 초안': r.action, '확신도': r.confidence, '확인 포인트': r.tier_reason || '', '대안 분류': (r.alternatives || []).join(', '), '의도 해석': r.intent || '' }));
const auto = results.filter(r => r.tier === '1단').map(r => ({ 'No.': r.no, '질의어': qOf(r), '원인 분류': r.cause_category, '처리 상태': r.status, '피드백 내용': r.action, '확신도': r.confidence, '근거': r.tier_reason || '' }));

const out = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(upload), '업로드');
XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(review.length ? review : [{ 안내: '2단 건 없음' }]), '확인필요(2단)');
XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(auto.length ? auto : [{ 안내: '1단 건 없음' }]), '자동확정(1단)');
XLSX.writeFile(out, outFile);
console.log(`검증 통과 ${results.length}건 (1단 ${auto.length}, 2단 ${review.length}) · 모드 ${mode === 'upload' ? '업로드 원본(첫 시트를 그대로 대시보드에 업로드)' : '대시보드 내보내기'} → ${outFile}`);
