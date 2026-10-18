import fs from 'node:fs';
import { createApiHandler } from '#api';
import type { ApiEnv } from '#api';
import type { Report } from '#shared';
import { createTestD1 } from './d1.ts';

export const ORIGIN = 'https://site.test';
export const seeds: Report[] = JSON.parse(fs.readFileSync(new URL('../../../data/seed-reports.json', import.meta.url), 'utf8'));
export const sampleRaw = seeds[0].raw;
export const USER_HEADERS = { 'oai-authenticated-user-id': 'u1', 'oai-authenticated-user-email': 'owner@example.com' };
export const PROGRAM_HEADERS = { 'x-sites-report-sync': 'google-apps-script', 'content-type': 'application/json' };

export interface HarnessOptions {
  withSeeds?: boolean;
  /** 固定或可推进的时钟；默认真实时间。 */
  now?: () => Date;
}

export function createHarness(env: Partial<ApiEnv> = {}, { withSeeds = true, now }: HarnessOptions = {}) {
  const DB = createTestD1();
  const handle = createApiHandler({ seedReports: withSeeds ? seeds : [], now });
  const fullEnv: ApiEnv = { DB, ...env };
  return {
    DB,
    call(path: string, init: RequestInit & { json?: unknown } = {}) {
      const { json, ...rest } = init;
      const headers = new Headers(rest.headers);
      if (json !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
      return handle(new Request(ORIGIN + path, { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body }), fullEnv);
    },
    callWithoutDb(path: string, init: RequestInit = {}) {
      return handle(new Request(ORIGIN + path, init), { ...fullEnv, DB: undefined });
    },
  };
}
