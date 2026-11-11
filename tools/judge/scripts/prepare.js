// 판정 입력 준비: 업로드 원본(Metabase 내보내기) 또는 대시보드 불만족 내보내기 → 판정 대상 JSON + 시스템 프롬프트 조립본
// 사용법: node scripts/prepare.js <파일.xlsx|csv> [--all] [--nos 12,15]
//   - 업로드 원본(query/summary_text/rating/… 헤더): rating=down 행 전부가 대상. no = 데이터 행 번호(헤더 제외 1부터)
//   - 대시보드 내보내기(No. (record_no) 헤더): 피드백이 비어 있는 미처리 건이 대상. no = record_no
const fs = require('fs'), path = require('path');
const XLSX = require('xlsx'); // 레포 루트 node_modules (npm install 후 사용)
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('사용법: node scripts/prepare.js <파일.xlsx|csv> [--all] [--nos 1,2]'); process.exit(1); }
const all = args.includes('--all');
const nosIdx = args.indexOf('--nos');
const nos = nosIdx >= 0 ? new Set(args[nosIdx + 1].split(',').map(Number)) : null;

// ── 대시보드와 동일한 헤더 정규화·별칭 (lib/ingest/parse-satisfaction.ts) ──
const norm = h => String(h ?? '').toLowerCase().replace(/[\s_-]+/g, '').trim();
const ALIASES = {
  query: ['query', '검색어', '질의', '질의어'],
  summary_text: ['summary text', 'summary', '요약', 'ai 요약', '응답', 'ai 답변', '답변'],
  rating: ['rating', '평가', '평가값'],
  reason: ['reason', 'reason label', '사유', '사유 코드', '평가 사유'],
  comment: ['comment', '의견', '코멘트'],
  device_type: ['device type', '기기', '기기 종류'],
  guardrail_label: ['guardrail label', '가드레일'],
  created_at: ['created at', 'feedback created at', '평가 시각', '평가 일시', '생성 시각', '일시', '날짜'],
};
const REASON_LABELS = { intent_mismatch: '질문 의도와 다른 정보를 답변함', not_factual: '사실이 아닌 정보임', insufficient: '필요한 정보가 부족함', outdated: '최신 정보가 아님', inappropriate: '부적절하거나 불쾌한 표현임', other: '기타' };

// ── 대시보드와 동일한 텍스트 정제 (lib/ingest/clean-text.ts 이식) ──
const NAMED = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '-', mdash: '-' };
function decodeEntities(s) {
  return s.replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return ''; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } })
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n) => (n.toLowerCase() in NAMED ? NAMED[n.toLowerCase()] : m));
}
function cleanText(input, plusAsSpace = 'auto') {
  if (input == null) return '';
  let s = String(input).replace(/\r\n?/g, '\n');
  if (plusAsSpace === true || (plusAsSpace === 'auto' && !s.includes(' ') && s.includes('+'))) s = s.replace(/\+/g, ' ');
  s = decodeEntities(s).replace(/''/g, "'").replace(/""/g, '"');
  s = s.replace(/<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/?>/g, ' ').replace(/\{\{[^}]*\}\}/g, ' ').replace(/\[\s*\d+(?:\s*[-,]\s*\d+)*\s*\]/g, ' ');
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!>~|"'])/g, '$1').replace(/^[ \t]*#{1,6}[ \t]+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^([ \t]*)\*[ \t]+/gm, '$1- ');
  return s.split('\n').map(l => l.replace(/[ \t\u00a0]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function excelSerialToKst(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000) - 9 * 3600 * 1000);
    return isNaN(d) ? String(v) : d.toISOString().replace('T', ' ').slice(0, 19);
  }
  return String(v ?? '').trim();
}

// ── 입력 읽기 ──
const wb = XLSX.readFile(file);
const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
const headers = raw.length ? Object.keys(raw[0]) : [];
const isDashboardExport = headers.some(h => norm(h) === norm('No. (record_no)'));
let rows, total = raw.length, mode;

