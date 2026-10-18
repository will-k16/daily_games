// The site is now WK Game Suite at wk-game-suite.pages.dev, with Summit at /summit. The two older
// Cloudflare projects (just-right and summit-daily) still build from this repo, so they send every
// request there with a 301: game paths keep their path and query, and the old home page goes to /summit.
const OLD = ['just-right.pages.dev', 'summit-daily.pages.dev'], NEW = 'wk-game-suite.pages.dev';
const SUMMIT_HOME = ['/', '/index.html', '/summit.html'];

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (OLD.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    const to = new URL(url);
    to.protocol = 'https:';
    to.hostname = NEW;
    to.port = '';
    if (SUMMIT_HOME.includes(url.pathname)) to.pathname = '/summit';
    return Response.redirect(to.toString(), 301);
  }
  return next();
}
