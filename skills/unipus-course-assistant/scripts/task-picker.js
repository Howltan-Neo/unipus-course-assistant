(request = {}) => {
  const ID = 'unipus-ai-task-picker';
  const existing = document.getElementById(ID);
  if (request.action === 'read') return existing?.dataset.result ? {status:'confirmed', ...JSON.parse(existing.dataset.result)} : {status:existing ? 'pending' : 'missing'};
  if (existing && request.action !== 'reset') return {status:existing.dataset.result ? 'confirmed' : 'pending'};
  if (existing) existing.remove();
  const courseId = String(request.courseId || '8021');
  if (!/^\d+$/.test(courseId)) throw Error('Invalid course ID');
  const host = document.createElement('div'); host.id = ID;
  const root = host.attachShadow({mode:'open'});
  root.innerHTML = `<style>
    :host{position:fixed;inset:0;z-index:2147483647;background:#15213b80;display:grid;place-items:center;font:15px/1.5 system-ui,"Microsoft YaHei",sans-serif;color:#172b4d}
    *{box-sizing:border-box} .panel{width:min(680px,calc(100vw - 24px));max-height:calc(100vh - 24px);background:white;border-radius:18px;box-shadow:0 20px 70px #13244355;overflow:hidden;display:flex;flex-direction:column}
    header{padding:22px 26px 16px;background:#f2f7ff;border-bottom:1px solid #dce5f3} h2{margin:0 0 6px;font-size:23px} p{margin:0;color:#536681} .tag{font-size:12px;color:#1762b8;font-weight:700;margin-bottom:5px}
    .toolbar{display:flex;gap:8px;flex-wrap:wrap;padding:14px 26px} button{font:inherit;cursor:pointer;border:1px solid #cbd8e9;border-radius:8px;padding:7px 12px;background:white;color:#174b88} button:hover{background:#eaf2ff} button:focus-visible,input:focus-visible{outline:3px solid #ffb900;outline-offset:2px}
    .table{overflow:auto;max-height:340px;margin:0 26px;border:1px solid #dce5f3;border-radius:10px} table{width:100%;border-collapse:collapse;text-align:center} th{position:sticky;top:0;background:#eaf2ff;font-size:14px;z-index:1} th,td{padding:8px 12px;border-bottom:1px solid #e7edf5} td:first-child,th:first-child{text-align:left;width:36%} tr:nth-child(even){background:#f8fafd} label{cursor:pointer;display:inline-flex;align-items:center;gap:8px} input{width:20px;height:20px;margin:0;accent-color:#176be2} .extras{padding:14px 26px;display:grid;gap:9px;font-size:14px}.note{font-size:12px;color:#6a5360;margin-left:28px}
    footer{padding:16px 26px;background:#f5f8fc;border-top:1px solid #dce5f3;display:flex;align-items:center;gap:15px;justify-content:space-between}.counts{font-size:14px;color:#365779}.primary{background:#176be2;color:white;border-color:#176be2;font-weight:700;padding:11px 19px}.primary:hover{background:#1054b6}.done{padding:32px}.done h2{color:#157b50}.muted{font-size:12px}
  </style><section class="panel" role="dialog" aria-modal="true" aria-labelledby="picker-title">
  <header><div class="tag">UMOOCs · 任务分工</div><h2 id="picker-title">哪些任务交给 AI？</h2><p>勾选 = AI 完成　·　未勾选 = 我自己完成</p><p class="muted" id="course"></p></header>
  <div class="toolbar"><button data-set="homework">全选作业</button><button data-set="unitQuiz">全选单元测验</button><button data-set="all">全选单元项目</button><button data-set="none">全不选</button></div>
  <div class="table" aria-label="单元列表，向下滚动查看 U9–U15"><table><thead><tr><th>课程单元 ↕ 可滚动</th><th>普通作业</th><th>单元测验</th></tr></thead><tbody></tbody></table></div>
  <div class="extras"><label><input type="checkbox" id="video" checked>视频交给助手自动播放（静音、低画质）</label><label><input type="checkbox" id="final">期末测验也交给 AI</label><div class="note">期末测验独立选择；开始前仍需核对尝试次数。</div><label><input type="checkbox" id="repair">授权修复已核验通过但目录未完成的单元状态</label></div>
  <footer><div class="counts" aria-live="polite"></div><button class="primary" id="confirm">确认任务分工</button></footer></section>`;
  root.getElementById('course').textContent = `${request.courseName || '英语语法与写作'} · 课程 ${courseId}`;
  const body = root.querySelector('tbody');
  for (let unit=1;unit<=15;unit++) {
    const tr=document.createElement('tr'); const name=document.createElement('td'); name.textContent=`Unit ${unit}`;tr.append(name);
    for(const kind of ['homework','unitQuiz']) {
      const cell=document.createElement('td'),label=document.createElement('label'),input=document.createElement('input');
      input.type='checkbox';input.dataset.kind=kind;input.dataset.unit=unit;input.setAttribute('aria-label',`U${unit}${kind==='homework'?'作业':'单元测验'}交给AI`);
      // 新账号默认全部由用户完成；只有已有明确分工才预填。
      input.checked=Array.isArray(request.scope?.[kind]?.aiUnits)&&request.scope[kind].aiUnits.includes(unit);
      label.append(input);cell.append(label);tr.append(cell);
    } body.append(tr);
  }
  root.getElementById('final').checked=request.scope?.finalExam==='ai';
  root.getElementById('repair').checked=request.scope?.repairNativeNotifications!==false;
  root.getElementById('video').checked=request.scope?.video?.enabled!==false;
  const boxes=[...root.querySelectorAll('input[data-kind]')];
  const update=()=>{const n=kind=>boxes.filter(b=>b.dataset.kind===kind&&b.checked).length;root.querySelector('.counts').textContent=`AI：作业 ${n('homework')}/15 · 测验 ${n('unitQuiz')}/15`;};
  root.addEventListener('change',update);
  root.querySelectorAll('[data-set]').forEach(b=>b.onclick=()=>{const k=b.dataset.set;boxes.forEach(c=>{if(k==='all'||k==='none'||c.dataset.kind===k)c.checked=k!=='none';});if(k==='none')root.getElementById('final').checked=false;update();});
  root.getElementById('confirm').onclick=()=>{
    const selected=kind=>boxes.filter(b=>b.dataset.kind===kind&&b.checked).map(b=>Number(b.dataset.unit));
    const scope={version:1,courseId,homework:{aiUnits:selected('homework')},unitQuiz:{aiUnits:selected('unitQuiz')},finalExam:root.getElementById('final').checked?'ai':'manual',repairNativeNotifications:root.getElementById('repair').checked,video:{enabled:root.getElementById('video').checked}};
    host.dataset.result=JSON.stringify({scope});
    root.querySelector('.panel').innerHTML='<div class="done"><h2>任务分工已确认</h2><p>智能体会读取选择结果，再按授权继续。</p><button id="hide">收起面板</button></div>';
    root.getElementById('hide').onclick=()=>{host.style.display='none';};
  };
  document.documentElement.append(host);update();root.getElementById('confirm').focus();
  return {status:'pending',courseId};
}
