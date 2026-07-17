type ErrorScreenProps = {
  code: string;
  title: string;
  message: string;
  onRetry?: () => void;
};

export function ErrorScreen({ code, title, message, onRetry }: ErrorScreenProps) {
  return <main className="error-page"><section className="error-card"><span className="error-code">{code}</span><div className="error-mark">◡</div><h1>{title}</h1><p>{message}</p><div className="error-actions"><a className="primary" href="/">На главную</a>{onRetry && <button className="secondary" onClick={onRetry}>Повторить</button>}</div></section></main>;
}
