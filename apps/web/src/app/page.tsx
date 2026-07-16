'use client';

import { Dispatch, FormEvent, SetStateAction, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { io } from 'socket.io-client';
import { api, Session } from '@/lib/api';
import { formatDateTime } from '@/lib/date-time';
import { playSound } from '@/lib/sounds';

type Profile = {
  id: string;
  bio: string;
  city: string | null;
  timeZone: string;
  languages: string[];
  interests: string[];
  avatarUrl: string | null;
  messageSoundEnabled: boolean;
  callSoundEnabled: boolean;
  browserNotificationsEnabled: boolean;
  user: { id: string; displayName: string };
};

type Recommendation = {
  id: string;
  displayName: string;
  profile: { city: string | null; bio: string; languages: string[]; interests: string[]; avatarUrl: string | null } | null;
};

type Conversation = {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string | null;
  members: { user: { id: string; displayName: string } }[];
  messages: { body: string; sender: { displayName: string } }[];
};

type Message = {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; displayName: string };
};

type View = 'home' | 'messages' | 'calls' | 'profile' | 'admin';
type IncomingCall = { roomId: string; title: string; callerId: string };

export default function Page() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [view, setView] = useState<View>('home');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void restore();
  }, []);

  async function restore(): Promise<void> {
    if (!(await api.refresh())) {
      setLoading(false);
      return;
    }
    const [user, nextProfile, nextRecommendations, nextConversations] = await Promise.all([
      api.request<Profile['user'] & { email: string; role: string }>('auth/me'),
      api.request<Profile>('profile'),
      api.request<Recommendation[]>('matching/recommendations'),
      api.request<Conversation[]>('conversations')
    ]);
    setSession({ accessToken: '', user });
    setProfile(nextProfile);
    void synchronizeTimeZone(nextProfile);
    setRecommendations(nextRecommendations);
    setConversations(nextConversations);
    setLoading(false);
  }

  async function completeAuthentication(nextSession: Session): Promise<void> {
    setSession(nextSession);
    const [nextProfile, nextRecommendations, nextConversations] = await Promise.all([
      api.request<Profile>('profile'),
      api.request<Recommendation[]>('matching/recommendations'),
      api.request<Conversation[]>('conversations')
    ]);
    setProfile(nextProfile);
    void synchronizeTimeZone(nextProfile);
    setRecommendations(nextRecommendations);
    setConversations(nextConversations);
  }

  async function openConversation(conversation: Conversation): Promise<void> {
    const result = await api.request<{ items: Message[] }>(`conversations/${conversation.id}/messages`);
    setSelectedConversation(conversation);
    setMessages(result.items);
    setView('messages');
  }

  async function startConversation(userId: string): Promise<void> {
    const conversation = await api.request<Conversation>('conversations/direct', { method: 'POST', body: JSON.stringify({ userId }) });
    setConversations((current) => (current.some((item) => item.id === conversation.id) ? current : [conversation, ...current]));
    await openConversation(conversation);
  }

  async function synchronizeTimeZone(currentProfile: Profile): Promise<void> {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone || currentProfile.timeZone === timeZone) return;
    const updated = await api.request<Profile>('profile', { method: 'PATCH', body: JSON.stringify({ timeZone }) });
    setProfile(updated);
  }

  if (loading) return <main className="loading">Загружаем пространство…</main>;
  if (!session) return <AuthScreen onAuthenticated={completeAuthentication} />;

  return (
    <Dashboard
      session={session}
      profile={profile}
      recommendations={recommendations}
      conversations={conversations}
      selectedConversation={selectedConversation}
      messages={messages}
      view={view}
      notice={notice}
      onView={setView}
      onProfile={setProfile}
      onNotice={setNotice}
      onStartConversation={startConversation}
      onOpenConversation={openConversation}
      onMessages={setMessages}
      onLogout={async () => {
        await api.logout();
        setSession(null);
        setProfile(null);
      }}
    />
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: Session) => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const session = mode === 'register'
        ? await api.register({ email: String(data.get('email')), password: String(data.get('password')), displayName: String(data.get('displayName')) })
        : await api.login({ email: String(data.get('email')), password: String(data.get('password')) });
      await onAuthenticated(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-copy"><div className="brand-mark">◡</div><p className="eyebrow">Безопасное сообщество</p><h1>Здесь можно говорить открыто</h1><p>Находите собеседников с похожим опытом. Без оценок, давления и коммерческих предложений.</p></section>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-tabs"><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Регистрация</button><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Войти</button></div>
        {mode === 'register' && <Field label="Как к вам обращаться" name="displayName" minLength={2} required />}
        <Field label="E-mail" name="email" type="email" required />
        <Field label="Пароль" name="password" type="password" minLength={12} required />
        {error && <p className="form-error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Подождите…' : mode === 'register' ? 'Создать профиль' : 'Войти'}</button>
        <PasswordReset />
      </form>
    </main>
  );
}

