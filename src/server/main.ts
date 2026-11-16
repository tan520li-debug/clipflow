import 'dotenv/config';

const proxy =
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy;
if (proxy && !process.env.NODE_USE_ENV_PROXY) {
  process.env.NODE_USE_ENV_PROXY = '1';
}

const { startServer } = await import('./app.ts');
startServer();
