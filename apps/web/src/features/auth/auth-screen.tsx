'use client';

import { FormEvent, useState } from 'react';
import { FormField } from '@/components/form-field';
import { api, Session } from '@/lib/api';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: Session) => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const session = mode === 'register'
        ? await api.register({ email: String(data.get('email')), password: String(data.get('password')), displayName: String(data.get('displayName')) })
        : await api.login({ email: String(data.get('email')), password: String(data.get('password')) });
      await onAuthenticated(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page"><section className="auth-copy"><div className="brand-mark">◡</div><p className="eyebrow">Сообщество поддержки</p><h1>Здесь можно говорить открыто</h1><p>Находите собеседников с похожим опытом и общайтесь в комфортном для себя темпе.</p></section><section className="auth-card"><form onSubmit={(event) => void submit(event)}><div className="auth-tabs"><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Регистрация</button><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Войти</button></div>{mode === 'register' && <FormField label="Как к вам обращаться" name="displayName" minLength={2} required />}<FormField label="E-mail" name="email" type="email" required /><FormField label="Пароль" name="password" type="password" minLength={8} required />{error && <p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Подождите…' : mode === 'register' ? 'Создать профиль' : 'Войти'}</button></form><PasswordReset /></section></main>;
}

function PasswordReset() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const email = String(new FormData(event.currentTarget).get('resetEmail'));
      await api.request('auth/password-reset/request', { method: 'POST', authenticated: false, body: JSON.stringify({ email }) });
      setMessage('Если адрес зарегистрирован, письмо уже отправлено.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить ссылку');
    } finally {
      setBusy(false);
    }
  }

  return open ? <form className="reset-form" onSubmit={(event) => void submit(event)}><input name="resetEmail" type="email" placeholder="Ваш e-mail" required /><button className="text-button" disabled={busy}>{busy ? 'Отправляем…' : 'Отправить ссылку'}</button>{message && <small className="form-success">{message}</small>}{error && <small className="form-error">{error}</small>}</form> : <button className="text-button" type="button" onClick={() => setOpen(true)}>Не помню пароль</button>;
}
