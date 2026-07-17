'use client';

import { useEffect, useRef, useState } from 'react';
import { Participant, Room, RoomEvent, Track } from 'livekit-client';
import { api } from '@/lib/api';

type CallMode = 'AUDIO' | 'VIDEO';
type CallConnection = { token: string; url: string };
type ActiveCall = CallConnection & { roomId: string; mode: CallMode };

export function Calls({ onNotice, roomId, mode = 'VIDEO', connection, expanded, onOpen, onEnd, onStarted }: { onNotice: (value: string) => void; roomId: string | null; mode?: CallMode; connection?: CallConnection; expanded: boolean; onOpen: () => void; onEnd: () => void; onStarted?: (call: ActiveCall) => void }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'failed'>('idle');
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
      const nextConnection = existingConnection ?? { token: createdRoom!.token, url: createdRoom!.url };
      nextRoom = new Room({ adaptiveStream: true, dynacast: true });
      const synchronize = () => syncParticipants(nextRoom!);
      nextRoom.on(RoomEvent.ParticipantConnected, synchronize);
      nextRoom.on(RoomEvent.ParticipantDisconnected, synchronize);
      nextRoom.on(RoomEvent.TrackSubscribed, synchronize);
      nextRoom.on(RoomEvent.TrackUnsubscribed, synchronize);
      nextRoom.on(RoomEvent.TrackMuted, synchronize);
      nextRoom.on(RoomEvent.TrackUnmuted, synchronize);
      nextRoom.on(RoomEvent.LocalTrackPublished, synchronize);
      nextRoom.on(RoomEvent.LocalTrackUnpublished, synchronize);
      await nextRoom.connect(nextConnection.url, nextConnection.token);
      roomRef.current = nextRoom;
      setRoom(nextRoom);
      setActiveRoomId(targetRoomId);
      syncParticipants(nextRoom);
      onStarted?.({ roomId: targetRoomId, ...nextConnection, mode: callMode });
      setConnectionState('idle');
      onNotice('Вы подключились к звонку');
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
      setConnectionState('idle');
      onEnd();
    }
  }

  async function toggleMicrophone(): Promise<void> {
    if (!room) return;
    const enabled = !microphoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setMicrophoneEnabled(enabled);
  }

  async function toggleCamera(): Promise<void> {
    if (!room) return;
    const enabled = !cameraEnabled;
    await room.localParticipant.setCameraEnabled(enabled);
    setCameraEnabled(enabled);
    syncParticipants(room);
  }

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
  return <section className="call-room call-room-active"><header className="call-topbar"><button className="call-back" onClick={onOpen}>← Диалог</button><div><span className="call-kicker">{mode === 'AUDIO' && !videoEnabled ? 'Аудиозвонок' : 'Видеозвонок'}</span><strong>{participants.length} {participants.length === 1 ? 'участник' : participants.length < 5 ? 'участника' : 'участников'}</strong></div><span className="call-status"><i />Соединение защищено</span></header><div className="call-stage" data-count={Math.min(participants.length, 10)}>{participants.map((participant) => <CallTile key={participant.sid || participant.identity} participant={participant} local={participant === room.localParticipant} videoEnabled={videoEnabled} />)}</div>{audio}<footer className="call-toolbar"><button className={`call-control ${microphoneEnabled ? '' : 'off'}`} onClick={() => void toggleMicrophone()} aria-label={microphoneEnabled ? 'Выключить микрофон' : 'Включить микрофон'} title={microphoneEnabled ? 'Выключить микрофон' : 'Включить микрофон'}><MicrophoneIcon muted={!microphoneEnabled} /></button><button className={`call-control ${cameraEnabled ? '' : 'off'}`} onClick={() => void toggleCamera()} aria-label={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'} title={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}><CameraIcon disabled={!cameraEnabled} /></button><button className="call-control leave" onClick={() => void leave()} aria-label="Завершить звонок" title="Завершить звонок"><PhoneIcon /></button></footer></section>;
}

function CallTile({ participant, local, videoEnabled }: { participant: Participant; local: boolean; videoEnabled: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const track = videoEnabled ? participant.getTrackPublication(Track.Source.Camera)?.track : undefined;

  useEffect(() => {
    if (!track || track.kind !== Track.Kind.Video || !video.current) return;
    track.attach(video.current);
    return () => {
      track.detach(video.current!);
    };
  }, [track]);

  const name = local ? 'Вы' : participant.name || 'Участник';
  const hasVideo = Boolean(track && !participant.getTrackPublication(Track.Source.Camera)?.isMuted);

  return <article className="call-tile">{hasVideo ? <video ref={video} autoPlay playsInline muted={local} /> : <div className="call-avatar">{name.slice(0, 1).toUpperCase()}</div>}<div className="call-person"><span>{name}</span>{!local && participant.isSpeaking && <i>Говорит</i>}</div>{videoEnabled && !hasVideo && <span className="camera-off">Камера выключена</span>}</article>;
}

function ParticipantAudio({ participant }: { participant: Participant }) {
  const audio = useRef<HTMLAudioElement>(null);
  const track = participant.getTrackPublication(Track.Source.Microphone)?.track;

  useEffect(() => {
    if (!track || track.kind !== Track.Kind.Audio || !audio.current) return;
    track.attach(audio.current);
    return () => {
      track.detach(audio.current!);
    };
  }, [track]);

  return <audio ref={audio} autoPlay />;
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
