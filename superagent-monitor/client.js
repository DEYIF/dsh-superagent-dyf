window.__ModuleLoader__.load({
  id: '@local/superagent-monitor',
  factory: function (require) {
    'use strict';

    var React = require('react');
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;

    var PANEL_ID = 'superagent-monitor';
    var API = '/superagent-monitor/api/';
    var HEADER = 'x-superagent-monitor-request';
    var REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

    /* ------------------------------------------------------------------ */
    /* Locale                                                              */
    /* ------------------------------------------------------------------ */

    function T(zh, en) {
      return { zh: zh, en: en };
    }

    function pick(lang, value) {
      if (value && typeof value === 'object' && !Array.isArray(value) && (value.zh != null || value.en != null)) {
        return value[lang] != null ? value[lang] : value.zh;
      }
      return value;
    }

    function liveLang(locale) {
      var active = '';
      try {
        active = locale && typeof locale.getLocale === 'function' ? locale.getLocale().active : '';
      } catch (failure) {
        active = '';
      }
      if (!active) return 'zh';
      var id = String(active).toLowerCase();
      return id.indexOf('zh') === 0 || id.indexOf('cn') === 0 ? 'zh' : 'en';
    }

    function useLang(locale) {
      var state = useState(function () { return liveLang(locale); });
      var setLang = state[1];
      useEffect(function () {
        setLang(liveLang(locale));
        if (!locale || typeof locale.subscribe !== 'function') return undefined;
        var off = locale.subscribe(function () { setLang(liveLang(locale)); });
        return typeof off === 'function' ? off : undefined;
      }, [locale]);
      return state[0];
    }

    /* ------------------------------------------------------------------ */
    /* Vocabulary                                                          */
    /* ------------------------------------------------------------------ */

    var UI = {
      title: T('Superagent 监控', 'Superagent monitor'),
      subtitle: T(
        '独立运行的 dsh-superagent 实例：运行状态、健康分项、负载、消息来源与监听的仓库。',
        'The standalone dsh-superagent instance: runtime, health parts, load, sources and the watched repository.'
      ),
      refresh: T('刷新', 'Refresh'),
      refreshing: T('刷新中…', 'Refreshing…'),
      start: T('启动', 'Start'),
      restart: T('重启', 'Restart'),
      confirmRestart: T('确认重启', 'Confirm restart'),
      pause: T('暂停处理', 'Pause processing'),
      resume: T('恢复处理', 'Resume processing'),
      alreadyRunning: T('服务已在运行；要恢复可选“重启”。', 'The service is already running; use Restart to recover it.'),
      startUnavailable: T('启动不可用', 'Start is unavailable'),
      operationRunningLabel: T('已有启动或重启正在进行。', 'A start or restart is already in progress.'),
      checkedAt: T('上次检查', 'Checked'),
      endpoint: T('管理接口', 'Management API'),
      latency: T('延迟', 'Latency'),
      lastSeen: T('最近一次应答', 'Last answer'),
      manualStop: T('手动停止标记', 'Manually stopped'),
      loadTitle: T('负载', 'Load'),
      loadWorkers: T('执行器', 'Executors'),
      loadWorkersSub: T('运行中 / 上限', 'running / limit'),
      loadQueued: T('队列', 'Queue'),
      loadQueuedSub: T('等待执行的工单', 'Tickets waiting'),
      processing: T('处理', 'Processing'),
      processingActive: T('运行中', 'Active'),
      processingPaused: T('已暂停', 'Paused'),
      processingSub: T('工单处理开关', 'Ticket processing switch'),
      healthTitle: T('健康分项', 'Health'),
      healthEmpty: T('暂无健康数据。', 'No health data.'),
      sourcesTitle: T('消息来源', 'Sources'),
      sourcesEmpty: T('暂无来源数据。', 'No source data.'),
      sourceStats: T('今日接收', 'Received today'),
      sourceFiltered: T('过滤', 'Filtered'),
      sourceLast: T('最近', 'Last'),
      sourceDisabled: T('来源已关闭。', 'This source is off.'),
      sourceDetailUnavailable: T('来源状态读取失败：', 'Could not read sources: '),
      repositoryTitle: T('监听的仓库', 'Watched repository'),
      repositoryCurrent: T('当前', 'Current'),
      repositoryPlaceholder: T('owner/name', 'owner/name'),
      repositoryHint: T(
        '保存时 dsh-superagent 先确认智能体账号能推送到该仓库，然后重启；新通知从下一次轮询开始。',
        'Saving first checks that the agent account can push to the repository, then restarts dsh-superagent; new notifications arrive on the next poll.'
      ),
      repositoryUnreachable: T('管理接口没有应答，启动后才能修改仓库。', 'The management API does not answer; start the service before changing the repository.'),
      repositoryInvalid: T('仓库应写成 owner/name。', 'Use owner/name.'),
      repositorySave: T('保存仓库', 'Save repository'),
      repositorySaving: T('保存中…', 'Saving…'),
      repositoryUnchanged: T('仓库没有变化。', 'The repository is unchanged.'),
      repositorySaved: T('仓库已保存。', 'The repository was saved.'),
      repositorySavedRestarting: T('仓库已保存；dsh-superagent 正在检查账号并重启。', 'Saved; dsh-superagent is checking the account and restarting.'),
      operationTitle: T('最近操作', 'Last operation'),
      operationEmpty: T('还没有通过这里启动或重启过。', 'No start or restart from this panel yet.'),
      operationStart: T('启动', 'Start'),
      operationRestart: T('重启', 'Restart'),
      operationRunning: T('运行中', 'Running'),
      operationDone: T('完成', 'Done'),
      operationFailed: T('失败', 'Failed'),
      operationTimeout: T('超时', 'Timed out'),
      operationExit: T('退出码', 'Exit code'),
      operationOutput: T('输出', 'Output'),
      operationStarted: T('开始', 'Started'),
      operationEnded: T('结束', 'Ended'),
      operationOutputEmpty: T('命令没有输出。', 'The command printed nothing.'),
      operationWatchdog: T('Watchdog 自动', 'Watchdog'),
      watchdogTitle: T('主进程 Watchdog', 'Main-process watchdog'),
      watchdogEnable: T('启用', 'Enable'),
      watchdogDisable: T('停用', 'Disable'),
      watchdogCheck: T('立即检查', 'Check now'),
      watchdogReset: T('重置计数', 'Reset counters'),
      watchdogThreshold: T('失败阈值', 'Failure threshold'),
      watchdogCooldown: T('重启冷却', 'Restart cooldown'),
      watchdogBudget: T('每小时上限', 'Restarts per hour'),
      watchdogConsecutive: T('连续失败', 'Consecutive failures'),
      watchdogRestarts: T('本小时重启', 'Restarts this hour'),
      watchdogLastCheck: T('上次检查', 'Last check'),
      watchdogNextCheck: T('下次检查', 'Next check'),
      watchdogLastRestart: T('上次重启', 'Last restart'),
      watchdogNextRestart: T('下次允许重启', 'Next allowed restart'),
      watchdogSuppressedUntil: T('自动恢复暂停至', 'Auto-recovery paused until'),
      watchdogBlockedReason: T('阻止原因', 'Blocked reason'),
      watchdogEvents: T('Watchdog 事件', 'Watchdog events'),
      watchdogNoEvents: T('还没有 Watchdog 事件。', 'No watchdog events yet.'),
      watchdogRuntimeHint: T('开关只对本次 DSH 进程生效；持久值在插件配置的 watchdog.enabled 里。', 'The switch applies to this DSH process; the durable value is watchdog.enabled in the plugin configuration.'),
      watchdogRuleHint: T('通过管理接口探活；连续失败达到阈值后执行 scripts/dsh-superagent restart --respect-stop。', 'Probes the management API; after the failure threshold it runs scripts/dsh-superagent restart --respect-stop.'),
      watchdogNoticeEnabled: T('Watchdog 已启用。', 'Watchdog enabled.'),
      watchdogNoticeDisabled: T('Watchdog 已停用；仍显示状态，但不会自动重启。', 'Watchdog disabled; status is still shown, but nothing restarts automatically.'),
      watchdogNoticeCheck: T('已开始检查。', 'Check started.'),
      watchdogNoticeReset: T('计数已重置。', 'Counters reset.'),
      watchdogDisabledShort: T('自动恢复已停用', 'Auto-recovery off'),
      historyTitle: T('状态变化', 'Status changes'),
      historyEmpty: T('还没有记录到状态变化。', 'No status change recorded yet.'),
      configTitle: T('监测配置', 'Monitor configuration'),
      configProfile: T('配置档案', 'Profile'),
      configRunner: T('启动方式', 'Runner'),
      configDistro: T('WSL 发行版', 'WSL distribution'),
      configCheckout: T('检出目录', 'Checkout'),
      configStateDir: T('状态目录', 'State directory'),
      configCommand: T('启动命令', 'Start command'),
      configWatchdogCommand: T('Watchdog 重启命令', 'Watchdog restart command'),
      configDefaultDistro: T('默认发行版', 'Default distribution'),
      setupTitle: T('等待配置', 'Waiting for setup'),
      setupPlace: T('位置', 'Place'),
      feishuProblemTitle: T('飞书来源不可用', 'Feishu source unavailable'),
      noticeStart: T('已发出启动命令。', 'Start requested.'),
      noticeRestart: T('已发出重启命令；等执行器完成当前步骤可能需要几分钟。', 'Restart requested; waiting for running executors may take a few minutes.'),
      noticePaused: T('工单处理已暂停。', 'Ticket processing is paused.'),
      noticeResumed: T('工单处理已恢复。', 'Ticket processing resumed.'),
      loading: T('正在连接 dsh-superagent…', 'Connecting to dsh-superagent…'),
      errorTitle: T('监视服务暂时不可用', 'The monitor service is unavailable'),
      errorTimeout: T('请求超时。', 'The request timed out.'),
      errorRoute: T('监视插件的接口没有挂载；请确认已安装并刷新页面。', 'The monitor route is not mounted; check the installation and refresh the page.'),
      errorForbidden: T('请求被拒绝（只接受本机同源请求）。', 'The request was refused (local same-origin only).'),
      retry: T('重试', 'Retry'),
      unknown: T('未知', 'Unknown'),
      none: T('—', '—'),
      active: T('是', 'Yes'),
      inactive: T('否', 'No'),
      statusDetailNote: T('详情', 'Detail')
    };

    var STATUS = {
      ready: {
        label: T('运行正常', 'Running'),
        desc: T('运行时与所有分项均正常。', 'The runtime and every part are ready.')
      },
      setup: {
        label: T('等待配置', 'Needs setup'),
        desc: T('运行时已启动，但配置还不完整。', 'The runtime is up but setup is incomplete.')
      },
      error: {
        label: T('有分项异常', 'Part error'),
        desc: T('至少一个分项报错，重启不一定能修复。', 'At least one part reports an error; a restart may not fix it.')
      },
      paused: {
        label: T('处理已暂停', 'Paused'),
        desc: T('运行时正常，工单处理已暂停。', 'The runtime is ready and ticket processing is paused.')
      },
      starting: {
        label: T('启动中', 'Starting'),
        desc: T('正在等待运行时就绪…', 'Waiting for the runtime to become ready…')
      },
      stopped: {
        label: T('已停止', 'Stopped'),
        desc: T('进程未运行；可以用“启动”把它拉起来。', 'The process is not running; use Start.')
      },
      unreachable: {
        label: T('进程在运行，但无应答', 'No answer'),
        desc: T('进程存在，但管理接口没有应答；可以尝试重启。', 'The process exists but the management API does not answer; try Restart.')
      },
      unknown: {
        label: T('无法判断', 'Unknown'),
        desc: T('既没有管理接口应答，也读不到进程状态。', 'Neither the management API nor the process state could be read.')
      }
    };

    var PART_NAMES = {
      runtime: T('运行时', 'Runtime'),
      models: T('模型预算', 'Model budget'),
      evals: T('评估可用性', 'Evals'),
      assessment: T('请求评估', 'Assessment'),
      launch: T('执行启动', 'Launch'),
      delivery: T('交付', 'Delivery'),
      relay: T('中继', 'Relay'),
      notice: T('通知', 'Notice'),
      reply: T('回复', 'Reply'),
      worker: T('执行器', 'Worker'),
      github: T('GitHub', 'GitHub'),
      feishu: T('飞书', 'Feishu'),
      history: T('历史恢复', 'History')
    };

    var PART_STATES = {
      ready: { label: T('正常', 'Ready'), level: 'ok' },
      starting: { label: T('启动中', 'Starting'), level: 'warn' },
      paused: { label: T('已暂停', 'Paused'), level: 'warn' },
      error: { label: T('异常', 'Error'), level: 'error' }
    };

    var SOURCE_STATES = {
      ready: { label: T('正常', 'Ready'), level: 'ok' },
      starting: { label: T('启动中', 'Starting'), level: 'warn' },
      paused: { label: T('已暂停', 'Paused'), level: 'warn' },
      setup: { label: T('等待配置', 'Needs setup'), level: 'warn' },
      error: { label: T('异常', 'Error'), level: 'error' },
      off: { label: T('已关闭', 'Off'), level: 'idle' },
      missing: { label: T('缺失', 'Missing'), level: 'idle' }
    };

    var WATCHDOG_STATES = {
      idle: { label: T('待检查', 'Idle'), level: 'idle' },
      checking: { label: T('检查中', 'Checking'), level: 'warn' },
      healthy: { label: T('主进程正常', 'Healthy'), level: 'ok' },
      waiting: { label: T('等待阈值', 'Waiting'), level: 'warn' },
      cooldown: { label: T('冷却中', 'Cooling down'), level: 'warn' },
      recovering: { label: T('恢复中', 'Recovering'), level: 'warn' },
      recovered: { label: T('已恢复', 'Recovered'), level: 'ok' },
      'manual-stop': { label: T('手动停止', 'Manually stopped'), level: 'idle' },
      blocked: { label: T('已阻止', 'Blocked'), level: 'error' },
      suppressed: { label: T('暂停自动恢复', 'Suppressed'), level: 'warn' },
      operation: { label: T('手动操作进行中', 'Operation running'), level: 'warn' },
      error: { label: T('检查失败', 'Check failed'), level: 'error' },
      'restart-failed': { label: T('重启失败', 'Restart failed'), level: 'error' },
      disabled: { label: T('已停用', 'Disabled'), level: 'idle' },
      disposed: { label: T('已卸载', 'Disposed'), level: 'idle' }
    };

    var WATCHDOG_EVENTS = {
      started: T('启动', 'Started'),
      enabled: T('启用', 'Enabled'),
      disabled: T('停用', 'Disabled'),
      waiting: T('等待', 'Waiting'),
      restart: T('自动重启', 'Auto restart'),
      recovered: T('已恢复', 'Recovered'),
      'restart-failed': T('重启失败', 'Restart failed'),
      'restart-error': T('重启错误', 'Restart error'),
      'restart-unconfirmed': T('未确认', 'Unconfirmed'),
      blocked: T('已阻止', 'Blocked'),
      unblocked: T('解除阻止', 'Unblocked'),
      'manual-stop': T('手动停止', 'Manual stop'),
      'manual-probe': T('手动检查', 'Manual probe'),
      suppressed: T('暂停', 'Suppressed'),
      reset: T('重置', 'Reset'),
      error: T('检查失败', 'Check error'),
      'skip-operation': T('跳过', 'Skipped')
    };

    /* ------------------------------------------------------------------ */
    /* Helpers                                                             */
    /* ------------------------------------------------------------------ */

    function pad2(value) {
      return value < 10 ? '0' + value : String(value);
    }

    function timeText(iso) {
      if (!iso) return UI.none.zh;
      var date = new Date(iso);
      if (isNaN(date.getTime())) return '—';
      return pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds());
    }

    function dateTimeText(iso) {
      if (!iso) return '—';
      var date = new Date(iso);
      if (isNaN(date.getTime())) return '—';
      return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) + ' ' + timeText(iso);
    }

    function partName(lang, name) {
      if (typeof name === 'string' && name.indexOf('sync:') === 0) {
        var tail = name.slice(5);
        var label = PART_NAMES[tail] ? pick(lang, PART_NAMES[tail]) : tail;
        return lang === 'zh' ? '名单同步 · ' + label : 'Sync · ' + label;
      }
      return PART_NAMES[name] ? pick(lang, PART_NAMES[name]) : name;
    }

    function partState(lang, state) {
      var found = PART_STATES[state] || { label: T('未知', 'Unknown'), level: 'idle' };
      return { label: pick(lang, found.label), level: found.level };
    }

    function sourceState(lang, state) {
      var found = SOURCE_STATES[state] || { label: T('未知', 'Unknown'), level: 'idle' };
      return { label: pick(lang, found.label), level: found.level };
    }

    function watchdogState(lang, state) {
      var found = WATCHDOG_STATES[state] || { label: T('未知', 'Unknown'), level: 'idle' };
      return { label: pick(lang, found.label), level: found.level };
    }

    function watchdogEventLevel(kind) {
      if (kind === 'error' || kind === 'restart-failed' || kind === 'restart-error' || kind === 'blocked') return 'error';
      if (kind === 'recovered') return 'ok';
      if (kind === 'restart' || kind === 'waiting' || kind === 'restart-unconfirmed') return 'warn';
      return 'idle';
    }

    function watchdogRuleText(lang, watchdog) {
      var parts = lang === 'zh'
        ? [
          '每 ' + watchdog.intervalSeconds + ' 秒探活',
          '连续 ' + watchdog.failureThreshold + ' 次异常后重启',
          '冷却 ' + watchdog.restartCooldownSeconds + ' 秒',
          '每小时最多 ' + watchdog.maxRestartsPerHour + ' 次',
          watchdog.respectStop ? '尊重手动停止' : '忽略手动停止'
        ]
        : [
          'probe every ' + watchdog.intervalSeconds + ' s',
          'restart after ' + watchdog.failureThreshold + ' failures',
          'cooldown ' + watchdog.restartCooldownSeconds + ' s',
          'max ' + watchdog.maxRestartsPerHour + '/h',
          watchdog.respectStop ? 'respect manual stop' : 'ignore manual stop'
        ];
      return parts.join(' · ');
    }

    function messageOf(failure) {
      if (!failure) return '';
      if (failure.name === 'AbortError') return 'request timeout';
      if (failure.status === 403) return 'monitor route refused the request';
      if (failure.status === 404) return 'monitor host route is not mounted';
      return failure.message || String(failure);
    }

    function errorText(L, text) {
      if (!text) return '';
      if (text === 'request timeout') return L(UI.errorTimeout);
      if (text === 'monitor host route is not mounted') return L(UI.errorRoute);
      if (text === 'monitor route refused the request') return L(UI.errorForbidden);
      return text;
    }

    function api(name, options) {
      var init = options || {};
      var headers = { 'x-superagent-monitor-request': '1' };
      if (init.body !== undefined) headers['content-type'] = 'application/json';
      if (init.headers) {
        for (var key in init.headers) {
          if (Object.prototype.hasOwnProperty.call(init.headers, key)) headers[key] = init.headers[key];
        }
      }
      return fetch(API + name, {
        method: init.method || 'GET',
        headers: headers,
        body: init.body,
        signal: init.signal
      }).then(function (response) {
        return response.text().then(function (text) {
          var data = null;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (failure) {
              data = null;
            }
          }
          if (!response.ok) {
            var message = data && (data.error || data.message) ? (data.error || data.message) : (text || 'HTTP ' + response.status);
            var error = new Error(message);
            error.status = response.status;
            error.data = data;
            throw error;
          }
          return data;
        });
      });
    }

    /* ------------------------------------------------------------------ */
    /* Presentational pieces                                               */
    /* ------------------------------------------------------------------ */

    function Pill(props) {
      return h('span', { className: 'sam-pill sam-pill--' + (props.level || 'idle') }, h('i', null), props.children);
    }

    function Card(props) {
      return h(
        'section',
        { className: 'sam-card' + (props.className ? ' ' + props.className : '') },
        h(
          'div',
          { className: 'sam-card-head' },
          h('h3', { className: 'sam-card-title' }, props.title),
          props.extra || null
        ),
        props.children
      );
    }

    function Stat(props) {
      return h(
        'div',
        { className: 'sam-stat' },
        h('div', { className: 'sam-stat-k' }, props.label),
        h('div', { className: 'sam-stat-v' }, props.value),
        props.sub ? h('div', { className: 'sam-stat-s' }, props.sub) : null
      );
    }

    function PanelIcon(ownerProps) {
      var size = ownerProps && typeof ownerProps.size === 'number' ? ownerProps.size : 18;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
          style: { display: 'block' }
        },
        h('circle', { cx: 12, cy: 12, r: 9.2, stroke: 'currentColor', strokeWidth: 1.2, opacity: 0.35 }),
        h('path', {
          d: 'M3 12h4l2.2-5.2 3.4 10.4 2.2-5.2H21',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round'
        })
      );
    }

    /* ------------------------------------------------------------------ */
    /* Styles                                                              */
    /* ------------------------------------------------------------------ */

    var CSS = [
      '.sam-root{box-sizing:border-box;width:100%;height:100%;overflow:auto;scrollbar-gutter:stable;padding:22px 24px 40px;',
      'font-size:13px;line-height:1.55;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);}',
      '.sam-root *,.sam-root *::before,.sam-root *::after{box-sizing:border-box;}',
      '.sam-page{max-width:1180px;margin:0 auto;}',
      '.sam-head{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;justify-content:space-between;margin-bottom:16px;}',
      '.sam-title{margin:0;font-size:19px;font-weight:600;letter-spacing:.2px;display:flex;align-items:center;gap:9px;}',
      '.sam-subtitle{margin-top:4px;max-width:760px;font-size:12.5px;color:var(--dsw-alias-label-secondary);}',
      '.sam-head-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
      '.sam-btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);',
      'color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;border-radius:8px;padding:5px 12px;',
      'cursor:pointer;transition:border-color .15s,background .15s,opacity .15s;display:inline-flex;align-items:center;gap:6px;}',
      '.sam-btn:hover:not([disabled]){border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);}',
      '.sam-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.sam-btn[disabled]{opacity:.45;cursor:not-allowed;}',
      '.sam-btn--primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600;}',
      '.sam-btn--danger{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);}',
      '.sam-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:15px 17px;}',
      '.sam-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px;}',
      '.sam-card-title{margin:0;font-size:11px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:var(--dsw-alias-label-secondary);}',
      '.sam-grid{display:grid;gap:14px;}',
      '.sam-grid--main{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);margin-top:14px;}',
      '.sam-grid--stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}',
      '.sam-stack{display:flex;flex-direction:column;gap:14px;}',
      '.sam-statuscard{display:flex;flex-wrap:wrap;gap:18px;justify-content:space-between;}',
      '.sam-status-main{flex:1 1 340px;min-width:0;}',
      '.sam-status-line{display:flex;align-items:center;gap:10px;font-size:21px;font-weight:600;letter-spacing:.2px;}',
      '.sam-dot{width:10px;height:10px;border-radius:50%;display:inline-block;flex:0 0 auto;}',
      '.sam-dot--ok{background:var(--dsw-alias-state-success-primary);}',
      '.sam-dot--warn{background:var(--dsw-alias-state-warn-primary);}',
      '.sam-dot--error{background:var(--dsw-alias-state-error-primary);}',
      '.sam-dot--idle{background:var(--dsw-alias-state-idle-primary);}',
      '.sam-status-detail{margin-top:7px;font-size:12.5px;color:var(--dsw-alias-label-secondary);word-break:break-word;}',
      '.sam-status-meta{margin-top:10px;display:flex;flex-wrap:wrap;gap:4px 18px;font-size:11.5px;color:var(--dsw-alias-label-secondary);}',
      '.sam-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;}',
      '.sam-code{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:1px 6px;}',
      '.sam-status-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;justify-content:flex-end;}',
      '.sam-notice{margin-bottom:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:8px 12px;font-size:12px;word-break:break-word;}',
      '.sam-notice--ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary);}',
      '.sam-notice--error{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);}',
      '.sam-notice--warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);}',
      '.sam-banner{margin-top:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:11px 13px;background:var(--dsw-alias-bg-layer-1);}',
      '.sam-banner--warn{border-color:var(--dsw-alias-state-warn-primary);}',
      '.sam-banner-title{font-weight:600;font-size:12.5px;margin-bottom:3px;}',
      '.sam-banner-body{font-size:12px;color:var(--dsw-alias-label-secondary);word-break:break-word;}',
      '.sam-pill{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;',
      'padding:1px 8px;font-size:10.5px;line-height:1.7;white-space:nowrap;flex:0 0 auto;}',
      '.sam-pill i{width:5px;height:5px;border-radius:50%;background:currentColor;}',
      '.sam-pill--ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary);}',
      '.sam-pill--warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);}',
      '.sam-pill--error{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);}',
      '.sam-pill--idle{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);}',
      '.sam-stat{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:10px;padding:9px 11px;min-width:0;}',
      '.sam-stat-k{font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.sam-stat-v{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:1px;}',
      '.sam-stat-s{font-size:10.5px;color:var(--dsw-alias-label-secondary);margin-top:1px;}',
      '.sam-watchdog{margin-top:14px;}',
      '.sam-watchdog-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}',
      '.sam-watchdog-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:14px;align-items:start;}',
      '.sam-watchdog-info{min-width:0;display:flex;flex-direction:column;gap:5px;}',
      '.sam-watchdog-rule{color:var(--dsw-alias-label-secondary);line-height:1.55;word-break:break-word;}',
      '.sam-watchdog-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}',
      '.sam-watchdog-events{margin-top:12px;}',
      '.sam-health-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 20px;}',
      '.sam-health-row{padding:7px 0;border-bottom:1px dashed var(--dsw-alias-border-l1);min-width:0;}',
      '.sam-health-row:last-child{border-bottom:none;}',
      '.sam-health-top{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
      '.sam-health-name{font-size:12px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.sam-health-detail{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-word;}',
      '.sam-sources{display:flex;flex-direction:column;gap:10px;}',
      '.sam-source{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:9px 11px;background:var(--dsw-alias-bg-layer-2);}',
      '.sam-source-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
      '.sam-source-name{font-size:12.5px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.sam-source-detail{margin-top:3px;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-word;}',
      '.sam-repo-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
      '.sam-input{flex:1 1 240px;min-width:0;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);',
      'color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 10px;font:inherit;font-size:12.5px;}',
      '.sam-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary);}',
      '.sam-input[data-invalid="1"]{border-color:var(--dsw-alias-state-error-primary);}',
      '.sam-hint{margin-top:6px;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-word;}',
      '.sam-hint--error{color:var(--dsw-alias-state-error-primary);}',
      '.sam-repo-current{margin-bottom:8px;font-size:12px;}',
      '.sam-actions-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:9px;}',
      '.sam-pre{margin:8px 0 0;max-height:230px;overflow:auto;background:var(--dsw-alias-bg-layer-2);',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:9px 11px;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.55;',
      'white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary);}',
      '.sam-empty{padding:12px 2px;color:var(--dsw-alias-label-secondary);font-size:12px;}',
      '.sam-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px;}',
      '.sam-list li{display:flex;gap:8px;align-items:baseline;font-size:11.5px;color:var(--dsw-alias-label-secondary);}',
      '.sam-list time{font-variant-numeric:tabular-nums;flex:0 0 auto;}',
      '.sam-list .sam-list-text{min-width:0;word-break:break-word;}',
      '.sam-config{display:grid;grid-template-columns:104px minmax(0,1fr);gap:5px 12px;margin:0;font-size:11.5px;}',
      '.sam-config dt{color:var(--dsw-alias-label-secondary);}',
      '.sam-config dd{margin:0;word-break:break-all;}',
      '.sam-cmd{margin-top:8px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;',
      'background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
      'font-size:10.5px;line-height:1.5;word-break:break-all;color:var(--dsw-alias-label-secondary);}',
      '.sam-loading{display:flex;align-items:center;justify-content:center;gap:10px;padding:90px 20px;color:var(--dsw-alias-label-secondary);font-size:13px;}',
      '.sam-spinner{width:13px;height:13px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);',
      'border-radius:50%;animation:sam-spin .8s linear infinite;display:inline-block;flex:0 0 auto;}',
      '@keyframes sam-spin{to{transform:rotate(360deg);}}',
      '.sam-source-empty{font-size:12px;color:var(--dsw-alias-label-secondary);}',
      '@media (max-width:1080px){.sam-grid--main{grid-template-columns:minmax(0,1fr);}.sam-health-grid{grid-template-columns:1fr;}.sam-watchdog-grid{grid-template-columns:1fr;}}',
      '@media (max-width:760px){.sam-grid--stats{grid-template-columns:1fr;}.sam-head{flex-direction:column;}}',
      '@media (max-width:560px){.sam-watchdog-stats{grid-template-columns:1fr;}}'
    ].join('');

    /* ------------------------------------------------------------------ */
    /* Panel                                                               */
    /* ------------------------------------------------------------------ */

    function Panel(props) {
      var locale = props.locale;
      var lang = useLang(locale);
      var L = function (value) { return pick(lang, value); };

      var viewState = useState(null);
      var view = viewState[0];
      var setView = viewState[1];

      var loadingState = useState(true);
      var loading = loadingState[0];
      var setLoading = loadingState[1];

      var errorState = useState(null);
      var error = errorState[0];
      var setError = errorState[1];

      var busyState = useState('');
      var busy = busyState[0];
      var setBusy = busyState[1];

      var noticeState = useState(null);
      var notice = noticeState[0];
      var setNotice = noticeState[1];

      var repoState = useState('');
      var repoDraft = repoState[0];
      var setRepoDraft = repoState[1];

      var dirtyState = useState(false);
      var repoDirty = dirtyState[0];
      var setRepoDirty = dirtyState[1];

      var confirmState = useState(false);
      var confirmRestart = confirmState[0];
      var setConfirmRestart = confirmState[1];

      var refreshingState = useState(false);
      var refreshing = refreshingState[0];
      var setRefreshing = refreshingState[1];

      var dirtyRef = useRef(false);
      useEffect(function () {
        dirtyRef.current = repoDirty;
      }, [repoDirty]);

      var operationRunning = Boolean(view && view.operation && view.operation.running);
      var status = view ? view.status : 'unknown';
      var statusInfo = STATUS[status] || STATUS.unknown;
      var level = view ? view.level : 'idle';
      var reachable = Boolean(view && view.reachable);
      var pids = view && view.process && Array.isArray(view.process.pids) ? view.process.pids : [];
      var running = reachable || pids.length > 0;
      var startAvailable = Boolean(view && view.monitor && view.monitor.startAvailable);
      var canStart = Boolean(view) && !busy && !operationRunning && startAvailable && (status === 'stopped' || status === 'unknown');
      var canRestart = Boolean(view) && !busy && !operationRunning && startAvailable && status !== 'stopped';
      var canPause = reachable && !busy && !operationRunning && view && view.state && status !== 'starting';
      var paused = Boolean(view && view.state && view.state.paused);

      var repoValue = repoDraft.trim();
      var repoValid = REPOSITORY.test(repoValue);
      var repoCanSave = reachable && repoDirty && repoValid && !busy && !operationRunning;
      var load = view && view.state && view.state.load ? view.state.load : null;

      var watchdog = view && view.watchdog ? view.watchdog : null;
      var wdState = watchdog ? watchdogState(lang, watchdog.state) : { label: '', level: 'idle' };
      var wdBusy = busy === 'watchdog' || busy === 'watchdog-check' || busy === 'watchdog-reset';
      var wdNext = watchdog && watchdog.nextRestartAt ? new Date(watchdog.nextRestartAt).getTime() : 0;
      var wdCooling = wdNext > Date.now();

      /* Poll the host route; poll faster while a start or restart is running. */
      useEffect(function () {
        var alive = true;
        var timer = null;
        var controller = null;
        function schedule(delay) {
          if (!alive) return;
          timer = setTimeout(tick, delay);
        }
        function tick() {
          if (!alive) return;
          var local = null;
          if (typeof AbortController !== 'undefined') {
            controller = new AbortController();
            local = setTimeout(function () { try { controller.abort(); } catch (failure) { /* gone */ } }, 40000);
          }
          api('state', { signal: controller ? controller.signal : undefined }).then(function (next) {
            if (!alive) return;
            setView(next);
            setError(null);
            setLoading(false);
            if (!dirtyRef.current) setRepoDraft(next && next.repository ? next.repository : '');
            var interval = next && next.operation && next.operation.running ? 1500 : Math.max(2, next && next.autoRefreshSeconds ? next.autoRefreshSeconds : 5) * 1000;
            schedule(interval);
          }).catch(function (failure) {
            if (!alive) return;
            setError(messageOf(failure));
            setLoading(false);
            schedule(5000);
          }).finally(function () {
            if (local) clearTimeout(local);
            controller = null;
          });
        }
        tick();
        return function () {
          alive = false;
          if (timer) clearTimeout(timer);
          if (controller) {
            try { controller.abort(); } catch (failure) { /* gone */ }
          }
        };
      }, []);

      useEffect(function () {
        if (!notice) return undefined;
        var delay = notice.kind === 'error' ? 15000 : 8000;
        var id = setTimeout(function () { setNotice(null); }, delay);
        return function () { clearTimeout(id); };
      }, [notice]);

      useEffect(function () {
        if (!confirmRestart) return undefined;
        var id = setTimeout(function () { setConfirmRestart(false); }, 5000);
        return function () { clearTimeout(id); };
      }, [confirmRestart]);

      function refresh(silent) {
        if (!silent) setRefreshing(true);
        return api('state').then(function (next) {
          setView(next);
          setError(null);
          setLoading(false);
          if (!dirtyRef.current) setRepoDraft(next && next.repository ? next.repository : '');
        }).catch(function (failure) {
          setError(messageOf(failure));
        }).finally(function () {
          if (!silent) setRefreshing(false);
        });
      }

      function runService(kind) {
        if (busy) return;
        setBusy(kind);
        setNotice(null);
        setConfirmRestart(false);
        api(kind, { method: 'POST' }).then(function () {
          setNotice({ kind: 'ok', text: L(kind === 'restart' ? UI.noticeRestart : UI.noticeStart) });
          refresh(true);
        }).catch(function (failure) {
          setNotice({ kind: 'error', text: messageOf(failure) });
        }).finally(function () {
          setBusy('');
        });
      }

      function onRestart() {
        if (!confirmRestart) {
          setConfirmRestart(true);
          return;
        }
        setConfirmRestart(false);
        runService('restart');
      }

      function togglePause() {
        if (!view || !view.state || busy || operationRunning) return;
        var next = !view.state.paused;
        setBusy('pause');
        setNotice(null);
        api('pause', { method: 'POST', body: JSON.stringify({ paused: next }) }).then(function (result) {
          setNotice({
            kind: 'ok',
            text: L(result && result.paused ? UI.noticePaused : UI.noticeResumed)
          });
          refresh(true);
        }).catch(function (failure) {
          setNotice({ kind: 'error', text: messageOf(failure) });
        }).finally(function () {
          setBusy('');
        });
      }

      function saveRepository() {
        if (!repoCanSave) return;
        setBusy('repository');
        setNotice(null);
        api('repository', { method: 'POST', body: JSON.stringify({ repository: repoValue }) }).then(function (result) {
          dirtyRef.current = false;
          setRepoDirty(false);
          setRepoDraft(result && result.repository ? result.repository : repoValue);
          setNotice({
            kind: 'ok',
            text: L(result && result.unchanged ? UI.repositoryUnchanged
              : result && result.restarting ? UI.repositorySavedRestarting : UI.repositorySaved)
          });
          refresh(true);
        }).catch(function (failure) {
          var extra = failure && failure.data && failure.data.setup && failure.data.setup.detail
            ? ' (' + failure.data.setup.detail + ')' : '';
          setNotice({ kind: 'error', text: messageOf(failure) + extra });
        }).finally(function () {
          setBusy('');
        });
      }

      function onRepoChange(event) {
        var value = event.target.value;
        setRepoDraft(value);
        var current = view && view.repository ? view.repository : '';
        setRepoDirty(value.trim() !== current);
      }

      function onRepoKeyDown(event) {
        if (event.key === 'Enter') saveRepository();
      }

      function toggleWatchdog() {
        var current = view && view.watchdog;
        if (!current || busy) return;
        var next = !current.enabled;
        setBusy('watchdog');
        setNotice(null);
        api('watchdog', { method: 'POST', body: JSON.stringify({ enabled: next }) }).then(function () {
          setNotice({
            kind: 'ok',
            text: L(next ? UI.watchdogNoticeEnabled : UI.watchdogNoticeDisabled)
          });
          refresh(true);
        }).catch(function (failure) {
          setNotice({ kind: 'error', text: messageOf(failure) });
        }).finally(function () {
          setBusy('');
        });
      }

      function checkWatchdog() {
        if (busy) return;
        setBusy('watchdog-check');
        setNotice(null);
        api('watchdog/check', { method: 'POST' }).then(function () {
          setNotice({ kind: 'ok', text: L(UI.watchdogNoticeCheck) });
          refresh(true);
        }).catch(function (failure) {
          setNotice({ kind: 'error', text: messageOf(failure) });
        }).finally(function () {
          setBusy('');
        });
      }

      function resetWatchdog() {
        if (busy) return;
        setBusy('watchdog-reset');
        setNotice(null);
        api('watchdog/reset', { method: 'POST' }).then(function () {
          setNotice({ kind: 'ok', text: L(UI.watchdogNoticeReset) });
          refresh(true);
        }).catch(function (failure) {
          setNotice({ kind: 'error', text: messageOf(failure) });
        }).finally(function () {
          setBusy('');
        });
      }

      if (loading && !view) {
        return h(
          'div',
          { className: 'sam-root' },
          h('style', { key: 'sam-css' }, CSS),
          h('div', { className: 'sam-loading' }, h('span', { className: 'sam-spinner' }), L(UI.loading))
        );
      }

      var body;
      if (!view) {
        body = h(
          'div',
          { className: 'sam-page' },
          h(
            'div',
            { className: 'sam-card' },
            h('h3', { className: 'sam-card-title' }, L(UI.errorTitle)),
            h('div', { className: 'sam-empty' }, errorText(L, error)),
            h(
              'div',
              { className: 'sam-actions-row' },
              h('button', {
                type: 'button',
                className: 'sam-btn sam-btn--primary',
                onClick: function () { refresh(); }
              }, L(UI.retry))
            )
          )
        );
        return h('div', { className: 'sam-root' }, h('style', { key: 'sam-css' }, CSS), body);
      }

      var statusDetail = view.statusDetail;
      if (status === 'ready' || status === 'stopped' || status === 'unreachable' || status === 'starting' || status === 'unknown' || !statusDetail) {
        statusDetail = L(statusInfo.desc);
      }
      var setup = view.state && view.state.setup ? view.state.setup : null;
      var problem = setup && setup.problem ? setup.problem : null;
      var feishuProblem = setup && setup.feishuProblem ? setup.feishuProblem : null;
      var health = view.state && view.state.health ? view.state.health : {};
      var healthNames = Object.keys(health).sort(function (a, b) {
        if (a === 'runtime') return -1;
        if (b === 'runtime') return 1;
        return a < b ? -1 : a > b ? 1 : 0;
      });
      var sources = Array.isArray(view.sources) ? view.sources : [];
      var startProblem = view.monitor && view.monitor.startProblem ? view.monitor.startProblem : '';
      var startDisabledTitle = !startAvailable ? (startProblem || L(UI.startUnavailable))
        : running ? L(UI.alreadyRunning) : operationRunning ? L(UI.operationRunningLabel) : '';
      var restartDisabledTitle = !startAvailable ? (startProblem || L(UI.startUnavailable))
        : operationRunning ? L(UI.operationRunningLabel) : status === 'stopped' ? L(UI.start) : '';

      var operation = view.operation || null;
      var operationKindLabel = operation ? L(operation.kind === 'restart' ? UI.operationRestart : UI.operationStart) : '';
      var operationLevel = operation
        ? operation.running ? 'warn' : operation.ok ? 'ok' : 'error'
        : 'idle';
      var operationLabel = operation
        ? operation.running ? L(UI.operationRunning)
          : operation.ok ? L(UI.operationDone)
            : operation.timedOut ? L(UI.operationTimeout) : L(UI.operationFailed)
        : '';

      return h(
        'div',
        { className: 'sam-root' },
        h('style', { key: 'sam-css' }, CSS),
        h(
          'div',
          { className: 'sam-page' },
          h(
            'header',
            { className: 'sam-head' },
            h(
              'div',
              null,
              h('h2', { className: 'sam-title' }, h(PanelIcon, { size: 20 }), L(UI.title)),
              h('div', { className: 'sam-subtitle' }, L(UI.subtitle))
            ),
            h(
              'div',
              { className: 'sam-head-actions' },
              h('button', {
                type: 'button',
                className: 'sam-btn',
                disabled: refreshing,
                onClick: function () { refresh(); }
              }, refreshing ? h('span', { className: 'sam-spinner' }) : null, refreshing ? L(UI.refreshing) : L(UI.refresh))
            )
          ),

          error && view
            ? h('div', { className: 'sam-notice sam-notice--error', role: 'status' }, errorText(L, error))
            : null,

          notice
            ? h('div', { className: 'sam-notice sam-notice--' + (notice.kind === 'error' ? 'error' : 'ok'), role: 'status' }, notice.text)
            : null,

          h(
            'section',
            { className: 'sam-card' },
            h(
              'div',
              { className: 'sam-statuscard' },
              h(
                'div',
                { className: 'sam-status-main' },
                h(
                  'div',
                  { className: 'sam-status-line' },
                  h('span', { className: 'sam-dot sam-dot--' + level }),
                  h('span', null, L(statusInfo.label))
                ),
                h('div', { className: 'sam-status-detail' }, statusDetail),
                view.error && (status === 'unreachable' || status === 'unknown')
                  ? h('div', { className: 'sam-status-detail sam-mono' }, view.error)
                  : null,
                h(
                  'div',
                  { className: 'sam-status-meta' },
                  h('span', null, L(UI.endpoint) + ': ', h('span', { className: 'sam-mono' }, view.baseUrl)),
                  h('span', null, L(UI.checkedAt) + ': ' + timeText(view.checkedAt)),
                  view.latencyMs != null ? h('span', null, L(UI.latency) + ': ' + view.latencyMs + ' ms') : null,
                  view.lastSeenAt ? h('span', null, L(UI.lastSeen) + ': ' + timeText(view.lastSeenAt)) : null,
                  view.process && view.process.pids && view.process.pids.length
                    ? h('span', null, 'PID: ' + view.process.pids.join(', '))
                    : null,
                  view.process && view.process.manuallyStopped
                    ? h('span', null, L(UI.manualStop))
                    : null
                )
              ),
              h(
                'div',
                { className: 'sam-status-actions' },
                reachable
                  ? h('button', {
                    type: 'button',
                    className: 'sam-btn',
                    disabled: !canPause,
                    onClick: togglePause
                  }, paused ? L(UI.resume) : L(UI.pause))
                  : null,
                h('button', {
                  type: 'button',
                  className: 'sam-btn sam-btn--primary',
                  disabled: !canStart,
                  title: startDisabledTitle,
                  onClick: function () { runService('start'); }
                }, busy === 'start' ? h('span', { className: 'sam-spinner' }) : null, L(UI.start)),
                h('button', {
                  type: 'button',
                  className: 'sam-btn' + (confirmRestart ? ' sam-btn--danger' : ''),
                  disabled: !canRestart,
                  title: restartDisabledTitle,
                  onClick: onRestart
                }, busy === 'restart' ? h('span', { className: 'sam-spinner' }) : null,
                  confirmRestart ? L(UI.confirmRestart) : L(UI.restart))
              )
            ),
            h(
              'div',
              { className: 'sam-grid sam-grid--stats', style: { marginTop: '14px' } },
              h(Stat, {
                label: L(UI.loadWorkers),
                value: load ? String(load.running || 0) + ' / ' + String(load.maxWorkers || 0) : '—',
                sub: L(UI.loadWorkersSub)
              }),
              h(Stat, {
                label: L(UI.loadQueued),
                value: load ? String(load.queued || 0) : '—',
                sub: L(UI.loadQueuedSub)
              }),
              h(Stat, {
                label: L(UI.processing),
                value: paused ? L(UI.processingPaused) : L(UI.processingActive),
                sub: L(UI.processingSub)
              })
            )
          ),

          problem
            ? h(
              'div',
              { className: 'sam-banner sam-banner--warn' },
              h('div', { className: 'sam-banner-title' }, L(UI.setupTitle)),
              h('div', { className: 'sam-banner-body' }, problem.detail || ''),
              problem.place ? h('div', { className: 'sam-hint' }, L(UI.setupPlace) + ': ' + problem.place) : null
            )
            : null,
          feishuProblem
            ? h(
              'div',
              { className: 'sam-banner sam-banner--warn' },
              h('div', { className: 'sam-banner-title' }, L(UI.feishuProblemTitle)),
              h('div', { className: 'sam-banner-body' }, feishuProblem.detail || '')
            )
            : null,

          watchdog
            ? h(
              'section',
              { className: 'sam-card sam-watchdog' },
              h(
                'div',
                { className: 'sam-card-head' },
                h('h3', { className: 'sam-card-title' }, L(UI.watchdogTitle)),
                h(
                  'div',
                  { className: 'sam-watchdog-actions' },
                  h(Pill, { level: wdState.level }, wdState.label),
                  h('button', {
                    type: 'button',
                    className: 'sam-btn',
                    disabled: wdBusy,
                    onClick: checkWatchdog
                  }, wdBusy && busy === 'watchdog-check' ? h('span', { className: 'sam-spinner' }) : null, L(UI.watchdogCheck)),
                  h('button', {
                    type: 'button',
                    className: 'sam-btn' + (watchdog.enabled ? '' : ' sam-btn--primary'),
                    disabled: wdBusy,
                    onClick: toggleWatchdog
                  }, wdBusy && busy === 'watchdog' ? h('span', { className: 'sam-spinner' }) : null,
                    watchdog.enabled ? L(UI.watchdogDisable) : L(UI.watchdogEnable)),
                  (watchdog.blocked || watchdog.consecutiveFailures > 0 || watchdog.restartsLastHour > 0)
                    ? h('button', {
                      type: 'button',
                      className: 'sam-btn',
                      disabled: wdBusy,
                      onClick: resetWatchdog
                    }, wdBusy && busy === 'watchdog-reset' ? h('span', { className: 'sam-spinner' }) : null, L(UI.watchdogReset))
                    : null
                )
              ),
              h(
                'div',
                { className: 'sam-watchdog-grid' },
                h(
                  'div',
                  { className: 'sam-watchdog-info' },
                  h('div', { className: 'sam-hint' }, L(UI.watchdogRuleHint)),
                  h('div', { className: 'sam-watchdog-rule sam-mono' }, watchdogRuleText(lang, watchdog)),
                  watchdog.suppressUntil
                    ? h('div', { className: 'sam-hint' }, L(UI.watchdogSuppressedUntil) + ': ' + dateTimeText(watchdog.suppressUntil))
                    : null,
                  watchdog.blockedReason
                    ? h('div', { className: 'sam-hint sam-hint--error' }, L(UI.watchdogBlockedReason) + ': ' + watchdog.blockedReason)
                    : null,
                  watchdog.lastError
                    ? h('div', { className: 'sam-hint sam-hint--error' }, watchdog.lastError)
                    : null,
                  h('div', { className: 'sam-hint' }, L(UI.watchdogRuntimeHint))
                ),
                h(
                  'div',
                  { className: 'sam-watchdog-stats' },
                  h(Stat, {
                    label: L(UI.watchdogConsecutive),
                    value: String(watchdog.consecutiveFailures || 0) + ' / ' + String(watchdog.failureThreshold),
                    sub: L(UI.watchdogThreshold)
                  }),
                  h(Stat, {
                    label: L(UI.watchdogRestarts),
                    value: String(watchdog.restartsLastHour || 0) + ' / ' + String(watchdog.maxRestartsPerHour),
                    sub: L(UI.watchdogBudget)
                  }),
                  h(Stat, {
                    label: L(UI.watchdogLastCheck),
                    value: timeText(watchdog.lastCheckAt),
                    sub: watchdog.nextCheckAt
                      ? L(UI.watchdogNextCheck) + ' ' + timeText(watchdog.nextCheckAt)
                      : watchdog.enabled ? '' : L(UI.watchdogDisabledShort)
                  }),
                  h(Stat, {
                    label: L(UI.watchdogLastRestart),
                    value: watchdog.lastRestartAt ? timeText(watchdog.lastRestartAt) : L(UI.none),
                    sub: wdCooling ? L(UI.watchdogNextRestart) + ' ' + timeText(watchdog.nextRestartAt) : ''
                  })
                )
              ),
              watchdog.events && watchdog.events.length
                ? h(
                  'div',
                  { className: 'sam-watchdog-events' },
                  h('div', { className: 'sam-card-title' }, L(UI.watchdogEvents)),
                  h(
                    'ul',
                    { className: 'sam-list' },
                    watchdog.events.slice(0, 6).map(function (event, index) {
                      var eventLabel = WATCHDOG_EVENTS[event.kind] ? L(WATCHDOG_EVENTS[event.kind]) : event.kind;
                      return h(
                        'li',
                        { key: event.at + '-' + index },
                        h('time', null, timeText(event.at)),
                        h(Pill, { level: watchdogEventLevel(event.kind) }, eventLabel),
                        h('span', { className: 'sam-list-text' }, event.detail || '')
                      );
                    })
                  )
                )
                : h('div', { className: 'sam-hint', style: { marginTop: '10px' } }, L(UI.watchdogNoEvents))
            )
            : null,

          h(
            'div',
            { className: 'sam-grid sam-grid--main' },
            h(
              Card,
              { title: L(UI.healthTitle) },
              healthNames.length
                ? h(
                  'div',
                  { className: 'sam-health-grid' },
                  healthNames.map(function (name) {
                    var entry = health[name] || {};
                    var part = partState(lang, entry.state || 'unknown');
                    return h(
                      'div',
                      { className: 'sam-health-row', key: name, title: entry.detail || '' },
                      h(
                        'div',
                        { className: 'sam-health-top' },
                        h('span', { className: 'sam-health-name' }, partName(lang, name)),
                        h(Pill, { level: part.level }, part.label)
                      ),
                      h('div', { className: 'sam-health-detail' }, entry.detail || L(UI.none))
                    );
                  })
                )
                : h('div', { className: 'sam-empty' }, L(UI.healthEmpty))
            ),
            h(
              Card,
              { title: L(UI.sourcesTitle) },
              sources.length
                ? h(
                  'div',
                  { className: 'sam-sources' },
                  sources.map(function (source) {
                    var title = pick(lang, source.title) || source.id;
                    var state = sourceState(lang, source.state || 'unknown');
                    var healthPart = source.health && source.health[0] ? source.health[0] : null;
                    var stats = source.stats || null;
                    return h(
                      'div',
                      { className: 'sam-source', key: source.id || title },
                      h(
                        'div',
                        { className: 'sam-source-head' },
                        h('span', { className: 'sam-source-name' }, title),
                        h(Pill, { level: state.level }, state.label)
                      ),
                      stats
                        ? h('div', { className: 'sam-source-detail' },
                          L(UI.sourceStats), ': ', String(stats.received || 0), ' · ',
                          L(UI.sourceFiltered), ': ', String(stats.filtered || 0), ' · ',
                          L(UI.sourceLast), ' ', stats.lastAt ? timeText(stats.lastAt) : L(UI.none))
                        : null,
                      healthPart && healthPart.detail
                        ? h('div', { className: 'sam-source-detail' }, healthPart.detail)
                        : null,
                      !source.enabled ? h('div', { className: 'sam-source-detail' }, L(UI.sourceDisabled)) : null
                    );
                  })
                )
                : h('div', { className: 'sam-empty' }, view.sourcesError
                  ? L(UI.sourceDetailUnavailable) + view.sourcesError
                  : L(UI.sourcesEmpty))
            )
          ),

          h(
            'div',
            { className: 'sam-grid sam-grid--main' },
            h(
              Card,
              { title: L(UI.repositoryTitle) },
              h('div', { className: 'sam-repo-current' },
                L(UI.repositoryCurrent), ': ',
                h('span', { className: 'sam-mono' }, view.repository || L(UI.unknown))),
              h(
                'div',
                { className: 'sam-repo-row' },
                h('input', {
                  type: 'text',
                  className: 'sam-input',
                  value: repoDraft,
                  placeholder: L(UI.repositoryPlaceholder),
                  spellCheck: false,
                  'data-invalid': repoDirty && !repoValid ? '1' : '0',
                  disabled: !reachable || busy === 'repository' || operationRunning,
                  onChange: onRepoChange,
                  onKeyDown: onRepoKeyDown,
                  'aria-label': L(UI.repositoryTitle)
                }),
                h('button', {
                  type: 'button',
                  className: 'sam-btn sam-btn--primary',
                  disabled: !repoCanSave,
                  title: !reachable ? L(UI.repositoryUnreachable) : !repoValid ? L(UI.repositoryInvalid) : '',
                  onClick: saveRepository
                }, busy === 'repository' ? h('span', { className: 'sam-spinner' }) : null,
                  busy === 'repository' ? L(UI.repositorySaving) : L(UI.repositorySave))
              ),
              repoDirty && !repoValid
                ? h('div', { className: 'sam-hint sam-hint--error' }, L(UI.repositoryInvalid))
                : h('div', { className: 'sam-hint' }, reachable ? L(UI.repositoryHint) : L(UI.repositoryUnreachable))
            ),
            h(
              Card,
              { title: L(UI.operationTitle) },
              operation
                ? h(
                  'div',
                  null,
                  h(
                    'div',
                    { className: 'sam-source-head' },
                    h(
                      'div',
                      { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 } },
                      h('span', { className: 'sam-source-name' }, operationKindLabel),
                      operation.trigger === 'watchdog' ? h(Pill, { level: 'warn' }, L(UI.operationWatchdog)) : null
                    ),
                    h(Pill, { level: operationLevel }, operationLabel)
                  ),
                  h(
                    'div',
                    { className: 'sam-hint' },
                    L(UI.operationStarted), ': ', dateTimeText(operation.startedAt),
                    operation.endedAt ? ' · ' + L(UI.operationEnded) + ': ' + dateTimeText(operation.endedAt) : '',
                    operation.code != null ? ' · ' + L(UI.operationExit) + ': ' + operation.code : ''
                  ),
                  operation.output
                    ? h('pre', { className: 'sam-pre' }, operation.output)
                    : h('div', { className: 'sam-hint' }, L(UI.operationOutputEmpty))
                )
                : h('div', { className: 'sam-empty' }, L(UI.operationEmpty))
            )
          ),

          h(
            'div',
            { className: 'sam-grid sam-grid--main' },
            h(
              Card,
              { title: L(UI.historyTitle) },
              view.history && view.history.length
                ? h(
                  'ul',
                  { className: 'sam-list' },
                  view.history.slice(0, 8).map(function (entry, index) {
                    var entryStatus = STATUS[entry.status] || STATUS.unknown;
                    return h(
                      'li',
                      { key: entry.at + '-' + index },
                      h('time', null, timeText(entry.at)),
                      h(Pill, { level: entry.level || 'idle' }, L(entryStatus.label)),
                      h('span', { className: 'sam-list-text' }, entry.detail || '')
                    );
                  })
                )
                : h('div', { className: 'sam-empty' }, L(UI.historyEmpty))
            ),
            h(
              Card,
              { title: L(UI.configTitle) },
              h(
                'dl',
                { className: 'sam-config' },
                h('dt', null, L(UI.endpoint)),
                h('dd', { className: 'sam-mono' }, view.monitor.baseUrl),
                h('dt', null, L(UI.configProfile)),
                h('dd', { className: 'sam-mono' }, view.monitor.profile),
                h('dt', null, L(UI.configRunner)),
                h('dd', { className: 'sam-mono' }, view.monitor.runner + (view.monitor.wslDistro ? ' · ' + view.monitor.wslDistro : '')),
                h('dt', null, L(UI.configCheckout)),
                h('dd', { className: 'sam-mono' }, view.monitor.checkout),
                h('dt', null, L(UI.configStateDir)),
                h('dd', { className: 'sam-mono' }, view.monitor.stateDir || (view.state && view.state.setup && view.state.setup.machine ? view.state.setup.machine.stateDir : null) || L(UI.unknown)),
                h('dt', null, L(UI.configCommand)),
                h('dd', null, view.monitor.command
                  ? h('div', { className: 'sam-cmd' }, view.monitor.command)
                  : h('span', { className: 'sam-hint sam-hint--error' }, startProblem || L(UI.startUnavailable))),
                h('dt', null, L(UI.configWatchdogCommand)),
                h('dd', null, view.monitor.watchdogCommand
                  ? h('div', { className: 'sam-cmd' }, view.monitor.watchdogCommand)
                  : h('span', { className: 'sam-hint' }, L(UI.none)))
              )
            )
          )
        )
      );
    }

    /* ------------------------------------------------------------------ */
    /* Plugin                                                              */
    /* ------------------------------------------------------------------ */

    return {
      inject: ['slots'],
      apply: function (ctx) {
        var locale = typeof ctx.get === 'function' ? ctx.get('locale') : undefined;
        ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 30,
              label: function () {
                return pick(liveLang(locale), UI.title);
              }
            },
            PanelIcon
          );
        });
        ctx.slots.inject('main', function () {
          return ctx.slots.register(
            { name: 'main', key: PANEL_ID },
            function MainPanel() {
              return h(Panel, { locale: locale });
            }
          );
        });
      }
    };
  }
});
