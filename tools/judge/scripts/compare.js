// 자동 판정 결과와 사람 기록 비교: node scripts/compare.js <results.json> <answers.json>
const fs=require('fs');
const res=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const ans=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const A=Object.fromEntries(ans.map(a=>[a.no,a]));
const norm=d=>(d||'').split(',').map(s=>s.trim()).filter(Boolean).sort().join(', ');
let n=0,cause=0,st=0,dept=0,t1=0,t1cause=0,t1st=0;const rows=[];const confusion={};
for(const r of res){const a=A[r.no];if(!a)continue;n++;
 const c=r.cause_category===a.cause, s=r.status===a.st, d=norm((r.related_departments||[]).join(','))===norm(a.dept);
 cause+=c;st+=s;dept+=d;
 if(r.tier==='1단'){t1++;t1cause+=c;t1st+=s;}
 const key=`${a.cause||'빈값'} → ${r.cause_category}`;confusion[key]=(confusion[key]||0)+1;
 rows.push({no:r.no,tier:r.tier,conf:r.confidence,cause_ok:c,st_ok:s,dept_ok:d,human:`${a.cause}/${a.st}/${a.dept||'-'}`,auto:`${r.cause_category}/${r.status}/${(r.related_departments||[]).join(',')||'-'}`});
}
const p=(x,y)=>y?`${x}/${y} (${Math.round(x/y*100)}%)`:'-';
console.log(`전체 ${n}건 | 원인 일치 ${p(cause,n)} | 상태 일치 ${p(st,n)} | 부서 일치 ${p(dept,n)}`);
console.log(`1단 판정 ${t1}건 (${Math.round(t1/n*100)}%) | 1단 원인 일치 ${p(t1cause,t1)} | 1단 상태 일치 ${p(t1st,t1)}`);
console.log('\n[1단 중 불일치]');for(const r of rows.filter(r=>r.tier==='1단'&&!r.cause_ok))console.log(` No.${r.no} 사람=${r.human} | 자동=${r.auto}`);
console.log('\n[2단 중 원인 불일치]');for(const r of rows.filter(r=>r.tier==='2단'&&!r.cause_ok))console.log(` No.${r.no} 사람=${r.human} | 자동=${r.auto}`);
console.log('\n[혼동 행렬 (사람 → 자동), 불일치만]');for(const [k,v] of Object.entries(confusion).sort((a,b)=>b[1]-a[1])){const [h,m]=k.split(' → ');if(h!==m)console.log(` ${v}\t${k}`);}
fs.writeFileSync(process.argv[2].replace(/\.json$/,'_compare.json'),JSON.stringify(rows,null,1));
