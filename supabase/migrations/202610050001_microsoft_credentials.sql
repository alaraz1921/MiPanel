-- Credenciales de renovación de Microsoft cifradas por Edge Functions.
-- El navegador no puede leer ni escribir esta tabla: solo la service role
-- de las funciones la utiliza después de validar la sesión del usuario.
create table if not exists public.microsoft_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.microsoft_credentials enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists microsoft_credentials_updated_at on public.microsoft_credentials;
create trigger microsoft_credentials_updated_at
before update on public.microsoft_credentials
for each row execute function public.set_updated_at();
