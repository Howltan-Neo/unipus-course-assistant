// ==UserScript==
// @name         UMOOCs 英语语法与写作 视频连续播放
// @namespace    local.codex.unipus.8021
// @version      1.4.0
// @description  静音、最低清晰度，选择末尾三秒或完整倍速播放；服务器确认完成后串播，未获确认时原速重播。
// @match        https://moocs.unipus.cn/my/course/8021*
// @match        https://moocs.unipus.cn/course/8021/task/*/show*
// @match        https://moocs.unipus.cn/course/8021/task/*/activity_show*
// @match        https://service-cdn.qiqiuyun.net/js-sdk/video-player/*/player.html*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
const runUnipus8021Video = () => {
  'use strict';

  const TAG = 'codex-unipus-8021-video-v1';
  const COURSE_ORIGIN = 'https://moocs.unipus.cn';
  const PLAYER_ORIGIN = 'https://service-cdn.qiqiuyun.net';
  const COURSE_URL = `${COURSE_ORIGIN}/my/course/8021`;
  const ENABLE_KEY = `${TAG}:enabled`;
  const preferredRate = Number(localStorage.getItem(`${TAG}:preferred-rate`));
  let FAST_RATE = [1, 4, 8, 16].includes(preferredRate) ? preferredRate : 16;
  const seekMode = localStorage.getItem(`${TAG}:mode`) !== 'play';
  const fallbackKey = id => `${TAG}:normal-replay:${id}`;
  // 2026-10-09 已登录目录核对：15 个单元，每单元 3 个视频。
  const VIDEO_IDS = new Set(Array.from({ length: 15 }, (_, unit) =>
    [0, 1, 2].map(offset => String(601620 + unit * 5 + offset))).flat());

  const videoTaskId = pathname =>
    pathname.match(/^\/course\/8021\/task\/(\d+)\/(?:show|activity_show)$/)?.[1] || null;
  const enabled = () => localStorage.getItem(ENABLE_KEY) !== '0';

  // 实际播放器运行于跨域 iframe；只在已核对的视频任务播放器中监听原生 HTMLVideoElement。
  if (location.origin === PLAYER_ORIGIN) {
    const referrer = new URL(document.referrer || 'about:blank');
    if (referrer.origin !== COURSE_ORIGIN) return;
    // 跨域 Referrer-Policy 只给出域名，因此由已核对的顶层视频页握手传入任务 ID。
    let taskId = null;
    let requestedRate = 1;
    let replayFromStart = false;
    let seekToEnd = false;
    let videoElement = null;
    const changeRate = rate => {
      requestedRate = rate;
      if (!videoElement) return;
      videoElement.muted = true;
      try { videoElement.playbackRate = rate; } catch {}
      send('rate', { requested: rate, actual: videoElement.playbackRate });
    };

    const send = (type, detail = {}) => {
      window.top.postMessage({ tag: TAG, type, taskId, ...detail }, COURSE_ORIGIN);
    };
    let attached = false;
    let initialized = false;
    const attach = () => {
      if (attached) return;
      const video = document.querySelector('video');
      if (!video) return;
      attached = true;
      videoElement = video;
      video.muted = true;
      const preferLowestQuality = () => {
        const items = [...document.querySelectorAll('.vjs-plugin-resolution .vjs-menu-item')];
        const lowest = ['流畅', '标清'].map(label => items.find(n => n.textContent.trim() === label)).find(Boolean);
        if (!lowest || lowest.getAttribute('aria-disabled') === 'true') return;
        const current = document.querySelector('.resolution-switcher-btn-value')?.textContent.trim();
        if (current !== lowest.textContent.trim()) lowest.click();
      };
      setTimeout(preferLowestQuality, 1000);
      // 等待元数据与清晰度切换完成；每次页面加载最多跳转一次。
      let seekAttempted = false;
      const seekTimer = setInterval(() => {
        if (!seekToEnd || replayFromStart || seekAttempted || video.ended) return;
        if (video.readyState < 2 || !Number.isFinite(video.duration) || video.duration <= 3) return;
        seekAttempted = true;
        try {
          requestedRate = 1;
          video.playbackRate = 1;
          video.currentTime = Math.max(0, video.duration - 3);
          send('seek', { seconds: video.currentTime });
          video.play().catch(() => send('attention', {reason:'末尾播放被阻止，请点击播放器。'}));
        } catch {
          send('attention', {reason:'本节不能跳转，继续正常播放并核验完成状态。'});
        }
        clearInterval(seekTimer);
      }, 3000);
      setTimeout(() => clearInterval(seekTimer), 30000);
      let waitingTimer = null;
      let pauseTimer = null;
      let hasPlayed = false;
      let lastReportedMinute = -1;
      const applyRate = () => {
        video.muted = true;
        try {
          video.playbackRate = requestedRate;
          setTimeout(() => send('rate', {
            requested: requestedRate, actual: video.playbackRate,
          }), 1500);
        } catch {
          send('rate', { requested: requestedRate, actual: video.playbackRate });
        }
      };
      video.addEventListener('loadedmetadata', () => {
        if (replayFromStart) video.currentTime = 0;
        applyRate();
      });
      if (replayFromStart && video.readyState >= 1) video.currentTime = 0;
      applyRate();
      const clearWaiting = () => { clearTimeout(waitingTimer); waitingTimer = null; };
      const clearPause = () => { clearTimeout(pauseTimer); pauseTimer = null; };
      video.addEventListener('playing', () => {
        hasPlayed = true;
        clearWaiting(); clearPause();
        send('playing', { seconds: Math.floor(video.currentTime) });
      });
      video.addEventListener('timeupdate', () => {
        const minute = Math.floor(video.currentTime / 60);
        if (minute !== lastReportedMinute) {
          lastReportedMinute = minute;
          send('progress', { seconds: Math.floor(video.currentTime) });
        }
      });
      video.addEventListener('waiting', () => {
        clearWaiting();
        waitingTimer = setTimeout(() => {
          if (!video.ended && video.readyState < 3) send('attention', { reason: '视频缓冲超过 60 秒，请检查网络或播放器。' });
        }, 60000);
      });
      video.addEventListener('pause', () => {
        if (video.ended || !hasPlayed) return;
        clearPause();
        pauseTimer = setTimeout(() => {
          if (video.paused && !video.ended) send('attention', { reason: '视频已暂停，可能有弹题或需要人工交互。' });
        }, 20000);
      });
      video.addEventListener('error', () => send('attention', { reason: '播放器报错，请手动检查。' }));
      video.addEventListener('ended', () => {
        clearWaiting(); clearPause();
        send('ended', { duration: Math.floor(video.duration || 0) });
      });
      if (video.ended) send('ended', { duration: Math.floor(video.duration || 0) });
      else if (video.paused) {
        video.play().then(() => send('playing', { seconds: Math.floor(video.currentTime) }))
          .catch(() => send('attention', { reason: '浏览器阻止了自动播放，请点击一次播放器。' }));
      } else {
        hasPlayed = true;
        send('playing', { seconds: Math.floor(video.currentTime) });
      }
    };
    window.addEventListener('message', event => {
      if (event.origin !== COURSE_ORIGIN || event.source !== window.top ||
          event.data?.tag !== TAG || !['attach','set-rate'].includes(event.data.type) ||
          !VIDEO_IDS.has(String(event.data.taskId))) return;
      if (event.data.type === 'set-rate') {
        if (initialized && String(event.data.taskId) === taskId && [1,4,8,16].includes(event.data.rate))
          changeRate(event.data.rate);
        return;
      }
      if (initialized) return;
      initialized = true;
      taskId = String(event.data.taskId);
      requestedRate = [1, 4, 8, 16].includes(event.data.rate) ? event.data.rate : 1;
      replayFromStart = event.data.replayFromStart === true;
      seekToEnd = event.data.seekToEnd === true;
      attach();
      const observer = new MutationObserver(attach);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        if (!attached) send('attention', { reason: '未找到 HTML5 视频元素；播放器结构可能已变化。' });
        observer.disconnect();
      }, 30000);
    }, { once: false });
    send('ready');
    return;
  }

  if (location.origin !== COURSE_ORIGIN || window !== window.top) return;
  const isCoursePage = location.pathname === '/my/course/8021';
  const taskId = videoTaskId(location.pathname);
  if (!isCoursePage && (!taskId || !VIDEO_IDS.has(taskId) || !location.pathname.endsWith('/show'))) return;

  const panel = document.createElement('div');
  panel.id = 'codex-unipus-video-status';
  Object.assign(panel.style, {
    position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647',
    background: '#14213d', color: '#fff', padding: '10px 12px', borderRadius: '8px',
    maxWidth: '480px', font: '14px/1.5 system-ui, sans-serif', boxShadow: '0 3px 15px #0005',
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px',
  });
  const label = document.createElement('span');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  Object.assign(toggle.style, { cursor: 'pointer', border: '0', borderRadius: '5px', padding: '6px 10px',
    background: '#fbbf24', color: '#111827', fontWeight: '700', fontSize: '14px', opacity: '1' });
  const speed = document.createElement('select');
  speed.setAttribute('aria-label', '播放倍速');
  speed.title = '选择真实播放速度';
  for (const rate of [1,4,8,16]) {
    const option = document.createElement('option');
    option.value = String(rate); option.textContent = `${rate}×`;
    speed.append(option);
  }
  speed.value = String(FAST_RATE);
  Object.assign(speed.style, { background: '#fff', color: '#111827', border: '1px solid #cbd5e1',
    borderRadius: '5px', padding: '5px 7px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' });
  speed.addEventListener('change', () => {
    FAST_RATE = Number(speed.value);
    localStorage.setItem(`${TAG}:preferred-rate`, String(FAST_RATE));
    const inner = document.querySelector('#task-content-iframe')?.contentDocument?.querySelector('#lesson-video-content iframe');
    inner?.contentWindow?.postMessage({tag:TAG,type:'set-rate',taskId,rate:FAST_RATE},PLAYER_ORIGIN);
  });
  const mode = document.createElement('select');
  mode.setAttribute('aria-label', '视频处理方式');
  mode.style.cssText = speed.style.cssText;
  for (const [value, text] of [['seek','末尾三秒'],['play','完整播放']]) {
    const option = document.createElement('option');
    option.value = value; option.textContent = text; mode.append(option);
  }
  mode.value = seekMode ? 'seek' : 'play';
  mode.addEventListener('change', () => {
    localStorage.setItem(`${TAG}:mode`, mode.value);
    location.reload();
  });
  panel.append(label, mode, speed, toggle);
  document.body.append(panel);
  const setStatus = text => { label.textContent = `视频助手：${text}`; };
  const renderToggle = () => { toggle.textContent = enabled() ? '暂停串播' : '继续串播'; };
  toggle.addEventListener('click', () => {
    localStorage.setItem(ENABLE_KEY, enabled() ? '0' : '1');
    renderToggle();
    setStatus(enabled() ? '正在恢复串播' : '已暂停串播，当前视频可继续播放');
    if (enabled()) location.reload();
  });
  renderToggle();
  if (!enabled()) { setStatus('已暂停'); return; }

  const parseStatus = icon => {
    const classes = icon?.className || '';
    if (/\bes-icon-undone-check\b/.test(classes)) return 'pending';
    if (/\bes-icon-doing\b/.test(classes)) return 'pending';
    if (/\b(?:es-icon-done-check|es-icon-done|color-success|es-icon-iccheckcircleblack24px)\b/.test(classes)) return 'done';
    return 'unknown';
  };
  const readCatalog = async () => {
    const response = await fetch(COURSE_URL, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok || !response.url.startsWith(COURSE_URL)) throw new Error('课程目录无法读取，可能需要重新登录');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const tasks = [...doc.querySelectorAll('li[id^="task_id_"]')].map(item => {
      const id = item.id.replace('task_id_', '');
      const icon = item.querySelector('.left-menu i') || item.querySelector('.left-menu');
      const typeIcon = item.querySelector('.right-menu i');
      const link = item.querySelector('a.title')?.getAttribute('href') || '';
      return { id, type: typeIcon?.classList.contains('es-icon-videoclass') ? 'video' : 'other',
        status: parseStatus(icon), link };
    });
    if (tasks.length < 45 || tasks.filter(t => t.type === 'video').length < 45)
      throw new Error('目录结构与已核对版本不一致，已停止自动跳转');
    for (const id of VIDEO_IDS) {
      const matches = tasks.filter(task => task.id === id);
      if (matches.length !== 1 || matches[0].type !== 'video' ||
          matches[0].link !== `/course/8021/task/${id}/show` ||
          !['pending','done'].includes(matches[0].status))
        throw new Error(`视频 ${id} 的类型、链接或完成状态无法确认，已停止`);
    }
    return tasks;
  };
  const validVideo = task => task && task.type === 'video' && VIDEO_IDS.has(task.id) &&
    task.link === `/course/8021/task/${task.id}/show`;
  const nextPending = (tasks, currentId = null) => {
    const index = currentId ? tasks.findIndex(t => t.id === currentId) : -1;
    const candidates = [...tasks.slice(index + 1), ...tasks.slice(0, index + 1)];
    return candidates.find(t => validVideo(t) && t.status === 'pending') || null;
  };
  const navigate = task => {
    if (!validVideo(task)) throw new Error('下一项不是已核对的视频，已停止');
    setStatus(`进入视频 ${task.id}`);
    location.assign(new URL(task.link, COURSE_ORIGIN).href);
  };
  const stopWith = reason => {
    setStatus(reason);
    console.warn('[UMOOCs 英语语法与写作 视频助手]', reason);
  };

  if (isCoursePage) {
    setStatus('正在核对目录');
    readCatalog().then(tasks => {
      const next = nextPending(tasks);
      if (next) navigate(next);
      else stopWith('没有可确认的未完成视频');
    }).catch(error => stopWith(error.message));
    return;
  }

  setStatus('等待播放器正常播放');
  let advancing = false;
  let actualRate = 1;
  const normalReplay = sessionStorage.getItem(fallbackKey(taskId)) === '1';
  if (normalReplay) {
    mode.value = 'play'; mode.disabled = true;
    speed.value = '1'; speed.disabled = true;
    speed.title = '本节正在原速重播以核验服务器完成条件';
  }
  let catalogReady = false;
  const verifyAndAdvance = async () => {
    if (advancing || !enabled()) return;
    advancing = true;
    try {
      for (let attempt = 0; attempt < 12; attempt++) {
        if (!enabled()) return;
        const tasks = await readCatalog();
        const current = tasks.find(t => t.id === taskId);
        if (!validVideo(current)) throw new Error('当前课时不是已核对的视频，已停止');
        if (current.status === 'done') {
          const next = nextPending(tasks, taskId);
          if (next) navigate(next);
          else stopWith('全部视频已完成；作业与考试由你另行处理');
          return;
        }
        if (current.status !== 'pending') throw new Error('当前进度状态无法识别，已停止');
        setStatus(`视频结束，等待服务器确认完成（${attempt + 1}/12）`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      if (!normalReplay) {
        sessionStorage.setItem(fallbackKey(taskId), '1');
        setStatus('播放未获完成确认，重新以原速观看本节');
        location.reload();
      } else {
        stopWith('原速播放结束后服务器仍未确认完成；请检查弹题或进度。');
      }
    } catch (error) { stopWith(error.message); }
    finally { advancing = false; }
  };

  const playerFrame = () => document.querySelector('#task-content-iframe')
    ?.contentDocument?.querySelector('#lesson-video-content iframe');
  const sendAttach = () => {
    if (!catalogReady || !enabled()) return;
    const inner = playerFrame();
    inner?.contentWindow?.postMessage({ tag: TAG, type: 'attach', taskId,
      rate: normalReplay ? 1 : FAST_RATE, replayFromStart: normalReplay,
      seekToEnd: seekMode && !normalReplay }, PLAYER_ORIGIN);
  };
  window.addEventListener('message', event => {
    if (event.origin !== PLAYER_ORIGIN || event.data?.tag !== TAG) return;
    const outer = document.querySelector('#task-content-iframe');
    const inner = outer?.contentDocument?.querySelector('#lesson-video-content iframe');
    if (!inner || event.source !== inner.contentWindow) return;
    if (event.data.type === 'ready') { sendAttach(); return; }
    if (event.data.taskId !== taskId) return;
    if (event.data.type === 'rate') {
      actualRate = event.data.actual;
      if (actualRate !== event.data.requested && event.data.requested > 1)
        setStatus(`播放器限制倍速，按实际 ${actualRate}× 播放`);
    } else if (event.data.type === 'seek') {
      actualRate = 1;
      setStatus('已跳到末尾三秒，等待自然结束与目录确认');
    } else if (event.data.type === 'playing' || event.data.type === 'progress')
      setStatus(`正在以 ${actualRate}× 播放，第 ${Math.floor(event.data.seconds / 60)} 分钟`);
    else if (event.data.type === 'attention') stopWith(event.data.reason);
    else if (event.data.type === 'ended') verifyAndAdvance();
  });
  readCatalog().then(tasks => {
    const current = tasks.find(t => t.id === taskId);
    if (!validVideo(current)) stopWith('当前是作业或考试，视频助手不操作');
    else if (current.status === 'done') {
      const next = nextPending(tasks, taskId);
      if (next) navigate(next);
      else stopWith('没有未完成视频');
    } else if (current.status === 'pending') {
      catalogReady = true;
      sendAttach();
      let handshakeAttempts = 0;
      const handshakeTimer = setInterval(() => {
        if (++handshakeAttempts > 15) { clearInterval(handshakeTimer); return; }
        sendAttach();
      }, 2000);
    } else stopWith('当前进度状态无法识别');
  }).catch(error => stopWith(error.message));
};
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', runUnipus8021Video, { once: true });
else runUnipus8021Video();
})();
