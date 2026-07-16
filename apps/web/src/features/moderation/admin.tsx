'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Report = { id: string; reason: string; targetUser: { displayName: string } };

export function Admin() {
  const [reports, setReports] = useState<Report[]>([]);
  useEffect(() => { void api.request<Report[]>('reports').then(setReports).catch(() => setReports([])); }, []);
  return <section className="admin"><h2>Очередь модерации</h2>{reports.length ? reports.map((report) => <article key={report.id}><strong>{report.targetUser.displayName}</strong><p>{report.reason}</p></article>) : <p>Нет открытых жалоб.</p>}</section>;
}
