import { ErrorScreen } from '@/components/error-screen';

export default function NotFound() {
  return <ErrorScreen code="404" title="Страница не найдена" message="Возможно, ссылка устарела или страница была перемещена." />;
}
