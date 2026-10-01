-- Recuperação de senha por e-mail: guarda só o hash do token (o link vale 1 hora).
alter table crm_usuarios add column reset_token_hash text;
alter table crm_usuarios add column reset_expira timestamp with time zone;
create index crm_usuarios_reset_idx on crm_usuarios (reset_token_hash) where reset_token_hash is not null;
