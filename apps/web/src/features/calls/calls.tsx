'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Participant, Room, RoomEvent, Track } from 'livekit-client';
import { io } from 'socket.io-client';
import { Recommendation } from '@/features/app/types';
import { api } from '@/lib/api';
import { formatMessageTime } from '@/lib/date-time';

type CallMode = 'AUDIO' | 'VIDEO';
type CallConnection = { token: string; url: string; inviteCode?: string; canInvite?: boolean };
type ActiveCall = CallConnection & { roomId: string; mode: CallMode };
type CallMessage = { id: string; body: string; createdAt: string; sender: { id: string; displayName: string } };

type CallsProps = {
  onNotice: (value: string) => void;
  roomId: string | null;
  mode?: CallMode;
  connection?: CallConnection;
  expanded: boolean;
  recommendations: Recommendation[];
  currentUserId: string;
  timeZone: string;
  onOpen: () => void;
  onEnd: () => void;
  onStarted?: (call: ActiveCall) => void;
};

export function Calls({ onNotice, roomId, mode = 'VIDEO', connection, expanded, recommendations, currentUserId, timeZone, onOpen, onEnd, onStarted }: CallsProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'failed'>('idle');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [canInvite, setCanInvite] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [callMessages, setCallMessages] = useState<CallMessage[]>([]);
  const [callText, setCallText] = useState('');
  const startInFlight = useRef(false);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    if (roomId && !room && !startInFlight.current) void start(roomId, connection, mode);
  }, [roomId, room, connection?.token, mode]);

  useEffect(() => () => {
    void roomRef.current?.disconnect();
  }, []);

  function syncParticipants(nextRoom: Room): void {
    setParticipants([nextRoom.localParticipant, ...nextRoom.remoteParticipants.values()]);
  }

  async function start(existingRoomId?: string, existingConnection?: CallConnection, callMode: CallMode = 'VIDEO'): Promise<void> {
    if (startInFlight.current || roomRef.current) return;
    startInFlight.current = true;
    let targetRoomId: string | null = null;
    let nextRoom: Room | null = null;
    setConnectionState('connecting');
    try {
      const createdRoom = existingRoomId ? null : await api.request<{ id: string } & CallConnection>('calls/rooms', { method: 'POST', body: JSON.stringify({ title: 'Новая встреча', maxParticipants: 10 }) });
      targetRoomId = existingRoomId ?? createdRoom!.id;
      const nextConnection = existingConnection ?? { token: createdRoom!.token, url: createdRoom!.url, inviteCode: createdRoom!.inviteCode, canInvite: createdRoom!.canInvite };
      nextRoom = new Room({ adaptiveStream: true, dynacast: true, stopLocalTrackOnUnpublish: false });
      const synchronize = () => syncParticipants(nextRoom!);
      nextRoom.on(RoomEvent.ParticipantConnected, synchronize);
      nextRoom.on(RoomEvent.ParticipantDisconnected, synchronize);
      nextRoom.on(RoomEvent.TrackSubscribed, synchronize);
      nextRoom.on(RoomEvent.TrackUnsubscribed, synchronize);
      nextRoom.on(RoomEvent.TrackMuted, synchronize);
      nextRoom.on(RoomEvent.TrackUnmuted, synchronize);
      nextRoom.on(RoomEvent.ActiveSpeakersChanged, synchronize);
      nextRoom.on(RoomEvent.LocalTrackPublished, synchronize);
      nextRoom.on(RoomEvent.LocalTrackUnpublished, synchronize);
      await nextRoom.connect(nextConnection.url, nextConnection.token);
      roomRef.current = nextRoom;
      setRoom(nextRoom);
      setActiveRoomId(targetRoomId);
      setInviteCode(nextConnection.inviteCode ?? null);
      setCanInvite(Boolean(nextConnection.canInvite));
      setCallMessages([]);
      syncParticipants(nextRoom);
      onStarted?.({ roomId: targetRoomId, ...nextConnection, mode: callMode });
      setConnectionState('idle');
      try {
        await nextRoom.localParticipant.setMicrophoneEnabled(true);
        setMicrophoneEnabled(true);
      } catch {
        onNotice('Не удалось включить микрофон');
      }
      if (callMode === 'VIDEO') {
        try {
          await nextRoom.localParticipant.setCameraEnabled(true);
          setCameraEnabled(true);
          syncParticipants(nextRoom);
        } catch {
          onNotice('Не удалось включить камеру');
        }
      }
    } catch {
      nextRoom?.disconnect();
      if (targetRoomId) await api.request(`calls/rooms/${targetRoomId}/leave`, { method: 'POST' }).catch(() => undefined);
      setConnectionState('failed');
    } finally {
      startInFlight.current = false;
    }
  }

  async function leave(): Promise<void> {
    try {
      if (activeRoomId) await api.request(`calls/rooms/${activeRoomId}/leave`, { method: 'POST' });
    } catch {
      onNotice('Соединение закрыто');
    } finally {
      roomRef.current?.disconnect();
      roomRef.current = null;
      setRoom(null);
      setActiveRoomId(null);
      setParticipants([]);
      setMicrophoneEnabled(false);
      setCameraEnabled(false);
      setInviteCode(null);
      setCanInvite(false);
      setInviteOpen(false);
      setCallMessages([]);
      setCallText('');
      setConnectionState('idle');
      onEnd();
    }
  }

  async function toggleMicrophone(): Promise<void> {
    if (!room) return;
    try {
      const enabled = !microphoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(enabled);
      setMicrophoneEnabled(enabled);
      syncParticipants(room);
    } catch {
      onNotice('Не удалось изменить состояние микрофона');
    }
  }

  async function toggleCamera(): Promise<void> {
    if (!room) return;
    try {
      const enabled = !cameraEnabled;
      await room.localParticipant.setCameraEnabled(enabled);
      setCameraEnabled(enabled);
      syncParticipants(room);
    } catch {
      onNotice('Не удалось изменить состояние камеры');
    }
  }

  async function sendCallMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!activeRoomId || !callText.trim()) return;
    try {
      const message = await api.request<CallMessage>(`calls/rooms/${activeRoomId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ clientMessageId: crypto.randomUUID(), body: callText })
      });
      setCallMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      setCallText('');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'Не удалось отправить сообщение');
    }
  }

  useEffect(() => {
    const token = api.getAccessToken();
    const endpoint = process.env.NEXT_PUBLIC_REALTIME_URL || window.location.origin;
    if (!activeRoomId || !room || !token || !endpoint) return;
    let cancelled = false;
    void api.request<CallMessage[]>(`calls/rooms/${activeRoomId}/messages`).then((items) => {
      if (!cancelled) setCallMessages(items);
    }).catch(() => undefined);
    const socket = io(endpoint, { auth: { token }, transports: ['websocket'] });
    socket.emit('call:join', { roomId: activeRoomId });
    socket.on('call:message', (message: CallMessage) => {
      setCallMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    });
    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [activeRoomId, room]);

  if (!room) {
    if (!expanded && !roomId) return null;
    if (!expanded && roomId) return <button className={`active-call-bar ${connectionState === 'failed' ? 'failed' : ''}`} onClick={onOpen}><span className="active-call-pulse" /><span><b>{connectionState === 'failed' ? 'Не удалось подключиться' : 'Идёт подключение к звонку'}</b><small>{mode === 'AUDIO' ? 'Аудиозвонок' : 'Видеозвонок'}</small></span><strong>Открыть</strong></button>;
    return <section className="call-room call-room-pending"><button className="call-back call-pending-back" onClick={onEnd}>← Назад к разделам</button><div className="call-pending"><span className="call-kicker">{mode === 'AUDIO' ? 'Аудиозвонок' : 'Видеозвонок'}</span><h2>{connectionState === 'connecting' ? 'Подключаемся…' : connectionState === 'failed' ? 'Не удалось подключиться' : 'Начать звонок'}</h2><p>{connectionState === 'failed' ? 'Проверьте сеть и повторите попытку.' : 'Подключаем защищённое соединение.'}</p>{connectionState === 'connecting' ? <button className="secondary" disabled>Подключаемся…</button> : roomId ? <div className="call-pending-actions"><button className="primary" onClick={() => void start(roomId, connection, mode)}>Повторить</button><button className="secondary" onClick={onEnd}>Завершить</button></div> : <button className="primary" onClick={() => void start()}>Создать встречу</button>}</div></section>;
  }

  const videoEnabled = mode === 'VIDEO' || cameraEnabled || participants.some((participant) => {
    const publication = participant.getTrackPublication(Track.Source.Camera);
    return Boolean(publication?.track && !publication.isMuted);
  });
  const audio = participants.filter((participant) => participant !== room.localParticipant).map((participant) => <ParticipantAudio key={`audio-${participant.sid || participant.identity}`} participant={participant} />);
  if (!expanded) return <>{audio}<button className="active-call-bar" onClick={onOpen}><span className="active-call-pulse" /><span><b>Звонок идёт</b><small>{participants.length} {participants.length === 1 ? 'участник' : participants.length < 5 ? 'участника' : 'участников'}</small></span><strong>Вернуться</strong></button></>;
  return <section className="call-room call-room-active"><header className="call-topbar"><button className="call-back" onClick={onOpen}>← Диалог</button><div><span className="call-kicker">{mode === 'AUDIO' && !videoEnabled ? 'Аудиозвонок' : 'Видеозвонок'}</span><strong>{participants.length} {participants.length === 1 ? 'участник' : participants.length < 5 ? 'участника' : 'участников'}</strong></div><div className="call-top-actions">{canInvite && <button className="call-invite-button" onClick={() => setInviteOpen(true)}><InviteIcon /> Пригласить</button>}<span className="call-status"><i />Защищено</span></div></header><div className="call-layout"><div className="call-stage" data-count={Math.min(participants.length, 10)}>{participants.map((participant) => <CallTile key={participant.sid || participant.identity} participant={participant} local={participant === room.localParticipant} videoEnabled={videoEnabled} />)}</div><aside className="call-sidebar"><section className="call-members"><div className="call-sidebar-heading"><strong>Участники</strong><span>{participants.length}/10</span></div>{participants.map((participant) => <CallMember key={`member-${participant.sid || participant.identity}`} participant={participant} local={participant === room.localParticipant} />)}</section><section className="call-chat"><div className="call-sidebar-heading"><strong>Чат встречи</strong></div><div className="call-message-list">{callMessages.map((message) => <div className={message.sender.id === currentUserId ? 'call-message mine' : 'call-message'} key={message.id}><b>{message.sender.displayName}</b><p>{message.body}</p><small>{formatMessageTime(message.createdAt, timeZone)}</small></div>)}</div><form className="call-composer" onSubmit={(event) => void sendCallMessage(event)}><input value={callText} onChange={(event) => setCallText(event.target.value)} maxLength={4000} placeholder="Сообщение в чат…" /><button type="submit" aria-label="Отправить сообщение">↑</button></form></section></aside></div>{audio}<footer className="call-toolbar"><button className={`call-control ${microphoneEnabled ? '' : 'off'}`} onClick={() => void toggleMicrophone()} aria-label={microphoneEnabled ? 'Выключить микрофон' : 'Включить микрофон'} title={microphoneEnabled ? 'Выключить микрофон' : 'Включить микрофон'}><MicrophoneIcon muted={!microphoneEnabled} /></button><button className={`call-control ${cameraEnabled ? '' : 'off'}`} onClick={() => void toggleCamera()} aria-label={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'} title={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}><CameraIcon disabled={!cameraEnabled} /></button><button className="call-control leave" onClick={() => void leave()} aria-label="Завершить звонок" title="Завершить звонок"><PhoneIcon /></button></footer>{inviteOpen && activeRoomId && inviteCode && <CallInviteDialog roomId={activeRoomId} inviteCode={inviteCode} recommendations={recommendations} currentUserId={currentUserId} onClose={() => setInviteOpen(false)} onNotice={onNotice} />}</section>;
}

function CallInviteDialog({ roomId, inviteCode, recommendations, currentUserId, onClose, onNotice }: { roomId: string; inviteCode: string; recommendations: Recommendation[]; currentUserId: string; onClose: () => void; onNotice: (value: string) => void }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const candidates = useMemo(() => recommendations.filter((person) => person.id !== currentUserId), [recommendations, currentUserId]);
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/?join=${inviteCode}`;

  function toggle(userId: string): void {
    setSelectedIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : current.length < 9 ? [...current, userId] : current);
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      onNotice('Ссылка на встречу скопирована');
    } catch {
      setError('Не удалось скопировать ссылку автоматически');
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedIds.length || saving) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.request<{ invited: number }>(`calls/rooms/${roomId}/invitees`, { method: 'POST', body: JSON.stringify({ userIds: selectedIds }) });
      onNotice(`Приглашено: ${result.invited}`);
      setSelectedIds([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить приглашения');
    } finally {
      setSaving(false);
    }
  }

  return <div className="call-invite-backdrop" role="presentation" onMouseDown={onClose}><form className="call-invite-dialog" onSubmit={(event) => void invite(event)} onMouseDown={(event) => event.stopPropagation()}><div className="call-invite-title"><div><h2>Пригласить в встречу</h2><p>Можно добавить до 10 участников.</p></div><button type="button" className="dialog-close" onClick={onClose} aria-label="Закрыть">×</button></div><div className="call-share-link"><input readOnly value={link} aria-label="Ссылка на встречу" /><button type="button" className="secondary" onClick={() => void copyLink()}>Копировать</button></div><div className="call-invite-label">Или пригласить из сообщества</div><div className="call-invite-people">{candidates.length ? candidates.map((person) => <label key={person.id} className={selectedIds.includes(person.id) ? 'call-invite-person selected' : 'call-invite-person'}><input type="checkbox" checked={selectedIds.includes(person.id)} onChange={() => toggle(person.id)} /><span>{person.displayName}</span><small>{person.profile?.interests.slice(0, 2).join(' · ') || 'Участник сообщества'}</small></label>) : <p className="group-empty">Сейчас нет доступных пользователей.</p>}</div>{error && <p className="group-error">{error}</p>}<div className="group-dialog-actions"><button type="button" className="secondary" onClick={onClose}>Готово</button><button className="primary" disabled={!selectedIds.length || saving}>{saving ? 'Отправляем…' : 'Пригласить'}</button></div></form></div>;
}

