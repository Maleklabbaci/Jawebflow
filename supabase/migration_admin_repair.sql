-- ===========================================================================
-- JawebFlow : RÉPARATION / CRÉATION DU COMPTE ADMIN — UNE SEULE INSTRUCTION
--
-- Colle TOUT ce bloc tel quel dans SQL Editor → Run. (Ne sélectionne pas une
-- partie du texte avant de cliquer Run.)
--
-- Ce qu'il fait : supprime l'ancien compte cassé, puis donne le rôle
-- superadmin au compte auth s'il existe. S'il n'existe pas encore, le script
-- te le dit en erreur : crée-le alors dans Authentication → Add user (coche
-- "Auto confirm") et RE-EXÉCUTE ce même bloc.
-- ===========================================================================
do $$
declare
  admin_email text := 'admin@jawebflow.com';  -- ⚠️ remplace par ton email admin (ici uniquement)
  admin_id uuid;
begin
  -- 1) Nettoyage de l'éventuel compte cassé (profil + auth).
  delete from public.users where email = admin_email;
  delete from auth.users  where email = admin_email;

  -- 2) Rôle superadmin sur le compte auth (s'il existe déjà).
  select id into admin_id from auth.users where email = admin_email;

  if admin_id is null then
    raise exception 'COMPTE INTROUVABLE (%) : crée-le d''abord dans Supabase → Authentication → Add user (mot de passe fort + coche Auto confirm), puis RE-EXÉCUTE ce même bloc.', admin_email;
  end if;

  insert into public.users (id, email, display_name, role)
  values (admin_id, admin_email, 'Super Admin', 'superadmin')
  on conflict (id) do update
    set role = 'superadmin',
        email = excluded.email,
        updated_at = now();

  raise notice 'OK : % est SUPERADMIN. Va sur /admin et connecte-toi.', admin_email;
end $$;
