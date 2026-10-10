// 纯函数：校验分工并判断任务范围；不登录、不启动、不填写、不提交。
// 浏览器/Node：将此文件当作函数表达式求值，再传入 {scope, task}。
(request) => {
  'use strict';
  const scope = request?.scope;
  if (!scope || scope.version !== 1 || typeof scope.courseId !== 'string' || !/^\d+$/.test(scope.courseId))
    throw new Error('Invalid course scope');
  for (const kind of ['homework', 'unitQuiz']) {
    const units = scope[kind]?.aiUnits;
    if (!Array.isArray(units) || units.some(u => !Number.isInteger(u) || u < 1 || u > 15) || new Set(units).size !== units.length)
      throw new Error(`Invalid ${kind} unit selection`);
  }
  if (!['ai', 'manual'].includes(scope.finalExam)) throw new Error('Invalid final exam selection');
  const task = request.task;
  if (!task) return { valid: true, scope };
  if (String(task.courseId) !== scope.courseId) return { decision: 'blocked', reason: 'Course mismatch' };
  if (task.kind === 'finalExam') return { decision: scope.finalExam };
  if (!['homework', 'unitQuiz'].includes(task.kind) || !Number.isInteger(task.unit) || task.unit < 1 || task.unit > 15)
    return { decision: 'blocked', reason: 'Unknown task type or unit' };
  return { decision: scope[task.kind].aiUnits.includes(task.unit) ? 'ai' : 'manual' };
}
