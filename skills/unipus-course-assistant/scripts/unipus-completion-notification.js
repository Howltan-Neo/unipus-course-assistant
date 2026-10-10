async (request) => {
  if(request.authorized!==true)throw Error('Explicit repair authorization required');
  const id=String(request.taskId),offset=Number(id)-601620;
  if(location.pathname!==`/course/8021/task/${id}/activity_show`||offset<0||offset>=75||![3,4].includes(offset%5))throw Error('Authorized unit task frame required');
  const kind=offset%5===3?'homework':'unitQuiz',unit=Math.floor(offset/5)+1;
  if(request.scope?.courseId!=='8021'||!Array.isArray(request.scope[kind]?.aiUnits)||!request.scope[kind].aiUnits.includes(unit))throw Error('Task outside AI assignment');
  const text=document.body.innerText,rows=[...document.querySelectorAll('.testpaper-question')];
  if(!text.includes('批阅完成')||!rows.length||rows.some(n=>/回答错误|你答错了/.test(n.innerText))||rows.filter(n=>/回答正确|你答对了/.test(n.innerText)).length!==rows.length)throw Error('Fully correct graded result required');
  if(offset%5===4&&(!text.includes('恭喜您已通过本次考试')||Number(text.match(/(\d+(?:\.\d+)?)\s*分\s*\n总分/)?.[1])!==100))throw Error('Verified 100 point quiz required');
  if(typeof window.webpackJsonp!=='function'||![...document.scripts].some(s=>s.src.includes('/common.js?version=8.2.9_26.06.15')))throw Error('Native notifier version changed');
  let NativeEmitter;const moduleId=`codex_restore_${id}`;
  window.webpackJsonp([],{[moduleId]:(m,e,r)=>{NativeEmitter=r('da32dea28c2b82c7aab1').default;}},[moduleId]);
  const emitter=new NativeEmitter();
  // 同平台交卷代码一样先建立父子页通信，再通知；不调用交卷或进度接口。
  await new Promise(resolve=>setTimeout(resolve,1000));
  await Promise.race([emitter.emit('finish',{data:''}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native notification timeout')),15000))]);
  const d=new DOMParser().parseFromString(await(await fetch('/my/course/8021',{cache:'no-store',credentials:'same-origin'})).text(),'text/html');
  return {taskId:id,gradedItems:rows.length,done:d.querySelector(`#task_id_${id} .left-menu`)?.className.includes('iccheckcircleblack24px')===true};
}
