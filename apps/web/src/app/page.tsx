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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [view, setView] = useState<View>('home');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const restoreStarted = useRef(false);

  useEffect(() => {
    if (restoreStarted.current) return;
    restoreStarted.current = true;
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

  if (loading) return <main className="loading">Загружаем пространство…</main>;
  if (!session) return <AuthScreen onAuthenticated={completeAuthentication} />;

  return <Dashboard session={session} profile={profile} recommendations={recommendations} conversations={conversations} selectedConversation={selectedConversation} messages={messages} view={view} notice={notice} onView={setView} onProfile={setProfile} onNotice={setNotice} onStartConversation={startConversation} onDismissRecommendation={dismissRecommendation} onBlockUser={blockUser} onOpenConversation={openConversation} onMessages={setMessages} onLogout={async () => { await api.logout(); setSession(null); setProfile(null); }} />;
}
