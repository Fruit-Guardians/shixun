/** 拾讯 Drive 同步器：纯 JavaScript，不调用任何 AI 模型。 */
const CONFIG = Object.freeze({
  folderId: '1K0N3bIvwxE8x38BKc9vVeKxqqDdlGjpT',
  siteUrl: 'https://daily-tech-observer.breezy-spool-0232.chatgpt.site',
  maxBytes: 500000,
  maxRunMs: 240000,
  maxFailures: 10,
});

/** 首次手动运行：同步通过后安装一个每 15 分钟执行的 Google 定时触发器。 */
function installSync() {
  const result = syncDriveReports();
  if (result.skipped) throw new Error('另一轮同步正在运行，请稍后重试安装。');
  if (result.failed) throw new Error('有文件同步失败，请先查看执行日志；暂未安装定时器。');
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncDriveReports');
  if (!triggers.length) ScriptApp.newTrigger('syncDriveReports').timeBased().everyMinutes(15).create();
  recordRun_(PropertiesService.getScriptProperties().getProperty('SITE_SERVICE_TOKEN'), result);
  console.log(JSON.stringify({installed: true, intervalMinutes: 15, ...result}));
}

function syncDriveReports() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {skipped: 'another_run_in_progress'};
  const started = Date.now();
  const props = PropertiesService.getScriptProperties();
  const result = {created: 0, updated: 0, unchanged: 0, failed: 0, failures: []};
  try {
    const access = props.getProperty('SITE_SERVICE_TOKEN');
    if (!access) throw new Error('请先在脚本属性设置 SITE_SERVICE_TOKEN。不要把凭证写进源代码或日志。');
    const cursor = props.getProperty('DRIVE_SCAN_CURSOR');
    let files;
    try { files = cursor ? DriveApp.continueFileIterator(cursor) : DriveApp.getFolderById(CONFIG.folderId).getFiles(); }
    catch (_) { props.deleteProperty('DRIVE_SCAN_CURSOR'); files = DriveApp.getFolderById(CONFIG.folderId).getFiles(); }
    while (files.hasNext()) {
      if (Date.now() - started > CONFIG.maxRunMs) { props.setProperty('DRIVE_SCAN_CURSOR', files.getContinuationToken()); break; }
      const file = files.next();
      if (!/\.md(?:\.txt)?$|\.markdown$/i.test(file.getName())) continue;
      const key = 'FILE_' + file.getId();
      const stamp = file.getLastUpdated().toISOString() + ':' + file.getSize();
      if (props.getProperty(key) === stamp) { result.unchanged++; continue; }
      try {
        if (file.getSize() > CONFIG.maxBytes) throw new Error('Markdown 超过 500 KB。');
        const raw = file.getBlob().getDataAsString('UTF-8');
        const date = extractReportDate_(file.getName(), raw);
        const topic = /安全专题/.test(file.getName()) ? '安全专题' : '全球技术社区';
        const hash = sha256_(raw);
        const record = siteRequest_('/api/sync', 'post', access, {raw, date, topic, sourceFileId: file.getId(), transport: 'google-apps-script', sourceModifiedAt: file.getLastUpdated().toISOString()});
        if (!record.id || record.hash !== hash) throw new Error('写入结果摘要不匹配。');
        const readback = siteRequest_('/api/reports/' + encodeURIComponent(record.id), 'get', access);
        if (readback !== raw || sha256_(readback) !== hash) throw new Error('全文回读不一致。');
        props.setProperty(key, stamp);
        result[record.status === 'created' ? 'created' : record.status === 'updated' ? 'updated' : 'unchanged']++;
      } catch (e) {
        const reason = String(e.message || '未知错误');
        result.failed++;
        // 失败明细随回执上报，站点同步面板直接列出；超过上限的只计数。
        if (result.failures.length < CONFIG.maxFailures) result.failures.push({fileId: file.getId(), name: file.getName().slice(0, 200), reason: reason.slice(0, 300)});
        console.error('文件 ' + file.getId() + ' 同步失败：' + reason);
      }
      if (Date.now() - started > CONFIG.maxRunMs) { props.setProperty('DRIVE_SCAN_CURSOR', files.getContinuationToken()); break; }
    }
    if (!files.hasNext()) props.deleteProperty('DRIVE_SCAN_CURSOR');
    props.setProperty('LAST_RUN', JSON.stringify({at: new Date().toISOString(), ...result}));
    recordRun_(access, result);
    console.log(JSON.stringify(result));
    return result;
  } finally { lock.releaseLock(); }
}

function siteRequest_(path, method, token, payload) {
  // 禁止重定向，避免把站点凭证转发给其他域名。
  const options = {method, headers: {'OAI-Sites-Authorization': 'Bearer ' + token, 'X-Sites-Report-Sync': 'google-apps-script'}, followRedirects: false, muteHttpExceptions: true};
  if (payload) { options.contentType = 'application/json'; options.payload = JSON.stringify(payload); }
  const response = UrlFetchApp.fetch(CONFIG.siteUrl + path, options);
  const code = response.getResponseCode();
  if (code !== 200) throw new Error('站点返回 HTTP ' + code + '：' + siteErrorMessage_(response, code));
  return method === 'get' ? response.getContentText('UTF-8') : JSON.parse(response.getContentText('UTF-8'));
}

/** 站点的错误体是 {error}，可直接展示；拿不到时按状态码给出排查方向。 */
function siteErrorMessage_(response, code) {
  try {
    const body = JSON.parse(response.getContentText('UTF-8'));
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch (_) { /* 非 JSON（如入口拦截页） */ }
  return code === 401 || code === 403 ? '凭证或访问范围可能需要检查。' : '请稍后重试。';
}

function extractReportDate_(name, raw) {
  const filenameDate = name.match(/20\d{2}-\d{2}-\d{2}/);
  const titleLine = raw.split(/\r?\n/).find(line => /^\s*#\s+/.test(line)) || raw.split(/\r?\n/).find(line => line.trim()) || '';
  const bodyDate = titleLine.match(/20\d{2}-\d{2}-\d{2}/);
  if (filenameDate && bodyDate && filenameDate[0] !== bodyDate[0]) throw new Error('文件名与正文内容日期不一致。');
  const date = (bodyDate || filenameDate || [])[0];
  if (!date || new Date(date + 'T00:00:00Z').toISOString().slice(0,10) !== date) throw new Error('未找到有效内容日期。');
  if (raw.trim().length < 100) throw new Error('正文过短，疑似摘要或不完整文件。');
  return date;
}

function sha256_(raw) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

/** 只删除本项目中属于本同步器的定时触发器。 */
function disableSync() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncDriveReports').forEach(t => ScriptApp.deleteTrigger(t));
  const access = PropertiesService.getScriptProperties().getProperty('SITE_SERVICE_TOKEN');
  if (access) recordRun_(access, {created:0,updated:0,unchanged:0,failed:0,failures:[]});
  console.log('拾讯自动同步已停用；其他脚本与触发器保持不变。');
}

function recordRun_(access, result) {
  const triggerInstalled = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'syncDriveReports');
  siteRequest_('/api/sync/status', 'post', access, {triggerInstalled, checkedAt: new Date().toISOString(), ...result});
}
