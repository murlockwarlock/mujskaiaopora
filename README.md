# Мужская опора

Платформа психологической поддержки и общения для мужчин.

## Возможности

- регистрация, сессии и восстановление доступа;
- профиль, интересы, языки, часовой пояс и аватар;
- рекомендации собеседников;
- личные и групповые чаты в реальном времени;
- аудио- и видеовстречи через LiveKit;
- уведомления о сообщениях и входящих звонках;
- жалобы, модерация и аудит действий.

## Технологии

- Next.js, React, TypeScript;
- NestJS, Prisma, PostgreSQL;
- Socket.IO и Redis;
- LiveKit и coturn;
- S3-совместимое хранилище для аватаров.

## Локальная разработка

1. Скопируйте `infra/compose/.env.example` в `.env` и заполните значения.
2. Установите зависимости: `npm install`.
3. Сгенерируйте Prisma Client: `npm run prisma:generate --workspace=@mujskaiaopora/api`.
4. После запуска PostgreSQL создайте миграцию: `npm run prisma:migrate --workspace=@mujskaiaopora/api`.
5. Запустите API: `npm run dev:api`.
6. В другом терминале запустите web: `npm run dev:web`.

## Проверка

```bash
npm run build --workspace=@mujskaiaopora/api
npm run build --workspace=@mujskaiaopora/web
```

## Лицензия

Проект распространяется по лицензии [MIT](LICENSE).
