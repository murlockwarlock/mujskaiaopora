import type { Metadata } from 'next';
import './styles.css';
import { PwaRegistration } from './pwa-registration';

export const metadata: Metadata = {
  title: 'Мужская опора',
  description: 'Сообщество для общения и поддержки',
  applicationName: 'Мужская опора',
  appleWebApp: { capable: true, title: 'Мужская опора', statusBarStyle: 'default' }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body suppressHydrationWarning><PwaRegistration />{children}</body>
    </html>
  );
}