if (isDashboardExport) {
  mode = 'dashboard';
  const K = { no: 'No. (record_no)', dt: '평가일시 (created_at)', q: '질의어 (query)', a: 'AI 답변 (summary_text)', reason: '평가 사유 (reason)', cmt: '의견 (comment)', dev: '기기 종류 (device_type)', gr: '가드레일 (guardrail_label)', cause: '원인 분류 (cause_category)', dept: '유관 부서 (related_department)', act: '피드백 내용 (action)', st: '처리 상태 (status)' };
  rows = raw.map(r => Object.fromEntries(Object.entries(K).map(([k, h]) => [k, String(r[h] ?? '').trim()])));
  if (nos) rows = rows.filter(r => nos.has(Number(r.no)));
  else if (!all) rows = rows.filter(r => !r.act && !r.cause && (!r.st || r.st === '미확인'));
} else {
  mode = 'upload';
  const map = {};
  for (const h of headers) { for (const [k, al] of Object.entries(ALIASES)) if (map[k] == null && al.some(a => norm(a) === norm(h))) map[k] = h; }
  const missing = ['query', 'summary_text', 'rating', 'created_at'].filter(k => !map[k]);
  if (missing.length) { console.error(`필수 컬럼 누락: ${missing.join(', ')} (헤더: ${headers.join(' | ')})`); process.exit(1); }
  const get = (r, k) => (map[k] ? r[map[k]] : '');
  rows = raw.map((r, i) => {
    const rating = String(get(r, 'rating')).trim().toLowerCase();
    const reasonRaw = String(get(r, 'reason')).trim();
    return {
      no: i + 1, rating,
      dt: excelSerialToKst(get(r, 'created_at')),
      q: cleanText(get(r, 'query')), a: cleanText(get(r, 'summary_text'), true),
      reason: REASON_LABELS[reasonRaw] || reasonRaw, cmt: cleanText(get(r, 'comment')),
      dev: String(get(r, 'device_type')).trim(), gr: String(get(r, 'guardrail_label')).trim(),
    };
  }).filter(r => ['down', '👎', 'bad', '0', 'false', '불만족'].includes(r.rating));
  if (nos) rows = rows.filter(r => nos.has(Number(r.no)));
}

const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
const outDir = path.join(root, 'output'); fs.mkdirSync(outDir, { recursive: true });
const inputFile = path.join(outDir, `입력_${stamp}.json`);
fs.writeFileSync(inputFile, JSON.stringify({ mode, source: path.resolve(file), records: rows.map(({ no, dt, q, a, reason, cmt, dev, gr }) => ({ no, dt, q, a, reason, cmt, dev, gr })) }, null, 1));

const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const system = rd('prompts/불만족_피드백_판정_프롬프트_v1.2.md')
  .replace('{{참조데이터범위}}', rd('docs/참조데이터범위_v1.0_261109.md'))
  .replace('{{유관부서배정기준}}', rd('docs/유관부서_배정기준_v1.0_261109.md'))
  .replace('{{대표라벨규칙표}}', rd('docs/대표라벨_규칙표_v1.0_261109.md'))
  .replace('{{사례}}', rd('prompts/사례_자동생성.md'));
const promptFile = path.join(outDir, '시스템프롬프트_조립본.md');
fs.writeFileSync(promptFile, system);

const VERSION = fs.existsSync(path.join(root, 'VERSION')) ? fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim() : '-';
console.log(`판정기 버전: ${VERSION}`);
console.log(`입력 형식: ${mode === 'upload' ? '업로드 원본(불만족 행만 대상)' : '대시보드 내보내기(미처리 건만 대상)'}`);
console.log(`원본 ${total}행 중 판정 대상 ${rows.length}건`);
console.log(`입력 파일: ${inputFile}`);
console.log(`시스템 프롬프트: ${promptFile} (${system.length.toLocaleString()}자)`);
console.log(`대상 No.: ${rows.map(r => r.no).join(', ') || '-'}`);
