export function FormField({ label, name, type = 'text', defaultValue, minLength, required }: { label: string; name: string; type?: string; defaultValue?: string; minLength?: number; required?: boolean }) {
  return <label className="field"><span>{label}</span><input name={name} type={type} defaultValue={defaultValue} minLength={minLength} required={required} /></label>;
}