function PasswordReset() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('resetEmail'));
    await api.request('auth/password-reset/request', { method: 'POST', authenticated: false, body: JSON.stringify({ email }) });
    setMessage('Если адрес зарегистрирован, письмо уже отправлено.');
  }

  return open ? <form className="reset-form" onSubmit={submit}><input name="resetEmail" type="email" placeholder="Ваш e-mail" required /><button className="text-button">Отправить ссылку</button>{message && <small>{message}</small>}</form> : <button className="text-button" type="button" onClick={() => setOpen(true)}>Не помню пароль</button>;
}

function Dashboard(props: {
  session: Session;
  profile: Profile | null;
  recommendations: Recommendation[];
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  messages: Message[];
  view: View;
  notice: string;
  onView: (view: View) => void;
  onProfile: (profile: Profile | null) => void;
  onNotice: (notice: string) => void;
  onStartConversation: (userId: string) => Promise<void>;
  onOpenConversation: (conversation: Conversation) => Promise<void>;
  onMessages: Dispatch<SetStateAction<Message[]>>;
  onLogout: () => Promise<void>;
}) {
  const { session, profile, recommendations, conversations, selectedConversation, messages, view } = props;
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [acceptedRoomId, setAcceptedRoomId] = useState<string | null>(null);
  const displayName = profile?.user.displayName ?? session.user.displayName;
  useEffect(() => {
    const token = api.getAccessToken();
    const endpoint = process.env.NEXT_PUBLIC_API_URL;
    if (!token || !endpoint) return;
    const socket = io(endpoint, { auth: { token }, transports: ['websocket'] });
    socket.on('message:notification', (payload: { conversationId: string; senderName: string }) => {
      const isOpen = selectedConversation?.id === payload.conversationId && !document.hidden;
      if (!isOpen && profile?.messageSoundEnabled) playSound('message');
      if (!isOpen && profile?.browserNotificationsEnabled && Notification.permission === 'granted') new Notification(`Сообщение от ${payload.senderName}`);
    });
    socket.on('call:incoming', (call: IncomingCall) => {
      setIncomingCall(call);
      if (profile?.browserNotificationsEnabled && Notification.permission === 'granted') new Notification(`Входящий звонок: ${call.title}`);
    });
    return () => {
      socket.disconnect();
    };
  }, [profile?.browserNotificationsEnabled, profile?.callSoundEnabled, profile?.messageSoundEnabled, selectedConversation?.id]);

  useEffect(() => {
    if (!incomingCall || !profile?.callSoundEnabled) return;
    playSound('call');
    const interval = window.setInterval(() => playSound('call'), 2500);
    return () => window.clearInterval(interval);
  }, [incomingCall, profile?.callSoundEnabled]);

  async function startConversationCall(conversationId: string): Promise<void> {
    const room = await api.request<{ id: string }>('calls/rooms', { method: 'POST', body: JSON.stringify({ title: 'Видеовстреча', conversationId, maxParticipants: 10 }) });
    setAcceptedRoomId(room.id);
    props.onView('calls');
  }

  async function declineIncomingCall(): Promise<void> {
    if (!incomingCall) return;
    await api.request(`calls/rooms/${incomingCall.roomId}/decline`, { method: 'POST' });
    setIncomingCall(null);
  }

  return (
    <div className="shell">
      <aside className="sidebar"><div className="brand"><span className="brand-mark">◡</span><span>мужская опора</span></div><nav>{([['home', 'Главная'], ['messages', 'Сообщения'], ['calls', 'Встречи'], ['profile', 'Профиль']] as [View, string][]).map(([id, label]) => <button key={id} className={view === id ? 'nav-item active' : 'nav-item'} onClick={() => props.onView(id)}>{label}</button>)}{session.user.role !== 'USER' && <button className={view === 'admin' ? 'nav-item active' : 'nav-item'} onClick={() => props.onView('admin')}>Модерация</button>}</nav><button className="logout" onClick={() => void props.onLogout()}>Выйти</button></aside>
      <main className="workspace"><header className="topbar"><div><small>Личное пространство</small><h1>Привет, {displayName}</h1></div><Avatar url={profile?.avatarUrl} name={displayName} /></header>
        {view === 'home' && <Home recommendations={recommendations} onStartConversation={props.onStartConversation} />}
        {view === 'messages' && <Messages conversations={conversations} selected={selectedConversation} messages={messages} currentUserId={session.user.id} timeZone={profile?.timeZone ?? 'UTC'} onOpen={props.onOpenConversation} onMessages={props.onMessages} onStartCall={startConversationCall} />}
        {view === 'calls' && <Calls onNotice={props.onNotice} roomId={acceptedRoomId} onRoomConsumed={() => setAcceptedRoomId(null)} />}
        {view === 'profile' && profile && <ProfileEditor profile={profile} onProfile={props.onProfile} onNotice={props.onNotice} />}
        {view === 'admin' && <Admin />}
      </main>
      {incomingCall && <div className="incoming-call"><strong>{incomingCall.title}</strong><span>Входящий видеозвонок</span><div><button className="primary" onClick={() => { setAcceptedRoomId(incomingCall.roomId); setIncomingCall(null); props.onView('calls'); }}>Принять</button><button className="secondary" onClick={() => void declineIncomingCall()}>Отклонить</button></div></div>}
      {props.notice && <div className="toast" onAnimationEnd={() => props.onNotice('')}>{props.notice}</div>}
    </div>
  );
}

