const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const profiles = [
  { slug: 'alexey', image: 12, email: 'test.alexey@mujskaiaopora.local', displayName: 'Алексей', city: 'Алматы', timeZone: 'Asia/Almaty', bio: 'Работаю в продуктовой команде, люблю бег и разговоры о том, как не выгорать.', languages: ['Русский', 'Казахский'], interests: ['Работа', 'Спорт', 'Саморазвитие'] },
  { slug: 'maksim', image: 15, email: 'test.maksim@mujskaiaopora.local', displayName: 'Максим', city: 'Москва', timeZone: 'Europe/Moscow', bio: 'Недавно переехал и ищу людей, с которыми можно говорить честно и по делу.', languages: ['Русский', 'Английский'], interests: ['Переезд', 'Общение', 'Книги'] },
  { slug: 'timur', image: 20, email: 'test.timur@mujskaiaopora.local', displayName: 'Тимур', city: 'Астана', timeZone: 'Asia/Almaty', bio: 'Люблю фотографию, горы и спокойные разговоры после насыщенного дня.', languages: ['Русский', 'Казахский'], interests: ['Фотография', 'Путешествия', 'Дружба'] },
  { slug: 'artem', image: 24, email: 'test.artem@mujskaiaopora.local', displayName: 'Артём', city: 'Санкт-Петербург', timeZone: 'Europe/Moscow', bio: 'Предприниматель, учусь выстраивать баланс между делами, близкими и собой.', languages: ['Русский'], interests: ['Бизнес', 'Отношения', 'Психология'] },
  { slug: 'danil', image: 31, email: 'test.danil@mujskaiaopora.local', displayName: 'Данил', city: 'Ташкент', timeZone: 'Asia/Tashkent', bio: 'Играю в баскетбол и ищу новые темы, людей и городские маршруты.', languages: ['Русский', 'Узбекский'], interests: ['Спорт', 'Музыка', 'Общение'] },
  { slug: 'nikita', image: 37, email: 'test.nikita@mujskaiaopora.local', displayName: 'Никита', city: 'Новосибирск', timeZone: 'Asia/Novosibirsk', bio: 'Разработчик. Нравятся походы, настольные игры и разговоры без лишнего шума.', languages: ['Русский', 'Английский'], interests: ['IT', 'Походы', 'Игры'] },
  { slug: 'ilya', image: 42, email: 'test.ilya@mujskaiaopora.local', displayName: 'Илья', city: 'Екатеринбург', timeZone: 'Asia/Yekaterinburg', bio: 'Хочу расширить круг общения и найти тех, с кем совпадают взгляды на жизнь.', languages: ['Русский'], interests: ['Дружба', 'Фильмы', 'Саморазвитие'] },
  { slug: 'sergey', image: 48, email: 'test.sergey@mujskaiaopora.local', displayName: 'Сергей', city: 'Караганда', timeZone: 'Asia/Almaty', bio: 'Люблю готовить, ездить за город и обсуждать то, что действительно волнует.', languages: ['Русский', 'Казахский'], interests: ['Семья', 'Кулинария', 'Природа'] },
  { slug: 'roman', image: 54, email: 'test.roman@mujskaiaopora.local', displayName: 'Роман', city: 'Минск', timeZone: 'Europe/Minsk', bio: 'Занимаюсь дизайном, слушаю джаз и ценю хорошее человеческое общение.', languages: ['Русский', 'Английский'], interests: ['Дизайн', 'Музыка', 'Общение'] },
  { slug: 'evgeny', image: 61, email: 'test.evgeny@mujskaiaopora.local', displayName: 'Евгений', city: 'Бишкек', timeZone: 'Asia/Bishkek', bio: 'Стараюсь больше двигаться, читать и не оставаться один на один со сложными мыслями.', languages: ['Русский', 'Киргизский'], interests: ['Здоровье', 'Книги', 'Поддержка'] }
];

const password = process.env.TEST_PROFILE_PASSWORD;

if (!password) throw new Error('TEST_PROFILE_PASSWORD is required');

const storage = new S3Client({
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
  region: process.env.OBJECT_STORAGE_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY
  }
});

const prisma = new PrismaClient();

async function uploadAvatar(profile) {
  const response = await fetch(`https://randomuser.me/api/portraits/men/${profile.image}.jpg`);
  if (!response.ok) throw new Error(`Cannot download avatar for ${profile.slug}`);
  const objectKey = `avatars/test-profiles/${profile.slug}.jpg`;
  await storage.send(new PutObjectCommand({
    Bucket: process.env.OBJECT_STORAGE_BUCKET,
    Key: objectKey,
    Body: Buffer.from(await response.arrayBuffer()),
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=3600'
  }));
  return objectKey;
}

async function run() {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  for (const profile of profiles) {
    const avatarKey = await uploadAvatar(profile);
    await prisma.user.upsert({
      where: { email: profile.email },
      create: {
        email: profile.email,
        passwordHash,
        displayName: profile.displayName,
        profile: {
          create: {
            city: profile.city,
            timeZone: profile.timeZone,
            bio: profile.bio,
            languages: profile.languages,
            interests: profile.interests,
            completedAt: new Date(),
            avatarKey
          }
        }
      },
      update: {
        displayName: profile.displayName,
        profile: {
          upsert: {
            create: {
              city: profile.city,
              timeZone: profile.timeZone,
              bio: profile.bio,
              languages: profile.languages,
              interests: profile.interests,
              completedAt: new Date(),
              avatarKey
            },
            update: {
              city: profile.city,
              timeZone: profile.timeZone,
              bio: profile.bio,
              languages: profile.languages,
              interests: profile.interests,
              completedAt: new Date(),
              avatarKey
            }
          }
        }
      }
    });
  }
}

run()
  .then(() => console.log(`Seeded ${profiles.length} test profiles`))
  .finally(() => prisma.$disconnect());