function CallTile({ participant, local, videoEnabled }: { participant: Participant; local: boolean; videoEnabled: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const track = videoEnabled ? participant.getTrackPublication(Track.Source.Camera)?.track : undefined;
  const hasVideo = Boolean(track && !participant.getTrackPublication(Track.Source.Camera)?.isMuted);

  useEffect(() => {
    if (!hasVideo || !track || track.kind !== Track.Kind.Video || !video.current) return;
    track.attach(video.current);
    return () => {
      if (video.current) track.detach(video.current);
    };
  }, [hasVideo, track]);

  const name = local ? 'Вы' : participant.name || 'Участник';
  const avatarUrl = getParticipantAvatar(participant);
  return <article className={participant.isSpeaking ? 'call-tile speaking' : 'call-tile'}>{hasVideo ? <video ref={video} autoPlay playsInline muted={local} /> : <div className="call-avatar-center">{avatarUrl ? <img src={avatarUrl} alt={`Аватар ${name}`} /> : <span>{name.slice(0, 1).toUpperCase()}</span>}</div>}<div className="call-person"><span>{name}</span>{!local && participant.isSpeaking && <i>Говорит</i>}</div>{videoEnabled && !hasVideo && <span className="camera-off">Камера выключена</span>}</article>;
}

function CallMember({ participant, local }: { participant: Participant; local: boolean }) {
  const name = local ? 'Вы' : participant.name || 'Участник';
  const avatarUrl = getParticipantAvatar(participant);
  return <div className={participant.isSpeaking ? 'call-member speaking' : 'call-member'}>{avatarUrl ? <img className="call-member-avatar" src={avatarUrl} alt="" /> : <i>{name.slice(0, 1).toUpperCase()}</i>}<span>{name}</span>{participant.isSpeaking && <b>Говорит</b>}</div>;
}

function getParticipantAvatar(participant: Participant): string | null {
  try {
    const metadata = JSON.parse(participant.metadata ?? '{}') as { avatarUrl?: unknown };
    return typeof metadata.avatarUrl === 'string' && metadata.avatarUrl ? metadata.avatarUrl : null;
  } catch {
    return null;
  }
}

function ParticipantAudio({ participant }: { participant: Participant }) {
  const audio = useRef<HTMLAudioElement>(null);
  const track = participant.getTrackPublication(Track.Source.Microphone)?.track;

  useEffect(() => {
    if (!track || track.kind !== Track.Kind.Audio || !audio.current) return;
    track.attach(audio.current);
    return () => {
      if (audio.current) track.detach(audio.current);
    };
  }, [track]);

  return <audio ref={audio} autoPlay />;
}

function InviteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 12a4 4 0 1 0-3.9-4A4 4 0 0 0 15 12Zm-9 1v2h2v2h2v-2h2v-2h-2V9H8v2Zm9 1c-2.7 0-8 1.35-8 4v2h16v-2c0-2.65-5.3-4-8-4Z" /></svg>;
}

function MicrophoneIcon({ muted }: { muted: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-8.94 3.1L6.6 15.55A7 7 0 0 0 19 11h-2ZM11 21h2v-3.1A7 7 0 0 1 5 11H3a9 9 0 0 0 8 8.94V21Z" />{muted && <path d="m4 3 17 17-1.4 1.4L2.6 4.4 4 3Z" />}</svg>;
}

function CameraIcon({ disabled }: { disabled: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10a2 2 0 0 1 2 2v1.5L20 7v10l-4-2.5V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />{disabled && <path d="m4 3 17 17-1.4 1.4L2.6 4.4 4 3Z" />}</svg>;
}

function PhoneIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.5 3 3.9 5.4 6.9 6.9l2.3-2.3a1 1 0 0 1 1-.24c1.1.36 2.3.54 3.5.54a1 1 0 0 1 1 1V21a1 1 0 0 1-1 1C10.75 22 2 13.25 2 2.7a1 1 0 0 1 1-1h3.4a1 1 0 0 1 1 1c0 1.2.18 2.4.54 3.5a1 1 0 0 1-.25 1l-2.3 2.4Z" /></svg>;
}
