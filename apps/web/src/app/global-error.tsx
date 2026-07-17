'use client';

import { ErrorScreen } from '@/components/error-screen';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="ru"><body><ErrorScreen code="500" title="Что-то пошло не так" message="Страница временно недоступна. Попробуйте повторить попытку или вернуться на главную." onRetry={reset} /></body></html>;
}
