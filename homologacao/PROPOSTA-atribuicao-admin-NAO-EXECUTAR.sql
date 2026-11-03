-- PMO V5 | Registro de migrações já aplicadas ao Supabase Projetos Naturgy.
-- NÃO EXECUTAR ESTE ARQUIVO COMO UMA NOVA MIGRAÇÃO.
-- A base já foi ajustada por migrações auditadas e consultas transacionais.
--
-- Aplicadas em 03/11/2026:
-- pmo_restrict_admin_publication_20261103
-- pmo_admin_secure_assignment_20261103
-- pmo_historico_proveniencia_20261103
-- pmo_convites_primeiro_acesso_20261103
-- pmo_resumo_historico_pendente_20261103
-- pmo_portfolio_status_and_indexes_20261103
-- pmo_ocultar_observacoes_financeiras_20261103
--
-- Funções disponíveis:
-- public.pmo_admin_listar_gerentes()
-- public.pmo_admin_atribuir_gerente(bigint, uuid)
-- public.pmo_portfolio_status()
--
-- Testes SQL transacionais realizados e revertidos:
-- Gerente não lista contas nem transfere projetos.
-- Administrador pode consultar responsáveis e não edita reports.
-- Gerente cria projeto com vínculo automático e atualiza report próprio,
-- mas não report de terceiros.
--
-- ATENÇÃO:
-- Ainda devem ser executados testes reais no navegador com Auth e convites.
-- Não mesclar V5 em produção sem homologação e segurança de Auth.
--
-- Consulta de conferência somente leitura:
SELECT
  (SELECT count(*) FROM public.status_semanais
   WHERE origem_registro='ppt_historico') AS historicos,
  (SELECT count(*) FROM public.pmo_convites_planejados) AS contas_planejadas,
  (SELECT count(*) FROM public.pmo_convites_planejados
   WHERE estado='pendente') AS convites_pendentes;
