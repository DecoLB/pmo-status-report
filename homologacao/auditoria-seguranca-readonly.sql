-- PMO | Verificacao de seguranca (somente leitura).
-- Executar com acesso administrativo ao SQL Editor do Supabase.
-- NAO muda perfis, senhas, permissoes ou dados de projetos.
-- Requer inspecao humana dos resultados antes de qualquer migracao.

-- 1. RLS habilitado nas tabelas criticas.
SELECT schemaname, tablename, rowsecurity AS rls_ativo
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'perfis','projetos','projeto_gerentes','status_semanais',
    'relatorio_marcos_semanais','relatorio_riscos_semanais',
    'relatorio_proximos_passos_semanais','auditoria_alteracoes'
  )
ORDER BY tablename;

-- 2. Politicas RLS efetivas.
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN (
    'perfis','projetos','projeto_gerentes','status_semanais',
    'relatorio_marcos_semanais','relatorio_riscos_semanais',
    'relatorio_proximos_passos_semanais','auditoria_alteracoes'
  )
ORDER BY tablename, policyname;

-- 3. Grants expostos a anon, authenticated e PUBLIC.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('perfis','projetos','projeto_gerentes','status_semanais','auditoria_alteracoes')
  AND grantee IN ('anon','authenticated','PUBLIC')
ORDER BY table_name, grantee, privilege_type;

-- 4. Verificar SECURITY DEFINER, schema e permissoes de RPCs.
SELECT n.nspname AS esquema, p.proname AS funcao, p.prosecdef AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_pode_executar,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS autenticado_pode_executar
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','app_private')
  AND p.proname IN (
    'vincular_gerente_criador','registrar_auditoria','pmo_salvar_relatorio_completo',
    'pmo_ler_relatorio_completo','pmo_detalhe_publicado','pmo_detalhe_publicado_privado',
    'resumo_publicado_por_gerente','ler_resumo_por_gerente'
  )
ORDER BY n.nspname,p.proname;

-- 5. Gatilhos que protegem vinculo de gerente e auditoria.
SELECT c.relname AS tabela,t.tgname AS gatilho,
       pn.nspname || '.' || p.proname AS funcao,
       p.prosecdef AS definer,
       pg_get_triggerdef(t.oid,true) AS definicao
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_proc p ON p.oid=t.tgfoid
JOIN pg_namespace pn ON pn.oid=p.pronamespace
WHERE c.relnamespace='public'::regnamespace
  AND c.relname IN ('perfis','projetos','projeto_gerentes','status_semanais')
  AND NOT t.tgisinternal
ORDER BY c.relname,t.tgname;

-- 6. Vinculos duplicados e projetos sem gerente.
SELECT p.id,p.nome,COUNT(pg.usuario_id) AS gerentes_vinculados
FROM public.projetos p
LEFT JOIN public.projeto_gerentes pg ON pg.projeto_id=p.id
GROUP BY p.id,p.nome
HAVING COUNT(pg.usuario_id) <> 1
ORDER BY p.nome;

-- 7. Quantidade de usuarios autenticados sem perfil ativo.
SELECT COUNT(*) AS usuarios_sem_perfil_ativo
FROM auth.users u
LEFT JOIN public.perfis p ON p.usuario_id=u.id AND p.ativo
WHERE p.usuario_id IS NULL;

-- 8. Quantidade de reports por situacao e data.
SELECT data_referencia,situacao_publicacao,COUNT(*) AS total
FROM public.status_semanais
GROUP BY data_referencia,situacao_publicacao
ORDER BY data_referencia DESC,situacao_publicacao;

-- Antes de produção: testar administrador, gerente atribuido,
-- gerente nao atribuido, usuario de consulta e usuario anonimo.
