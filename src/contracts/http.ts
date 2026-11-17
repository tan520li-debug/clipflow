export const ADMIN_TOKEN_HEADER = 'x-clipflow-token';

export const MISSING_ADMIN_TOKEN_MESSAGE = '请先在顶栏填写访问令牌。';

export const UI_LANG_HEADER = 'x-clipflow-lang';

export interface ApiErrorBody {
  error: string;
}
