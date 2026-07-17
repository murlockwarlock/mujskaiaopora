'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Report = { id: string; reason: string; details: string | null; reporter: { displayName: string }; targetUser: { id: string; displayName: string } };
type User = { id: string; email: string; displayName: string; role: 'USER' | 'MODERATOR' | 'ADMIN'; status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'; createdAt: string; profile: { city: string | null } | null };

export function Admin() {
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [feedback, setFeedback] = useState('');

  async function reload(): Promise<void> {
    try {
      const [nextReports, nextUsers] = await Promise.all([api.request<Report[]>('reports'), api.request<User[]>('reports/users')]);
      setReports(nextReports);
      setUsers(nextUsers);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Не удалось загрузить модерацию');
    }
  }

  useEffect(() => { void reload(); }, []);

  async function suspend(userId: string): Promise<void> {
    try {
      await api.request(`reports/users/${userId}/suspend`, { method: 'POST', body: JSON.stringify({ reason: 'Нарушение правил сообщества' }) });
      setFeedback('Учётная запись приостановлена');
      await reload();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Не удалось приостановить учётную запись');
    }
  }

  async function restore(userId: string): Promise<void> {
    try {
      await api.request(`reports/users/${userId}/restore`, { method: 'POST', body: JSON.stringify({ reason: 'Ограничение снято модератором' }) });
      setFeedback('Учётная запись восстановлена');
      await reload();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Не удалось восстановить учётную запись');
    }
  }

  async function resolve(reportId: string): Promise<void> {
    try {
      await api.request(`reports/${reportId}/resolve`, { method: 'POST', body: JSON.stringify({ resolution: 'Рассмотрено модератором' }) });
      setFeedback('Жалоба закрыта');
      await reload();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Не удалось закрыть жалобу');
    }
  }

  return <section className="admin"><header className="admin-heading"><div><p className="home-kicker">Управление сообществом</p><h2>Модерация</h2></div><button className="secondary" type="button" onClick={() => void reload()}>Обновить</button></header>{feedback && <p className="admin-feedback">{feedback}</p>}<div className="admin-grid"><section><h3>Открытые жалобы</h3>{reports.length ? reports.map((report) => <article className="admin-report" key={report.id}><div><strong>{report.targetUser.displayName}</strong><span>От: {report.reporter.displayName}</span></div><p>{report.reason}</p>{report.details && <small>{report.details}</small>}<footer><button className="text-button" type="button" onClick={() => void suspend(report.targetUser.id)}>Приостановить</button><button className="text-button" type="button" onClick={() => void resolve(report.id)}>Закрыть жалобу</button></footer></article>) : <p className="admin-empty">Открытых жалоб нет.</p>}</section><section><h3>Пользователи</h3><div className="admin-users">{users.map((user) => <article className="admin-user" key={user.id}><div><strong>{user.displayName}</strong><span>{user.profile?.city ?? 'Город не указан'} · {user.role}</span></div><span className={`admin-status ${user.status.toLowerCase()}`}>{user.status === 'ACTIVE' ? 'Активен' : user.status === 'SUSPENDED' ? 'Ограничен' : 'Удалён'}</span>{user.role !== 'ADMIN' && <button className="text-button" type="button" onClick={() => void (user.status === 'SUSPENDED' ? restore(user.id) : suspend(user.id))}>{user.status === 'SUSPENDED' ? 'Восстановить' : 'Приостановить'}</button>}</article>)}</div></section></div></section>;
}
