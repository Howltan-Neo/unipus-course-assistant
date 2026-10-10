(request) => {
  'use strict';
  const rowSelector = request.rowSelector || '.testpaper-question[id^="question"]';
  const stemSelector = request.stemSelector || '.testpaper-question-stem';
  const fieldSelector = request.fieldSelector || 'input[data-type]:not([type="hidden"]),textarea[data-type]';
  const rows = [...document.querySelectorAll(rowSelector)];
  const fields = row => [...row.querySelectorAll(fieldSelector)].filter(n => n.type !== 'hidden');
  const signature = n => ({ id:n.id, name:n.name, type:n.type, dataType:n.getAttribute('data-type'),
    option:['radio','checkbox'].includes(n.type) ? n.value : null });
  const schema = rows.map(row => ({id:row.id,text:row.innerText,fields:fields(row).map(signature)}));
  const readValues = row => {
    const nodes = fields(row);
    return nodes.every(n => ['radio','checkbox'].includes(n.type))
      ? {kind:'choice',values:nodes.filter(n => n.checked).map(n => n.value)}
      : {kind:'text',values:nodes.map(n => n.value)};
  };
  if(request.action === 'snapshot') {
    const limit = Math.max(1, Number(request.maxMaterialChars) || 12000);
    const material = request.materialSelector
      ? [...document.querySelectorAll(request.materialSelector)].map(n => n.innerText).join('\n') : null;
    return {url:location.href,title:document.title,questionCount:rows.length,schema,
      material:material?.slice(0,limit) ?? null,materialTruncated:!!material && material.length > limit,
      questions:rows.map((row,i) => ({number:i+1,id:row.id,
        text:row.innerText,
        stem:row.querySelector(stemSelector)?.innerText || '',
        fields:fields(row).map(n => ({...signature(n),
          label:n.closest('label')?.innerText.trim() || null,
          value:['radio','checkbox'].includes(n.type) ? undefined : n.value,
          checked:['radio','checkbox'].includes(n.type) ? n.checked : undefined}))}))};
  }
  if(!['fill','verify'].includes(request.action)) throw Error('Unsupported action');
  const plan = request.plan;
  if(!plan || plan.url !== location.href || plan.title !== document.title) throw Error('Wrong assessment identity');
  if(!rows.length || JSON.stringify(plan.schema) !== JSON.stringify(schema)) throw Error('Assessment structure changed');
  if(Object.keys(plan.answers || {}).length !== rows.length || new Set(rows.map(r=>r.id)).size !== rows.length)
    throw Error('Incomplete answers or duplicate question IDs');
  // Complete validation before any value is changed.
  for(const row of rows) {
    const nodes=fields(row), answer=plan.answers[row.id];
    if(!answer || !Array.isArray(answer.values) || !nodes.length) throw Error(`Missing answer: ${row.id}`);
    const choice=nodes.every(n=>['radio','checkbox'].includes(n.type));
    const text=nodes.every(n=>['text','textarea','number','search'].includes(n.type));
    if(!choice && !text) throw Error(`Unsupported or mixed fields: ${row.id}`);
    if(nodes.some(n=>n.disabled || n.readOnly)) throw Error(`Read-only question: ${row.id}`);
    if(choice) {
      const radio=nodes.every(n=>n.type==='radio');
      const checkbox=nodes.every(n=>n.type==='checkbox');
      if(!radio && !checkbox)throw Error(`Mixed choices: ${row.id}`);
      if(answer.kind!=='choice' || !answer.values.length ||
        new Set(answer.values).size!==answer.values.length || (radio && answer.values.length!==1) ||
        answer.values.some(v=>!nodes.some(n=>n.value===v))) throw Error(`Invalid choice: ${row.id}`);
    } else if(answer.kind!=='text' || answer.values.length!==nodes.length ||
      answer.values.some(v=>typeof v!=='string' || !v.trim())) throw Error(`Invalid text answer: ${row.id}`);
  }
  if(request.action==='fill') for(const row of rows) {
    const nodes=fields(row),answer=plan.answers[row.id];
    if(answer.kind==='choice') {
      for(const n of nodes) {
        const wanted=answer.values.includes(n.value);
        if(n.type==='radio') {if(wanted && !n.checked)n.click();}
        else if(n.checked!==wanted)n.click();
      }
    } else nodes.forEach((n,i)=>{
      const prototype=n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype,'value').set.call(n,answer.values[i]);
      n.dispatchEvent(new Event('input',{bubbles:true}));
      n.dispatchEvent(new Event('change',{bubbles:true}));
      n.dispatchEvent(new Event('blur',{bubbles:true}));
    });
  }
  const actual=Object.fromEntries(rows.map(row=>[row.id,readValues(row)]));
  const mismatches=rows.filter(row=>{
    const expected=plan.answers[row.id],found=actual[row.id];
    const canonical = value => value.kind==='choice' ? [...value.values].sort() : value.values;
    return expected.kind!==found.kind || JSON.stringify(canonical(expected))!==JSON.stringify(canonical(found));
  }).map(row=>row.id);
  return {url:location.href,questionCount:rows.length,answers:actual,mismatches,
    readyToSubmit:mismatches.length===0,submitted:false};
}
