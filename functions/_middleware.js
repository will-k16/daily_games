// The game moved from just-right.pages.dev to summit-daily.pages.dev. Both Cloudflare projects build
// from this repo, so the old one sends every request (same path and query) to the new address.
const OLD = 'just-right.pages.dev', NEW = 'summit-daily.pages.dev';

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === OLD || url.hostname.endsWith('.' + OLD)) {
    url.hostname = NEW;
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
