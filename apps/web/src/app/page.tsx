'use client';

import { useEffect, useRef, useState } from 'react';
import { AuthScreen } from '@/features/auth/auth-screen';
import { Dashboard } from '@/features/dashboard/dashboard';
import { Conversation, Message, Profile, Recommendation, View } from '@/features/app/types';
import { api, Session } from '@/lib/api';

export default function Page() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [availableUsers, setAvailableUsers] = useState<Recommendation[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [view, setView] = useState<View>('home');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const restoreStarted = useRef(false);

  async function restore(): Promise<void> {
    if (!api.getAccessToken() && !(await api.refresh())) {
      setLoading(false);
      return;
    }
    try {
      await loadAccount();
    } catch {
      api.clearAccessToken();
      if (await api.refresh()) {
        try {
          await loadAccount();
          return;
        } catch {
          api.clearAccessToken();
        }
      }
      setLoading(false);
    }
  }

  async function loadAccount(): Promise<void> {
    const user = await api.request<Profile['user'] & { email: string; role: string }>('auth/me');
    setSession({ accessToken: '', user });
    const [profileResult, recommendationsResult, usersResult, conversationsResult] = await Promise.allSettled([
      api.request<Profile>('profile'),
      api.request<Recommendation[]>('matching/recommendations'),
      api.request<Recommendation[]>('matching/users'),
      api.request<Conversation[]>('conversations')
    ]);
    if (profileResult.status === 'fulfilled') {
      setProfile(profileResult.value);
      void synchronizeTimeZone(profileResult.value);
    }
    if (recommendationsResult.status === 'fulfilled') setRecommendations(recommendationsResult.value);
    if (usersResult.status === 'fulfilled') setAvailableUsers(usersResult.value);
    if (conversationsResult.status === 'fulfilled') setConversations(conversationsResult.value);
    setLoading(false);
  }

  async function completeAuthentication(nextSession: Session): Promise<void> {
    setSession(nextSession);
    try {
      await loadAccount();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Не удалось загрузить данные профиля');
    }
  }

  async function openConversation(conversation: Conversation): Promise<void> {
    const result = await api.request<{ items: Message[] }>(`conversations/${conversation.id}/messages`);
    setSelectedConversation(conversation);
    setMessages(result.items);
    setView('messages');
  }

  function closeConversation(): void {
    setSelectedConversation(null);
    setMessages([]);
  }

  function updateConversation(conversationId: string, message: Message): void {
    setConversations((current) => {
      const conversation = current.find((item) => item.id === conversationId);
      if (!conversation) return current;
      const updated = { ...conversation, messages: [{ body: message.body, sender: { displayName: message.sender.displayName } }] };
      return [updated, ...current.filter((item) => item.id !== conversationId)];
    });
    setSelectedConversation((current) => current?.id === conversationId ? { ...current, messages: [{ body: message.body, sender: { displayName: message.sender.displayName } }] } : current);
  }

  async function startConversation(userId: string): Promise<void> {
    const conversation = await api.request<Conversation>('conversations/direct', { method: 'POST', body: JSON.stringify({ userId }) });
    setConversations((current) => (current.some((item) => item.id === conversation.id) ? current : [conversation, ...current]));
    await openConversation(conversation);
  }

  async function createGroup(title: string, userIds: string[]): Promise<void> {
    const conversation = await api.request<Conversation>('conversations/group', { method: 'POST', body: JSON.stringify({ title, userIds }) });
    setConversations((current) => [conversation, ...current]);
    await openConversation(conversation);
  }

  async function addGroupMembers(conversationId: string, userIds: string[]): Promise<void> {
    const conversation = await api.request<Conversation>(`conversations/${conversationId}/members`, { method: 'POST', body: JSON.stringify({ userIds }) });
    setConversations((current) => current.map((item) => item.id === conversation.id ? conversation : item));
    if (selectedConversation?.id === conversation.id) setSelectedConversation(conversation);
  }

  async function dismissRecommendation(userId: string): Promise<void> {
    await api.request('matching/dismissals', { method: 'POST', body: JSON.stringify({ userId }) });
    setRecommendations((current) => current.filter((item) => item.id !== userId));
  }

  async function blockUser(userId: string): Promise<void> {
    await api.request('matching/blocks', { method: 'POST', body: JSON.stringify({ userId }) });
    setRecommendations((current) => current.filter((item) => item.id !== userId));
  }

  async function synchronizeTimeZone(currentProfile: Profile): Promise<void> {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone || currentProfile.timeZone === timeZone) return;
    try {
      setProfile(await api.request<Profile>('profile', { method: 'PATCH', body: JSON.stringify({ timeZone }) }));
    } catch {
      return;
    }
  }

  useEffect(() => {
    if (restoreStarted.current) return;
    restoreStarted.current = true;
    void restore();
  }, []);

  if (loading) return <main className="loading">Загружаем пространство…</main>;
  if (!session) return <AuthScreen onAuthenticated={completeAuthentication} />;

  return <Dashboard session={session} profile={profile} recommendations={recommendations} availableUsers={availableUsers} conversations={conversations} selectedConversation={selectedConversation} messages={messages} view={view} notice={notice} onView={setView} onProfile={setProfile} onNotice={setNotice} onStartConversation={startConversation} onDismissRecommendation={dismissRecommendation} onBlockUser={blockUser} onOpenConversation={openConversation} onCloseConversation={closeConversation} onConversationMessage={updateConversation} onCreateGroup={createGroup} onAddGroupMembers={addGroupMembers} onMessages={setMessages} onLogout={async () => { await api.logout(); setSession(null); setProfile(null); }} />;
}
