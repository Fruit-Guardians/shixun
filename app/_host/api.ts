import { env } from 'cloudflare:workers';
import { createApiHandler } from '#api';
import type { ApiEnv } from '#api';
import type { Report } from '#shared';
import seeds from '@/data/seed-reports.json';

/**
 * 宿主（Vinext / Cloudflare Worker）与 API 包之间的唯一接线处：
 * 注入运行时绑定和随代码发布的历史日报。业务逻辑全部在 packages/api。
 */
const handler = createApiHandler({ seedReports: seeds as Report[] });

/** 浏览器请求（/api/* 路由）。 */
export function handleApiRequest(request: Request): Promise<Response> {
  return handler(request, env as unknown as ApiEnv);
}

/** 服务端渲染时在进程内调用同一个 API，避免绕一圈 HTTP；返回的就是浏览器会收到的响应。 */
export function callApi(path: string): Promise<Response> {
  return handleApiRequest(new Request(new URL(path, 'http://internal.invalid')));
}
