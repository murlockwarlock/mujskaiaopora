'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';

export default function ResetPasswordPage() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password'));
    const confirmPassword = String(data.get('confirmPassword'));
    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setError('Ссылка недействительна');
      return;
    }
    try {
      await api.request('auth/password-reset/confirm', { method: 'POST', authenticated: false, body: JSON.stringify({ token, password }) });
      setMessage('Пароль изменён. Теперь можно войти.');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить пароль');
    }
  }

  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><p className="eyebrow">Восстановление доступа</p><h1>Новый пароль</h1><label className="field"><span>Пароль</span><input name="password" type="password" minLength={8} required /></label><label className="field"><span>Повторите пароль</span><input name="confirmPassword" type="password" minLength={8} required /></label>{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}<button className="primary">Сохранить пароль</button></form></main>;
}
