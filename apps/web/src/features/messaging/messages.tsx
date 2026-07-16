'use client';

import { Dispatch, FormEvent, Fragment, SetStateAction, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Conversation, Message } from '@/features/app/types';
import { api } from '@/lib/api';
import { getConversationTitle } from '@/lib/conversation';
import { formatMessageDate, formatMessageTime } from '@/lib/date-time';

export function Messages({ conversations, selected, messages, currentUserId, timeZone, onOpen, onMessages, onStartCall }: { conversations: Conversation[]; selected: Conversation | null; messages: Message[]; currentUserId: string; timeZone: string; onOpen: (conversation: Conversation) => Promise<void>; onMessages: Dispatch<SetStateAction<Message[]>>; onStartCall: (conversationId: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    const token = api.getAccessToken();
    const endpoint = process.env.NEXT_PUBLIC_REALTIME_URL;
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

  function addEmoji(emoji: string): void {
    setText((current) => `${current}${emoji}`);
    setEmojiOpen(false);
  }

  return <section className="chat"><aside className="chat-list"><h2>Диалоги</h2>{conversations.map((conversation) => <button key={conversation.id} className={selected?.id === conversation.id ? 'conversation active' : 'conversation'} onClick={() => void onOpen(conversation)}><strong>{getConversationTitle(conversation, currentUserId)}</strong><small>{conversation.messages[0]?.body ?? 'Новый диалог'}</small></button>)}</aside><div className="conversation-panel">{selected ? <><header className="conversation-header"><h2>{getConversationTitle(selected, currentUserId)}</h2><button className="secondary" onClick={() => void onStartCall(selected.id)}>Видеозвонок</button></header><div className="message-stream">{messages.map((message, index) => { const date = formatMessageDate(message.createdAt, timeZone); const previousDate = index ? formatMessageDate(messages[index - 1].createdAt, timeZone) : null; return <Fragment key={message.id}>{date !== previousDate && <div className="message-date">{date}</div>}<div className={message.sender.id === currentUserId ? 'message mine' : 'message'}><b>{message.sender.displayName}</b><p>{message.body}</p><small>{formatMessageTime(message.createdAt, timeZone)}</small></div></Fragment>; })}</div><form className="composer" onSubmit={send}>{emojiOpen && <div className="emoji-picker">{['🙂', '👍', '❤️', '🙏', '💪', '😊', '😔', '🔥', '👏', '🤝', '😂', '🎉'].map((emoji) => <button type="button" key={emoji} onClick={() => addEmoji(emoji)}>{emoji}</button>)}</div>}<button type="button" className="emoji-button" aria-label="Выбрать эмодзи" onClick={() => setEmojiOpen((open) => !open)}>☺</button><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Напишите сообщение…" maxLength={4000} /><button className="primary">Отправить</button></form></> : <div className="empty">Выберите диалог, чтобы начать общение</div>}</div></section>;
}
