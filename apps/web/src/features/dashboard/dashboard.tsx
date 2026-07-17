'use client';

import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
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
  availableUsers: Recommendation[];
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
  onCloseConversation: () => void;
  onConversationMessage: (conversationId: string, message: Message) => void;
  onCreateGroup: (title: string, userIds: string[]) => Promise<void>;
  onAddGroupMembers: (conversationId: string, userIds: string[]) => Promise<void>;
  onMessages: Dispatch<SetStateAction<Message[]>>;
  onLogout: () => Promise<void>;
};

type CallConnection = { roomId: string; token?: string; url?: string; inviteCode?: string; canInvite?: boolean; mode: 'AUDIO' | 'VIDEO' };
type MessageNotification = { conversationId: string; message: Message };

export function Dashboard(props: DashboardProps) {
  const { session, profile, recommendations, availableUsers, conversations, selectedConversation, messages, view } = props;
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<CallConnection | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [messageNotification, setMessageNotification] = useState<MessageNotification | null>(null);
  const inviteJoinStarted = useRef(false);
  const notificationTimer = useRef<number | null>(null);
  const latest = useRef({ profile, conversations, selectedConversation, onConversationMessage: props.onConversationMessage, onMessages: props.onMessages });
  const displayName = profile?.user?.displayName ?? session.user.displayName;
  const unreadTotal = Object.values(unreadCounts).reduce((total, count) => total + count, 0);

  useEffect(() => {
    latest.current = { profile, conversations, selectedConversation, onConversationMessage: props.onConversationMessage, onMessages: props.onMessages };
  }, [profile, conversations, selectedConversation, props.onConversationMessage, props.onMessages]);

  useEffect(() => {
    const endpoint = process.env.NEXT_PUBLIC_REALTIME_URL || window.location.origin;
    const token = api.getAccessToken();
    if (!token || !endpoint) return;
    const socket = io(endpoint, { auth: { token }, transports: ['websocket'], reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });
    socket.on('message:notification', (payload: MessageNotification) => {
      if (!payload?.message?.id) return;
      const current = latest.current;
      current.onConversationMessage(payload.conversationId, payload.message);
      const isOpen = current.selectedConversation?.id === payload.conversationId && !document.hidden;
      if (isOpen) current.onMessages((items) => items.some((item) => item.id === payload.message.id) ? items : [...items, payload.message]);
      if (!isOpen) {
        setUnreadCounts((counts) => ({ ...counts, [payload.conversationId]: (counts[payload.conversationId] ?? 0) + 1 }));
        if (current.profile?.messageSoundEnabled) playSound('message');
        if (current.profile?.browserNotificationsEnabled && Notification.permission === 'granted') new Notification(`Сообщение от ${payload.message.sender.displayName}`, { body: payload.message.body });
        setMessageNotification(payload);
        if (notificationTimer.current) window.clearTimeout(notificationTimer.current);
        notificationTimer.current = window.setTimeout(() => setMessageNotification(null), 7000);
      }
    });
    socket.on('call:incoming', (call: IncomingCall) => {
      if (!call?.caller?.id) return;
      setIncomingCall(call);
      if (latest.current.profile?.browserNotificationsEnabled && Notification.permission === 'granted') new Notification(`Входящий звонок: ${call.caller.displayName}`);
    });
    return () => {
      socket.disconnect();
      if (notificationTimer.current) window.clearTimeout(notificationTimer.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const synchronizeInvitations = () => {
      void api.request<IncomingCall[]>('calls/invitations').then((invitations) => {
        if (!active) return;
        setIncomingCall((current) => current ?? invitations[0] ?? null);
      }).catch(() => undefined);
    };
    synchronizeInvitations();
    const interval = window.setInterval(synchronizeInvitations, 12000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!incomingCall || !profile?.callSoundEnabled) return;
    playSound('call');
    const interval = window.setInterval(() => playSound('call'), 2500);
    return () => window.clearInterval(interval);
  }, [incomingCall, profile?.callSoundEnabled]);

  useEffect(() => {
    const inviteCode = new URLSearchParams(window.location.search).get('join');
    if (!inviteCode || inviteJoinStarted.current) return;
    inviteJoinStarted.current = true;
    window.history.replaceState({}, '', window.location.pathname);
    void api.request<{ roomId: string; token: string; url: string; inviteCode: string; canInvite: boolean }>(`calls/invites/${inviteCode}/join`, { method: 'POST' })
      .then((connection) => {
        setActiveCall({ ...connection, mode: 'VIDEO' });
        props.onView('call');
      })
      .catch((cause) => props.onNotice(cause instanceof Error ? cause.message : 'Не удалось подключиться к встрече'));
  }, [props]);

  async function openConversation(conversation: Conversation): Promise<void> {
    setUnreadCounts((counts) => ({ ...counts, [conversation.id]: 0 }));
    setMessageNotification((current) => current?.conversationId === conversation.id ? null : current);
    await props.onOpenConversation(conversation);
  }

  async function startConversationCall(conversationId: string, mode: 'AUDIO' | 'VIDEO'): Promise<void> {
    try {
      const connection = await api.request<{ roomId: string; token: string; url: string; inviteCode: string; canInvite: boolean }>(`calls/conversations/${conversationId}/start`, { method: 'POST', body: JSON.stringify({ mode }) });
      setActiveCall({ ...connection, mode });
      props.onView('call');
    } catch (cause) {
      props.onNotice(cause instanceof Error ? cause.message : 'Не удалось начать звонок');
    }
  }

  async function acceptIncomingCall(): Promise<void> {
    if (!incomingCall) return;
    try {
      const connection = await api.request<{ token: string; url: string; inviteCode: string; canInvite: boolean }>(`calls/rooms/${incomingCall.roomId}/join`, { method: 'POST' });
      setActiveCall({ roomId: incomingCall.roomId, ...connection, mode: 'VIDEO' });
      setIncomingCall(null);
      props.onView('call');
    } catch (cause) {
      props.onNotice(cause instanceof Error ? cause.message : 'Не удалось подключиться к звонку');
    }
  }

  async function declineIncomingCall(): Promise<void> {
    if (!incomingCall) return;
    try {
      await api.request(`calls/rooms/${incomingCall.roomId}/decline`, { method: 'POST' });
      setIncomingCall(null);
    } catch (cause) {
      props.onNotice(cause instanceof Error ? cause.message : 'Не удалось отклонить звонок');
    }
  }

  function endCall(): void {
    setActiveCall(null);
    props.onView('messages');
  }

  async function openMessageNotification(): Promise<void> {
    if (!messageNotification) return;
    const conversation = conversations.find((item) => item.id === messageNotification.conversationId);
    if (conversation) await openConversation(conversation);
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">◡</span><span>мужская опора</span></div>
      <nav>
        {([['home', 'Главная'], ['messages', 'Сообщения'], ['calls', 'Встречи'], ['profile', 'Профиль']] as [View, string][]).map(([id, label]) => <button key={id} className={view === id ? 'nav-item active' : 'nav-item'} onClick={() => props.onView(id)}><span>{label}</span>{id === 'messages' && unreadTotal > 0 && <b className="nav-unread">{unreadTotal > 99 ? '99+' : unreadTotal}</b>}</button>)}
        {session.user.role !== 'USER' && <button className={view === 'admin' ? 'nav-item active' : 'nav-item'} onClick={() => props.onView('admin')}>Модерация</button>}
      </nav>
      <button className="logout" onClick={() => void props.onLogout()}>Выйти</button>
    </aside>
    <main className="workspace">
      <header className="topbar">
        <div><h1>Привет, {displayName}</h1>{unreadTotal > 0 && <button className="topbar-unread" onClick={() => props.onView('messages')}>Новых сообщений: {unreadTotal > 99 ? '99+' : unreadTotal}</button>}</div>
        <button className="profile-shortcut" aria-label="Открыть профиль" title="Профиль" onClick={() => props.onView('profile')}><Avatar url={profile?.avatarUrl} name={displayName} /></button>
      </header>
      {view === 'home' && <Home recommendations={recommendations} onStartConversation={props.onStartConversation} onDismiss={props.onDismissRecommendation} onBlock={props.onBlockUser} />}
      {view === 'messages' && <Messages conversations={conversations} selected={selectedConversation} messages={messages} recommendations={availableUsers} currentUserId={session.user.id} timeZone={profile?.timeZone ?? 'UTC'} unreadCounts={unreadCounts} onOpen={openConversation} onClose={props.onCloseConversation} onMessages={props.onMessages} onConversationMessage={props.onConversationMessage} onStartCall={startConversationCall} onCreateGroup={props.onCreateGroup} onAddMembers={props.onAddGroupMembers} />}
      {view === 'profile' && profile && <ProfileEditor profile={profile} onProfile={props.onProfile} onNotice={props.onNotice} />}
      {view === 'admin' && <Admin />}
    </main>
    <Calls onNotice={props.onNotice} roomId={activeCall?.roomId ?? null} mode={activeCall?.mode} connection={activeCall?.token && activeCall.url ? { token: activeCall.token, url: activeCall.url, inviteCode: activeCall.inviteCode, canInvite: activeCall.canInvite } : undefined} expanded={view === 'calls' || view === 'call'} recommendations={availableUsers} currentUserId={session.user.id} timeZone={profile?.timeZone ?? 'UTC'} onOpen={() => props.onView(view === 'call' ? 'messages' : 'call')} onEnd={endCall} onStarted={(call) => setActiveCall(call)} />
    {incomingCall && <div className="incoming-call-backdrop"><section className="incoming-call"><Avatar url={incomingCall.caller.avatarUrl} name={incomingCall.caller.displayName} /><div><span>Входящий видеозвонок</span><strong>{incomingCall.caller.displayName}</strong><small>{incomingCall.title}</small></div><div className="incoming-call-actions"><button className="secondary" onClick={() => void declineIncomingCall()}>Отклонить</button><button className="primary" onClick={() => void acceptIncomingCall()}>Принять</button></div></section></div>}
    {messageNotification && <button className="message-notification" onClick={() => void openMessageNotification()}><Avatar url={messageNotification.message.sender.avatarUrl ?? null} name={messageNotification.message.sender.displayName} /><span><b>{messageNotification.message.sender.displayName}</b><small>{messageNotification.message.body}</small></span></button>}
    {props.notice && <div className="toast" onAnimationEnd={() => props.onNotice('')}>{props.notice}</div>}
  </div>;
}