function Home({ recommendations, onStartConversation }: { recommendations: Recommendation[]; onStartConversation: (userId: string) => Promise<void> }) {
  return <><section className="hero"><div><p className="eyebrow">Безопасное сообщество</p><h2>Подходящие собеседники</h2><p>Подбор по языку и темам общения. Вы в любой момент можете скрыть анкету или заблокировать пользователя.</p></div></section><section><div className="section-title"><div><h2>Возможно, вам будет комфортно поговорить</h2><p>Рекомендации строятся прозрачно — по общим интересам и языку.</p></div></div><div className="people-grid">{recommendations.map((person) => <article className="person-card" key={person.id}><Avatar url={person.profile?.avatarUrl} name={person.displayName} /><div><h3>{person.displayName}</h3><small>{person.profile?.city ?? 'Город не указан'}</small></div><div className="tags">{person.profile?.interests.slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div><button className="text-button" onClick={() => void onStartConversation(person.id)}>Написать →</button></article>)}</div></section></>;
}

function Messages({ conversations, selected, messages, currentUserId, timeZone, onOpen, onMessages, onStartCall }: { conversations: Conversation[]; selected: Conversation | null; messages: Message[]; currentUserId: string; timeZone: string; onOpen: (conversation: Conversation) => Promise<void>; onMessages: Dispatch<SetStateAction<Message[]>>; onStartCall: (conversationId: string) => Promise<void> }) {
  const [text, setText] = useState('');
  useEffect(() => {
    const token = api.getAccessToken();
    const endpoint = process.env.NEXT_PUBLIC_API_URL;
    if (!selected || !token || !endpoint) return;
    const socket = io(endpoint, { auth: { token }, transports: ['websocket'] });
    socket.emit('conversation:join', { conversationId: selected.id });
    socket.on('message:created', (message: Message) => {
      onMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
    });
    return () => {
      socket.disconnect();
    };
  }, [selected?.id, onMessages]);

  async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected || !text.trim()) return;
    const message = await api.request<Message>(`conversations/${selected.id}/messages`, { method: 'POST', body: JSON.stringify({ clientMessageId: crypto.randomUUID(), body: text }) });
    onMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
    setText('');
  }
  return <section className="chat"><aside className="chat-list"><h2>Диалоги</h2>{conversations.map((conversation) => <button key={conversation.id} className={selected?.id === conversation.id ? 'conversation active' : 'conversation'} onClick={() => void onOpen(conversation)}><strong>{conversation.title ?? conversation.members.filter((member) => member.user.id !== currentUserId).map((member) => member.user.displayName).join(', ')}</strong><small>{conversation.messages[0]?.body ?? 'Новый диалог'}</small></button>)}</aside><div className="conversation-panel">{selected ? <><header className="conversation-header"><h2>{selected.title ?? selected.members.filter((member) => member.user.id !== currentUserId).map((member) => member.user.displayName).join(', ')}</h2><button className="secondary" onClick={() => void onStartCall(selected.id)}>Видеозвонок</button></header><div className="message-stream">{messages.map((message) => <div key={message.id} className={message.sender.id === currentUserId ? 'message mine' : 'message'}><b>{message.sender.displayName}</b><p>{message.body}</p><small>{formatDateTime(message.createdAt, timeZone)}</small></div>)}</div><form className="composer" onSubmit={send}><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Напишите сообщение…" maxLength={4000} /><button className="primary">Отправить</button></form></> : <div className="empty">Выберите диалог, чтобы начать общение</div>}</div></section>;
}

