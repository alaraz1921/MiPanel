create table if not exists public.google_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_credentials enable row level security;

drop trigger if exists google_credentials_updated_at on public.google_credentials;
create trigger google_credentials_updated_at
before update on public.google_credentials
for each row execute function public.set_updated_at();
