export function Avatar({ url, name }: { url?: string | null; name: string }) {
  return url ? <img className="avatar" src={url} alt={`Аватар ${name}`} /> : <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>;
}
