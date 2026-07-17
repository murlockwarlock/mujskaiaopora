'use client';

import { FormEvent, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { FormField } from '@/components/form-field';
import { Profile } from '@/features/app/types';
import { api } from '@/lib/api';

export function ProfileEditor({ profile, onProfile, onNotice }: { profile: Profile; onProfile: (profile: Profile) => void; onNotice: (value: string) => void }) {
  const [bio, setBio] = useState(profile.bio);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFeedback('');
    try {
      const form = new FormData(event.currentTarget);
      const browserNotificationsEnabled = form.get('browserNotificationsEnabled') === 'on';
      if (browserNotificationsEnabled && Notification.permission === 'default') await Notification.requestPermission();
      const next = await api.request<Profile>('profile', { method: 'PATCH', body: JSON.stringify({ city: String(form.get('city')), timeZone: String(form.get('timeZone')), bio, languages: String(form.get('languages')).split(',').map((item) => item.trim()).filter(Boolean), interests: String(form.get('interests')).split(',').map((item) => item.trim()).filter(Boolean), messageSoundEnabled: form.get('messageSoundEnabled') === 'on', callSoundEnabled: form.get('callSoundEnabled') === 'on', browserNotificationsEnabled }) });
      onProfile(next);
      setBio(next.bio);
      setFeedback('Изменения сохранены');
      onNotice('Профиль сохранён');
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File): Promise<void> {
    const upload = await api.request<{ uploadId: string; uploadUrl: string }>('profile/avatar/uploads', { method: 'POST', body: JSON.stringify({ contentType: file.type, byteSize: file.size }) });
    await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    const next = await api.request<Profile>('profile/avatar/confirm', { method: 'POST', body: JSON.stringify({ uploadId: upload.uploadId }) });
    onProfile(next);
    onNotice('Аватар обновлён');
  }

  return <section className="profile-editor"><div className="profile-heading"><Avatar url={profile.avatarUrl} name={profile.user?.displayName ?? 'Профиль'} /><label className="avatar-action">Изменить фото<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && void uploadAvatar(event.target.files[0])} /></label></div><form onSubmit={(event) => void save(event)}><FormField label="Город" name="city" defaultValue={profile.city ?? ''} /><FormField label="Часовой пояс" name="timeZone" defaultValue={profile.timeZone} /><label className="field bio-field">О себе<textarea name="bio" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={1400} placeholder="Расскажите о себе, своих темах и о том, кого хотите найти" /><span>{bio.length}/1400</span></label><FormField label="Языки через запятую" name="languages" defaultValue={profile.languages.join(', ')} /><FormField label="Темы через запятую" name="interests" defaultValue={profile.interests.join(', ')} /><div className="notification-settings"><label><input type="checkbox" name="messageSoundEnabled" defaultChecked={profile.messageSoundEnabled} /> Звук новых сообщений</label><label><input type="checkbox" name="callSoundEnabled" defaultChecked={profile.callSoundEnabled} /> Звук входящего звонка</label><label><input type="checkbox" name="browserNotificationsEnabled" defaultChecked={profile.browserNotificationsEnabled} /> Системные уведомления браузера</label></div><div className="profile-save"><button className="primary" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить изменения'}</button>{feedback && <span className={feedback === 'Изменения сохранены' ? 'profile-success' : 'profile-error'}>{feedback}</span>}</div></form></section>;
}
