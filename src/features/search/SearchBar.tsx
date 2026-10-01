import { FormEvent, useState } from 'react';

export function SearchBar() {
  const [query, setQuery] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    const url = `https://www.google.com/search?q=${encodeURIComponent(value)}`;
    window.location.assign(url);
  }

  return (
    <form className="search" onSubmit={submit}>
      <span aria-hidden="true">⌕</span>
      <input
        aria-label="Buscar en Google"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar en Google…"
        autoComplete="off"
      />
      <button type="submit">Buscar</button>
    </form>
  );
}
