'use client';

import { ErrorScreen } from '@/components/error-screen';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen code="500" title="Не удалось открыть страницу" message="Попробуйте ещё раз. Если ошибка повторится, вернитесь на главную." onRetry={reset} />;
}
