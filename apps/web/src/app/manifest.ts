import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Мужская опора',
    short_name: 'Опора',
    description: 'Сообщество для общения и поддержки',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8f5f0',
    theme_color: '#24462f',
    lang: 'ru',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
  };
}
