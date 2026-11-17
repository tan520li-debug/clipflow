export const ADMIN_TOKEN_HEADER = 'x-clipflow-token';

export const MISSING_ADMIN_TOKEN_MESSAGE = '请先在顶栏填写访问令牌。';

export const UI_LANG_HEADER = 'x-clipflow-lang';

/** Default server job deadline. The page polls until this window plus one interval. */
export const JOB_DEADLINE_MS = 15 * 60 * 1000;

export interface ApiErrorBody {
  error: string;
}
