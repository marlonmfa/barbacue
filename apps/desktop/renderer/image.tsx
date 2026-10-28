import type { ImgHTMLAttributes } from 'react';
export default function Image({ fill, priority: _priority, preload: _preload, unoptimized: _unoptimized, quality: _quality, sizes, style, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean; preload?: boolean; unoptimized?: boolean; quality?: number }) {
  return <img {...props} sizes={sizes} style={fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style } : style} />;
}
