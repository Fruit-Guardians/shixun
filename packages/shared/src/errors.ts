/** 用户输入不合法：可以安全地把 message 原样返回给调用方。 */
export class ValidationError extends Error {
  override readonly name = 'ValidationError';
}
