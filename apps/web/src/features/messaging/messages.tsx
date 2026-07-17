'use client';

import { Dispatch, FormEvent, Fragment, SetStateAction, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { Conversation, Message, Recommendation } from '@/features/app/types';
import { api } from '@/lib/api';
import { getConversationTitle } from '@/lib/conversation';
import { formatMessageDate, formatMessageTime } from '@/lib/date-time';

type GroupDialogMode = 'create' | 'members' | null;

type MessagesProps = {
  conversations: Conversation[];
  selected: Conversation | null;
  messages: Message[];
  recommendations: Recommendation[];
  currentUserId: string;
  timeZone: string;
  unreadCounts: Record<string, number>;
  onOpen: (conversation: Conversation) => Promise<void>;
  onClose: () => void;
  onMessages: Dispatch<SetStateAction<Message[]>>;
  onConversationMessage: (conversationId: string, message: Message) => void;
  onStartCall: (conversationId: string, mode: 'AUDIO' | 'VIDEO') => Promise<void>;
  onCreateGroup: (title: string, userIds: string[]) => Promise<void>;
  onAddMembers: (conversationId: string, userIds: string[]) => Promise<void>;
};

export function Messages(props: MessagesProps) {
  const { conversations, selected, messages, recommendations, currentUserId, timeZone } = props;
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [groupDialog, setGroupDialog] = useState<GroupDialogMode>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    const token = api.getAccessToken();
    const endpoint = process.env.NEXT_PUBLIC_REALTIME_URL || window.location.origin;
    if (!selected || !token || !endpoint) return;
    const socket = io(endpoint, { auth: { token }, transports: ['websocket'], reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });
    socket.emit('conversation:join', { conversationId: selected.id });
    socket.on('message:created', (message: Message) => {
      props.onMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
      props.onConversationMessage(selected.id, message);
    });
    return () => {
      socket.disconnect();
    };
  }, [selected?.id, props.onMessages]);

  async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected || !text.trim() || sending) return;
    setSending(true);
    setSendError('');
    try {
      const message = await api.request<Message>(`conversations/${selected.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ clientMessageId: crypto.randomUUID(), body: text })
      });
      props.onMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
      props.onConversationMessage(selected.id, message);
      setText('');
    } catch (cause) {
      setSendError(cause instanceof Error ? cause.message : 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  }

  function addEmoji(emoji: string): void {
    setText((current) => `${current}${emoji}`);
    setEmojiOpen(false);
  }

  return <section className={selected ? 'chat chat-has-selection' : 'chat'}>
    <aside className="chat-list">
      <div className="chat-list-heading"><h2>Диалоги</h2><button className="create-group-button" type="button" onClick={() => setGroupDialog('create')}>+ Общий чат</button></div>
      {conversations.map((conversation) => <button key={conversation.id} className={selected?.id === conversation.id ? 'conversation active' : 'conversation'} onClick={() => void props.onOpen(conversation)}>
        <strong>{getConversationTitle(conversation, currentUserId)}{props.unreadCounts[conversation.id] ? <span className="conversation-unread">{props.unreadCounts[conversation.id] > 99 ? '99+' : props.unreadCounts[conversation.id]}</span> : null}</strong>
        <small>{conversation.type === 'GROUP' ? `${conversation.members.length} участников` : conversation.messages[0]?.body ?? 'Новый диалог'}</small>
      </button>)}
    </aside>
    <div className="conversation-panel">
      {selected ? <>
        <header className="conversation-header">
          <div><button type="button" className="mobile-chat-back" onClick={props.onClose}>← Все диалоги</button><h2>{getConversationTitle(selected, currentUserId)}</h2>{selected.type === 'GROUP' && <small className="participant-count">{selected.members.length} из 10 участников</small>}</div>
          <div className="call-header-actions">
            {selected.type === 'GROUP' && selected.members.some((member) => member.user?.id === currentUserId && member.role === 'OWNER') && <button type="button" className="icon-button" aria-label="Добавить участников" title="Добавить участников" onClick={() => setGroupDialog('members')}><AddUserIcon /></button>}
            <button type="button" className="icon-button" aria-label="Аудиозвонок" title="Аудиозвонок" onClick={() => void props.onStartCall(selected.id, 'AUDIO')}><PhoneIcon /></button>
            <button type="button" className="icon-button" aria-label="Видеозвонок" title="Видеозвонок" onClick={() => void props.onStartCall(selected.id, 'VIDEO')}><VideoIcon /></button>
          </div>
        </header>
        <div className="message-stream">{messages.map((message, index) => {
          const date = formatMessageDate(message.createdAt, timeZone);
          const previousDate = index ? formatMessageDate(messages[index - 1].createdAt, timeZone) : null;
          return <Fragment key={message.id}>{date !== previousDate && <div className="message-date">{date}</div>}<div className={message.sender.id === currentUserId ? 'message mine' : 'message'}><b>{message.sender.displayName}</b><p>{message.body}</p><small>{formatMessageTime(message.createdAt, timeZone)}</small></div></Fragment>;
        })}</div>
        <form className="composer" onSubmit={(event) => void send(event)}>
          {emojiOpen && <div className="emoji-picker">{['🙂', '👍', '❤️', '🙏', '💪', '😊', '😔', '🔥', '👏', '🤝', '😂', '🎉'].map((emoji) => <button type="button" key={emoji} onClick={() => addEmoji(emoji)}>{emoji}</button>)}</div>}
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Напишите сообщение…" maxLength={4000} />
          <button type="button" className="emoji-button" aria-label="Выбрать эмодзи" onClick={() => setEmojiOpen((open) => !open)}>☺</button>
          <button className="primary" disabled={!text.trim() || sending}>{sending ? 'Отправляем…' : 'Отправить'}</button>
          {sendError && <span className="composer-error">{sendError}</span>}
        </form>
      </> : <div className="empty">Выберите диалог, чтобы начать общение</div>}
    </div>
    {groupDialog && <GroupDialog
      mode={groupDialog}
      recommendations={recommendations}
      selected={selected}
      onClose={() => setGroupDialog(null)}
      onCreate={async (title, userIds) => { await props.onCreateGroup(title, userIds); setGroupDialog(null); }}
      onAdd={async (userIds) => { if (selected) await props.onAddMembers(selected.id, userIds); setGroupDialog(null); }}
    />}
  </section>;
}

function GroupDialog({ mode, recommendations, selected, onClose, onCreate, onAdd }: { mode: Exclude<GroupDialogMode, null>; recommendations: Recommendation[]; selected: Conversation | null; onClose: () => void; onCreate: (title: string, userIds: string[]) => Promise<void>; onAdd: (userIds: string[]) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const currentMemberIds = useMemo(() => new Set(selected?.members.flatMap((member) => member.user ? [member.user.id] : []) ?? []), [selected]);
  const candidates = recommendations.filter((person) => !currentMemberIds.has(person.id));
  const limit = mode === 'create' ? 9 : Math.max(0, 10 - (selected?.members.length ?? 0));
  const canSubmit = mode === 'create' ? title.trim().length >= 2 && selectedIds.length > 0 : selectedIds.length > 0;

  function toggle(userId: string): void {
    setSelectedIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : current.length < limit ? [...current, userId] : current);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    setError('');
    try {
      if (mode === 'create') await onCreate(title.trim(), selectedIds);
      else await onAdd(selectedIds);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить группу');
    } finally {
      setSaving(false);
    }
  }

  return <div className="group-dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <form className="group-dialog" onSubmit={(event) => void submit(event)} onMouseDown={(event) => event.stopPropagation()}>
      <div className="group-dialog-header"><div><h2>{mode === 'create' ? 'Новый общий чат' : 'Добавить участников'}</h2><p>{mode === 'create' ? 'Выберите до 9 человек — вы станете десятым участником.' : `Свободно мест: ${limit}`}</p></div><button type="button" className="dialog-close" aria-label="Закрыть" onClick={onClose}>×</button></div>
      {mode === 'create' && <label className="field">Название группы<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="Например, Разговор по душам" /></label>}
      <div className="group-selection-label">Выбрано: {selectedIds.length} из {limit}</div>
      <div className="group-members">{candidates.length ? candidates.map((person) => {
        const checked = selectedIds.includes(person.id);
        const disabled = !checked && selectedIds.length >= limit;
        return <label key={person.id} className={checked ? 'group-member selected' : 'group-member'}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(person.id)} /><span>{person.displayName}</span><small>{person.profile?.interests.slice(0, 2).join(' · ') || 'Участник сообщества'}</small></label>;
      }) : <p className="group-empty">Сейчас нет доступных людей для добавления.</p>}</div>
      {error && <p className="group-error">{error}</p>}
      <div className="group-dialog-actions"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button className="primary" disabled={!canSubmit || saving}>{saving ? 'Сохраняем…' : mode === 'create' ? 'Создать чат' : 'Добавить'}</button></div>
    </form>
  </div>;
}

function PhoneIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.1 3.7 5.8 5.1c-.7.4-1 1.3-.7 2.1 2 5.5 6.3 9.8 11.8 11.8.8.3 1.7 0 2.1-.7l1.4-2.3c.4-.7.2-1.6-.5-2l-3-1.3c-.6-.3-1.4-.1-1.8.5l-.9 1.1a13.2 13.2 0 0 1-4.5-4.5l1.1-.9c.6-.4.8-1.2.5-1.8l-1.3-3c-.4-.7-1.3-.9-2-.5Z" /></svg>;
}

function VideoIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v1.2l3.7-2.2c.7-.4 1.6.1 1.6.9v11.2c0 .8-.9 1.3-1.6.9L16 16.3v1.2a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 17.5v-11Z" /></svg>;
}

function AddUserIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 11a4 4 0 1 0-3.9-4A4 4 0 0 0 15 11Zm-9 1v2h2v2h2v-2h2v-2h-2v-2H8v2Zm9 1c-2.7 0-8 1.35-8 4v2h9.6a5.9 5.9 0 0 1-.6-2.6c0-1.3.4-2.5 1-3.4A9.6 9.6 0 0 0 15 13Zm4 1v2h-2v2h2v2h2v-2h2v-2h-2v-2Z" /></svg>;
}
