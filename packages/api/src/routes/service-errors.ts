import { ValidationError } from '#shared';
import { HttpError } from '../http.ts';
import { ReadbackMismatchError } from '../services/reports.ts';

/**
 * 把业务层错误映射为 HTTP：校验失败 400；回读不一致 503（可重试）；
 * 其它一律记录日志后返回 503 与 fallback 文案，不把内部细节交给调用方。
 */
export async function mapServiceErrors<T>(label: string, fallback: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ValidationError) throw new HttpError(400, error.message);
    if (error instanceof ReadbackMismatchError) throw new HttpError(503, error.message);
    console.error(`${label} failed`, error);
    throw new HttpError(503, fallback);
  }
}
