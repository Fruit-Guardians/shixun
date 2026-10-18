/**
 * 对运行中站点的只读冒烟检查：不写入任何数据，可以放心对开发站或线上站运行。
 *
 *   npm run smoke                                  # 默认 http://127.0.0.1:5173
 *   SMOKE_BASE_URL=https://example.site npm run smoke
 *
 * 线上站点在私有入口后面时，未登录请求可能被入口拦下：拒绝类检查只要求「不是 2xx」，
 * 读取类检查需要能直接访问 /api/*。列表读取失败（例如迁移未执行导致 503）会直接报出响应内容。
 */
const base = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');
const results = [];

async function call(path, init = {}) {
  const response = await fetch(base + path, { redirect: 'manual', ...init });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // 非 JSON（原文下载或入口拦截页）
  }
  return { status: response.status, headers: response.headers, text, json };
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const brief = (res) => `HTTP ${res.status} ${res.text.slice(0, 200)}`;
const enc = encodeURIComponent;

let list = null;

await check('health 返回 ok 与数据库绑定', async () => {
  const res = await call('/api/health');
  expect(res.status === 200 && res.json?.ok === true, brief(res));
  expect(res.json.database === true, '数据库未绑定');
});

await check('归档列表可读、不缓存、不含原文', async () => {
  const res = await call('/api/reports');
  expect(res.status === 200, brief(res));
  expect(res.headers.get('cache-control') === 'private, no-store', `cache-control: ${res.headers.get('cache-control')}`);
  expect(Array.isArray(res.json?.reports) && res.json.reports.length > 0, '归档为空');
  expect(res.json.reports.every((r) => !('raw' in r) && Number.isInteger(r.chars) && Array.isArray(r.stories)), '列表项格式不对');
  list = res.json;
});

const first = () => {
  expect(list, '归档列表不可用，跳过');
  return list.reports[0];
};

await check('原文下载与列表字数一致', async () => {
  const report = first();
  const res = await call(`/api/reports/${enc(report.id)}`);
  expect(res.status === 200, brief(res));
  expect(/text\/markdown/.test(res.headers.get('content-type') ?? ''), `content-type: ${res.headers.get('content-type')}`);
  expect(res.text.length === report.chars, `字数 ${res.text.length} ≠ 列表 ${report.chars}`);
});

await check('版本历史可读', async () => {
  const report = first();
  const res = await call(`/api/reports/${enc(report.id)}/versions`);
  expect(res.status === 200, brief(res));
  expect(res.json?.reportId === report.id && Array.isArray(res.json.versions) && typeof res.json.stored === 'boolean', '版本响应格式不对');
});

await check('全文搜索命中条目标题', async () => {
  const story = list?.reports.flatMap((r) => r.stories).find((s) => s.title.length >= 4);
  expect(story, '没有可用来搜索的条目');
  const q = story.title.slice(0, 4);
  const res = await call(`/api/search?${new URLSearchParams({ q })}`);
  expect(res.status === 200 && Array.isArray(res.json?.storyIds), brief(res));
  expect(res.json.storyIds.includes(story.id), `「${q}」没有命中 ${story.id}`);
  expect((await call(`/api/search?${new URLSearchParams({ q: 'x'.repeat(101) })}`)).status === 400, '超长搜索词应为 400');
});

await check('同步状态可读', async () => {
  const res = await call('/api/sync/status');
  expect(res.status === 200 && res.json?.mode === 'google-apps-script', brief(res));
  expect(Array.isArray(res.json.failures), '缺少 failures（迁移 0004 是否已执行？）');
});

await check('未知路径 404、错误方法 405', async () => {
  expect((await call('/api/nope')).status === 404, '未知路径应为 404');
  const res = await call('/api/health', { method: 'PUT' });
  expect(res.status === 405 && res.headers.get('allow') === 'GET', brief(res));
});

await check('未授权的写操作全部被拒绝', async () => {
  const json = { 'content-type': 'application/json' };
  const report = list?.reports[0]?.id ?? 'missing';
  const attempts = [
    ['导入（未登录）', '/api/reports', { method: 'POST', headers: json, body: '{}' }],
    ['导入（跨站）', '/api/reports', { method: 'POST', headers: { ...json, origin: 'https://evil.example' }, body: '{}' }],
    ['同步（浏览器来源）', '/api/sync', { method: 'POST', headers: { ...json, origin: base, 'x-sites-report-sync': 'google-apps-script' }, body: '{}' }],
    ['同步回执（无协议头）', '/api/sync/status', { method: 'POST', headers: json, body: '{}' }],
    ['取回凭证（跨站）', '/api/integration/setup-credential', { method: 'POST', headers: { origin: 'https://evil.example' } }],
    ['删除（未登录）', `/api/reports/${enc(report)}`, { method: 'DELETE', headers: { origin: base } }],
    ['删除（跨站）', `/api/reports/${enc(report)}`, { method: 'DELETE', headers: { origin: 'https://evil.example' } }],
    ['恢复版本（未登录）', `/api/reports/${enc(report)}/versions/none/restore`, { method: 'POST', headers: { origin: base } }],
  ];
  const accepted = [];
  for (const [name, path, init] of attempts) {
    const res = await call(path, init);
    if (res.status >= 200 && res.status < 300) accepted.push(`${name} → ${res.status}`);
  }
  expect(accepted.length === 0, `被放行：${accepted.join('；')}`);
});

for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n    ${r.error}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${base}：${results.length - failed}/${results.length} 项通过`);
process.exitCode = failed ? 1 : 0;
