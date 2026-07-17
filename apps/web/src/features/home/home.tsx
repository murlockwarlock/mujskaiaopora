import { Avatar } from '@/components/avatar';
import { Recommendation } from '@/features/app/types';

type HomeProps = {
  recommendations: Recommendation[];
  onStartConversation: (userId: string) => Promise<void>;
  onDismiss: (userId: string) => Promise<void>;
  onBlock: (userId: string) => Promise<void>;
};

export function Home({ recommendations, onStartConversation, onDismiss, onBlock }: HomeProps) {
  const person = recommendations[0];

  return <div className="home-page">
    <section className="home-hero">
      <div><p className="home-kicker">Сообщество</p><h2>Начните разговор с человеком, который вам близок.</h2><p>Анкеты подбираются по языкам и темам, которые вы указали в профиле.</p></div>
      <div className="home-hero-status"><span>●</span><strong>Без спешки</strong><small>Вы сами решаете, кому написать</small></div>
    </section>
    <section className="recommendation-section">
      <header className="recommendation-heading"><div><p className="home-kicker">Рекомендация</p><h2>Вам может подойти</h2></div>{person && <span>{recommendations.length} анкет в подборке</span>}</header>
      {person ? <article className="recommendation-card">
        <div className="recommendation-photo">{person.profile?.avatarUrl ? <img src={person.profile.avatarUrl} alt={`Аватар ${person.displayName}`} /> : <Avatar name={person.displayName} />}<span className="person-online">В сообществе</span><div className="recommendation-photo-shade" /></div>
        <div className="recommendation-content">
          <div className="recommendation-person"><div><h3>{person.displayName}</h3><p>{person.profile?.city ?? 'Город не указан'}</p></div><span className="person-marker">◌</span></div>
          <p className="recommendation-bio">{person.profile?.bio || 'Пока не рассказал о себе.'}</p>
          {Boolean(person.profile?.interests.length) && <div className="tags">{person.profile?.interests.slice(0, 5).map((item) => <span key={item}>{item}</span>)}</div>}
          <div className="recommendation-actions"><button className="recommendation-action skip" aria-label="Пропустить анкету" title="Пропустить" onClick={() => void onDismiss(person.id)}>×</button><button className="recommendation-message" onClick={() => void onStartConversation(person.id)}>Написать <span>↗</span></button></div>
          <div className="recommendation-secondary"><button className="text-button" onClick={() => void onDismiss(person.id)}>Следующая анкета</button><button className="text-button danger-link" title="Скроет анкету и запретит сообщения в обе стороны" onClick={() => void onBlock(person.id)}>Скрыть и заблокировать</button></div>
        </div>
      </article> : <div className="empty-recommendations"><h3>Пока новых анкет нет</h3><p>Когда появятся подходящие собеседники, они будут здесь.</p></div>}
    </section>
  </div>;
}