function Calls({ onNotice, roomId, onRoomConsumed }: { onNotice: (value: string) => void; roomId: string | null; onRoomConsumed: () => void }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const media = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (roomId && !room) void start(roomId);
  }, [roomId, room]);

  async function start(existingRoomId?: string): Promise<void> {
    const targetRoomId = existingRoomId ?? (await api.request<{ id: string }>('calls/rooms', { method: 'POST', body: JSON.stringify({ title: 'Новая встреча', maxParticipants: 10 }) })).id;
    const connection = await api.request<{ token: string; url: string }>(`calls/rooms/${targetRoomId}/join`, { method: 'POST' });
    const nextRoom = new Room({ adaptiveStream: true, dynacast: true });
    nextRoom.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video) media.current?.append(track.attach());
    });
    await nextRoom.connect(connection.url, connection.token);
    await nextRoom.localParticipant.enableCameraAndMicrophone();
    setRoom(nextRoom);
    setActiveRoomId(targetRoomId);
    setMicrophoneEnabled(true);
    setCameraEnabled(true);
    onRoomConsumed();
    onNotice('Вы подключились к встрече');
  }
  async function leave(): Promise<void> {
    if (activeRoomId) await api.request(`calls/rooms/${activeRoomId}/leave`, { method: 'POST' });
    room?.disconnect();
    setRoom(null);
    setActiveRoomId(null);
    setMicrophoneEnabled(false);
    setCameraEnabled(false);
    if (media.current) media.current.replaceChildren();
  }
  async function toggleMicrophone(): Promise<void> {
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(!microphoneEnabled);
    setMicrophoneEnabled((enabled) => !enabled);
  }
  async function toggleCamera(): Promise<void> {
    if (!room) return;
    await room.localParticipant.setCameraEnabled(!cameraEnabled);
    setCameraEnabled((enabled) => !enabled);
  }
  return <section className="call-room"><div className="call-copy"><p className="eyebrow">Аудио и видео</p><h2>{room ? 'Встреча идёт' : 'Создайте безопасную встречу'}</h2><p>До 10 участников. Доступ выдаётся только приглашённым пользователям на короткое время.</p>{room ? <div className="call-controls"><button className="secondary" onClick={() => void toggleMicrophone()}>{microphoneEnabled ? 'Выключить микрофон' : 'Включить микрофон'}</button><button className="secondary" onClick={() => void toggleCamera()}>{cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}</button><button className="danger" onClick={() => void leave()}>Выйти</button></div> : <button className="primary" onClick={() => void start()}>Создать встречу</button>}</div><div className="video-grid" ref={media} /></section>;
}

