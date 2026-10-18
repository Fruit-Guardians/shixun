import { handleApiRequest } from '../../_host/api';

/** 所有 /api/* 请求交给 API 包；这里不含业务逻辑。 */
export const dynamic = 'force-dynamic';

export {
  handleApiRequest as GET,
  handleApiRequest as POST,
  handleApiRequest as PUT,
  handleApiRequest as PATCH,
  handleApiRequest as DELETE,
  handleApiRequest as OPTIONS,
};
