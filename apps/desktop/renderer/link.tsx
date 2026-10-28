import type { AnchorHTMLAttributes } from 'react';
export default function Link({ href, prefetch: _prefetch, replace: _replace, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean; replace?: boolean }) {
  const target = href === '/?loja=1' ? `${window.__BARBACUE_API_ORIGIN__}/?loja=1` : href;
  return <a href={target} {...props} />;
}
