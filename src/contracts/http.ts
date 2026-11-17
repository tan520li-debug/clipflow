export const ADMIN_TOKEN_HEADER = 'x-clipflow-token';

export const MISSING_ADMIN_TOKEN_MESSAGE = '请先在顶栏填写访问令牌。';

export const UI_LANG_HEADER = 'x-clipflow-lang';

/** Default server job deadline, measured from when that job starts running. */
export const JOB_DEADLINE_MS = 15 * 60 * 1000;

/** Default queue cap, including the one job that is running. */
export const JOB_QUEUE_MAX = 8;

export interface ApiErrorBody {
  error: string;
}