function ProfileEditor({ profile, onProfile, onNotice }: { profile: Profile; onProfile: (profile: Profile) => void; onNotice: (value: string) => void }) {
  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const browserNotificationsEnabled = form.get('browserNotificationsEnabled') === 'on';
    if (browserNotificationsEnabled && Notification.permission === 'default') await Notification.requestPermission();
    const next = await api.request<Profile>('profile', { method: 'PATCH', body: JSON.stringify({ city: String(form.get('city')), timeZone: String(form.get('timeZone')), bio: String(form.get('bio')), languages: String(form.get('languages')).split(',').map((item) => item.trim()).filter(Boolean), interests: String(form.get('interests')).split(',').map((item) => item.trim()).filter(Boolean), messageSoundEnabled: form.get('messageSoundEnabled') === 'on', callSoundEnabled: form.get('callSoundEnabled') === 'on', browserNotificationsEnabled }) });
    onProfile(next);
    onNotice('Профиль сохранён');
  }
  async function uploadAvatar(file: File): Promise<void> {
    const upload = await api.request<{ uploadId: string; uploadUrl: string }>('profile/avatar/uploads', { method: 'POST', body: JSON.stringify({ contentType: file.type, byteSize: file.size }) });
    await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    const next = await api.request<Profile>('profile/avatar/confirm', { method: 'POST', body: JSON.stringify({ uploadId: upload.uploadId }) });
    onProfile(next);
    onNotice('Аватар обновлён');
  }
  return <section className="profile-editor"><div className="profile-heading"><Avatar url={profile.avatarUrl} name={profile.user.displayName} /><label className="avatar-action">Изменить фото<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && void uploadAvatar(event.target.files[0])} /></label></div><form onSubmit={save}><Field label="Город" name="city" defaultValue={profile.city ?? ''} /><Field label="Часовой пояс" name="timeZone" defaultValue={profile.timeZone} /><Field label="О себе" name="bio" defaultValue={profile.bio} /><Field label="Языки через запятую" name="languages" defaultValue={profile.languages.join(', ')} /><Field label="Темы через запятую" name="interests" defaultValue={profile.interests.join(', ')} /><div className="notification-settings"><label><input type="checkbox" name="messageSoundEnabled" defaultChecked={profile.messageSoundEnabled} /> Звук новых сообщений</label><label><input type="checkbox" name="callSoundEnabled" defaultChecked={profile.callSoundEnabled} /> Звук входящего звонка</label><label><input type="checkbox" name="browserNotificationsEnabled" defaultChecked={profile.browserNotificationsEnabled} /> Системные уведомления браузера</label></div><button className="primary">Сохранить изменения</button></form></section>;
}

function Admin() {
  const [reports, setReports] = useState<{ id: string; reason: string; targetUser: { displayName: string } }[]>([]);
  useEffect(() => { void api.request<typeof reports>('reports').then(setReports).catch(() => setReports([])); }, []);
  return <section className="admin"><h2>Очередь модерации</h2>{reports.length ? reports.map((report) => <article key={report.id}><strong>{report.targetUser.displayName}</strong><p>{report.reason}</p></article>) : <p>Нет открытых жалоб.</p>}</section>;
}

function Avatar({ url, name }: { url?: string | null; name: string }) {
  return url ? <img className="avatar" src={url} alt={`Аватар ${name}`} /> : <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>;
}

function Field({ label, name, type = 'text', defaultValue, minLength, required }: { label: string; name: string; type?: string; defaultValue?: string; minLength?: number; required?: boolean }) {
  return <label className="field"><span>{label}</span><input name={name} type={type} defaultValue={defaultValue} minLength={minLength} required={required} /></label>;
}
