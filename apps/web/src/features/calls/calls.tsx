'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { api } from '@/lib/api';

export function Calls({ onNotice, roomId, onRoomConsumed, onClose }: { onNotice: (value: string) => void; roomId: string | null; onRoomConsumed: () => void; onClose?: () => void }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'failed'>('idle');
  const [error, setError] = useState('');
  const media = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (roomId && !room) void start(roomId);
  }, [roomId, room]);

  async function start(existingRoomId?: string): Promise<void> {
    let targetRoomId: string | null = null;
    let nextRoom: Room | null = null;
    setConnectionState('connecting');
    setError('');
    try {
      targetRoomId = existingRoomId ?? (await api.request<{ id: string }>('calls/rooms', { method: 'POST', body: JSON.stringify({ title: 'Новая встреча', maxParticipants: 10 }) })).id;
      const connection = await api.request<{ token: string; url: string }>(`calls/rooms/${targetRoomId}/join`, { method: 'POST' });
      nextRoom = new Room({ adaptiveStream: true, dynacast: true });
      nextRoom.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video) media.current?.append(track.attach());
      });
      await nextRoom.connect(connection.url, connection.token);
      await nextRoom.localParticipant.enableCameraAndMicrophone();
      const cameraTrack = nextRoom.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      if (cameraTrack?.kind === Track.Kind.Video) media.current?.append(cameraTrack.attach());
      setRoom(nextRoom);
      setActiveRoomId(targetRoomId);
      setMicrophoneEnabled(true);
      setCameraEnabled(true);
      onNotice('Вы подключились к встрече');
    } catch (cause) {
      nextRoom?.disconnect();
      if (targetRoomId) await api.request(`calls/rooms/${targetRoomId}/leave`, { method: 'POST' }).catch(() => undefined);
      setError(cause instanceof Error ? cause.message : 'Не удалось подключиться к встрече');
      setConnectionState('failed');
    } finally {
      onRoomConsumed();
    }
  }

  async function leave(): Promise<void> {
    if (activeRoomId) await api.request(`calls/rooms/${activeRoomId}/leave`, { method: 'POST' });
    room?.disconnect();
    setRoom(null);
    setActiveRoomId(null);
    setMicrophoneEnabled(false);
    setCameraEnabled(false);
    setConnectionState('idle');
    media.current?.replaceChildren();
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

  return <section className="call-room"><div className="call-copy"><p className="eyebrow">Аудио и видео</p><h2>{room ? 'Встреча идёт' : connectionState === 'connecting' ? 'Подключаемся к видеозвонку…' : 'Создайте безопасную встречу'}</h2><p>До 10 участников. Доступ выдаётся только приглашённым пользователям на короткое время.</p>{error && <p className="form-error">{error}</p>}{room ? <div className="call-controls"><button className="secondary" onClick={() => void toggleMicrophone()}>{microphoneEnabled ? 'Выключить микрофон' : 'Включить микрофон'}</button><button className="secondary" onClick={() => void toggleCamera()}>{cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}</button><button className="danger" onClick={() => void leave()}>Выйти</button>{onClose && <button className="text-button" onClick={onClose}>Вернуться к диалогу</button>}</div> : connectionState === 'connecting' ? <button className="secondary" disabled>Подключаемся…</button> : <button className="primary" onClick={() => void start()}>Создать встречу</button>}</div><div className="video-grid" ref={media} /></section>;
}
