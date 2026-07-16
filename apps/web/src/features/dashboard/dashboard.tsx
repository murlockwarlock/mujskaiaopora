'use client';

import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Avatar } from '@/components/avatar';
import { Session, api } from '@/lib/api';
import { playSound } from '@/lib/sounds';
import { Admin } from '@/features/moderation/admin';
import { Calls } from '@/features/calls/calls';
import { Home } from '@/features/home/home';
import { Messages } from '@/features/messaging/messages';
import { ProfileEditor } from '@/features/profile/profile-editor';
import { Conversation, IncomingCall, Message, Profile, Recommendation, View } from '@/features/app/types';

type DashboardProps = {
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
  onDismissRecommendation: (userId: string) => Promise<void>;
  onBlockUser: (userId: string) => Promise<void>;
  onOpenConversation: (conversation: Conversation) => Promise<void>;
  onMessages: Dispatch<SetStateAction<Message[]>>;
  onLogout: () => Promise<void>;
};

export function Dashboard(props: DashboardProps) {
  const { session, profile, recommendations, conversations, selectedConversation, messages, view } = props;
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [acceptedRoomId, setAcceptedRoomId] = useState<string | null>(null);
  const displayName = profile?.user?.displayName ?? session.user.displayName;

  useEffect(() => {
    const token = api.getAccessToken();
    const endpoint = process.env.NEXT_PUBLIC_REALTIME_URL;
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
    try {
      const room = await api.request<{ id: string }>('calls/rooms', { method: 'POST', body: JSON.stringify({ title: 'Видеовстреча', conversationId, maxParticipants: 10 }) });
      setAcceptedRoomId(room.id);
      props.onView('call');
    } catch (cause) {
      props.onNotice(cause instanceof Error ? cause.message : 'Не удалось начать видеозвонок');
    }
  }

  async function declineIncomingCall(): Promise<void> {
    if (!incomingCall) return;
    await api.request(`calls/rooms/${incomingCall.roomId}/decline`, { method: 'POST' });
    setIncomingCall(null);
  }

  return <div className="shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">◡</span><span>мужская опора</span></div><nav>{([['home', 'Главная'], ['messages', 'Сообщения'], ['calls', 'Встречи'], ['profile', 'Профиль']] as [View, string][]).map(([id, label]) => <button key={id} className={view === id ? 'nav-item active' : 'nav-item'} onClick={() => props.onView(id)}>{label}</button>)}{session.user.role !== 'USER' && <button className={view === 'admin' ? 'nav-item active' : 'nav-item'} onClick={() => props.onView('admin')}>Модерация</button>}</nav><button className="logout" onClick={() => void props.onLogout()}>Выйти</button></aside><main className="workspace"><header className="topbar"><div><small>Личное пространство</small><h1>Привет, {displayName}</h1></div><Avatar url={profile?.avatarUrl} name={displayName} /></header>{view === 'home' && <Home recommendations={recommendations} onStartConversation={props.onStartConversation} onDismiss={props.onDismissRecommendation} onBlock={props.onBlockUser} />}{view === 'messages' && <Messages conversations={conversations} selected={selectedConversation} messages={messages} currentUserId={session.user.id} timeZone={profile?.timeZone ?? 'UTC'} onOpen={props.onOpenConversation} onMessages={props.onMessages} onStartCall={startConversationCall} />}{view === 'calls' && <Calls onNotice={props.onNotice} roomId={acceptedRoomId} onRoomConsumed={() => setAcceptedRoomId(null)} />}{view === 'call' && <Calls onNotice={props.onNotice} roomId={acceptedRoomId} onRoomConsumed={() => setAcceptedRoomId(null)} onClose={() => props.onView('messages')} />}{view === 'profile' && profile && <ProfileEditor profile={profile} onProfile={props.onProfile} onNotice={props.onNotice} />}{view === 'admin' && <Admin />}</main>{incomingCall && <div className="incoming-call"><strong>{incomingCall.title}</strong><span>Входящий видеозвонок</span><div><button className="primary" onClick={() => { setAcceptedRoomId(incomingCall.roomId); setIncomingCall(null); props.onView('call'); }}>Принять</button><button className="secondary" onClick={() => void declineIncomingCall()}>Отклонить</button></div></div>}{props.notice && <div className="toast" onAnimationEnd={() => props.onNotice('')}>{props.notice}</div>}</div>;
}
