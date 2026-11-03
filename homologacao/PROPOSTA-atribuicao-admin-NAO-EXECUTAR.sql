-- PMO V5 | CONTROLES DE ACESSO E ATRIBUICAO
-- REVISADO em 03/11/2026 contra o schema real.
-- NAO EXECUTAR automaticamente: exige validação pelo administrador.
-- Não cria usuários, não importa histórico e não apaga reports.
-- Executar integralmente no SQL Editor do projeto "Projetos Naturgy".
BEGIN;

-- Um projeto pode ter no maximo um responsavel efetivo.
-- Falha automaticamente se ja houver projetos com vinculos duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS pmo_projeto_gerente_unico
ON public.projeto_gerentes (projeto_id);

-- Administrador consulta reports, mas não insere, altera ou exclui.
DROP POLICY IF EXISTS admin_gerencia_status ON public.status_semanais;
DROP POLICY IF EXISTS pmo_admin_consulta_status ON public.status_semanais;
CREATE POLICY pmo_admin_consulta_status
ON public.status_semanais FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.perfis p
  WHERE p.usuario_id=(SELECT auth.uid())
    AND p.papel='administrador' AND p.ativo=true
));

DROP POLICY IF EXISTS pmo_admin_detalhes ON public.relatorio_marcos_semanais;
DROP POLICY IF EXISTS pmo_admin_consulta_marcos ON public.relatorio_marcos_semanais;
CREATE POLICY pmo_admin_consulta_marcos
ON public.relatorio_marcos_semanais FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.perfis p
  WHERE p.usuario_id=(SELECT auth.uid())
    AND p.papel='administrador' AND p.ativo=true
));

DROP POLICY IF EXISTS pmo_admin_detalhes ON public.relatorio_riscos_semanais;
DROP POLICY IF EXISTS pmo_admin_consulta_riscos ON public.relatorio_riscos_semanais;
CREATE POLICY pmo_admin_consulta_riscos
ON public.relatorio_riscos_semanais FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.perfis p
  WHERE p.usuario_id=(SELECT auth.uid())
    AND p.papel='administrador' AND p.ativo=true
));

DROP POLICY IF EXISTS pmo_admin_detalhes ON public.relatorio_proximos_passos_semanais;
DROP POLICY IF EXISTS pmo_admin_consulta_acoes ON public.relatorio_proximos_passos_semanais;
CREATE POLICY pmo_admin_consulta_acoes
ON public.relatorio_proximos_passos_semanais FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.perfis p
  WHERE p.usuario_id=(SELECT auth.uid())
    AND p.papel='administrador' AND p.ativo=true
));

-- Garantia de não armazenamento de valores monetarios na base de reports
-- (o relatório pode manter a classificacao de custo e o farol).
-- A validação anterior confirmou que os valores atuais são todos NULL.
ALTER TABLE public.status_semanais
  DROP CONSTRAINT IF EXISTS pmo_sem_valores_financeiros;
ALTER TABLE public.status_semanais
  ADD CONSTRAINT pmo_sem_valores_financeiros
  CHECK (custo_aprovado IS NULL AND custo_realizado IS NULL);

-- Lista privada de responsáveis. Administradores podem constar como
-- responsáveis históricos, mas isso NÃO dá direito de publicação.
CREATE OR REPLACE FUNCTION app_private.pmo_admin_listar_responsaveis_privado()
RETURNS TABLE (usuario_id uuid,email text,papel text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $pmo$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.usuario_id=(SELECT auth.uid())
      AND p.ativo=true AND p.papel='administrador'
  ) THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT u.id,u.email::text,p.papel::text
    FROM auth.users u
    JOIN public.perfis p ON p.usuario_id=u.id
    WHERE p.ativo=true AND p.papel IN ('gerente','administrador')
    ORDER BY u.email;
END;
$pmo$;

REVOKE ALL ON FUNCTION app_private.pmo_admin_listar_responsaveis_privado()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.pmo_admin_listar_responsaveis_privado()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.pmo_admin_listar_gerentes()
RETURNS TABLE (usuario_id uuid,email text,papel text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $pmo$
  SELECT * FROM app_private.pmo_admin_listar_responsaveis_privado();
$pmo$;

REVOKE ALL ON FUNCTION public.pmo_admin_listar_gerentes()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pmo_admin_listar_gerentes()
  TO authenticated;

-- Operação administrativa protegida, executada no banco em uma transação.
CREATE OR REPLACE FUNCTION app_private.pmo_admin_atribuir_gerente_privado(
  p_projeto_id bigint,p_usuario_id uuid
)
RETURNS TABLE (projeto_id bigint,gerente_email text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $pmo$
DECLARE
  v_email text;
  v_atual uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.usuario_id=(SELECT auth.uid())
      AND p.ativo=true AND p.papel='administrador'
  ) THEN
    RAISE EXCEPTION 'Somente administrador pode atribuir gerente'
      USING ERRCODE='42501';
  END IF;
  IF p_projeto_id IS NULL OR p_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Projeto e usuario sao obrigatorios'
      USING ERRCODE='22023';
  END IF;

  SELECT u.email::text INTO v_email
  FROM auth.users u
  JOIN public.perfis p ON p.usuario_id=u.id
  WHERE u.id=p_usuario_id
    AND p.ativo=true AND p.papel IN ('gerente','administrador');
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Responsavel inexistente ou inativo'
      USING ERRCODE='22023';
  END IF;

  PERFORM 1 FROM public.projetos p
  WHERE p.id=p_projeto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Projeto inexistente' USING ERRCODE='22023';
  END IF;

  SELECT pg.usuario_id INTO v_atual
  FROM public.projeto_gerentes pg
  WHERE pg.projeto_id=p_projeto_id;

  IF v_atual IS DISTINCT FROM p_usuario_id THEN
    DELETE FROM public.projeto_gerentes pg
    WHERE pg.projeto_id=p_projeto_id;
    INSERT INTO public.projeto_gerentes (projeto_id,usuario_id)
    VALUES (p_projeto_id,p_usuario_id);
  END IF;

  UPDATE public.projetos p SET gerente=v_email
  WHERE p.id=p_projeto_id AND p.gerente IS DISTINCT FROM v_email;

  RETURN QUERY SELECT p_projeto_id,v_email;
END;
$pmo$;

REVOKE ALL ON FUNCTION app_private.pmo_admin_atribuir_gerente_privado(bigint,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.pmo_admin_atribuir_gerente_privado(bigint,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.pmo_admin_atribuir_gerente(
  p_projeto_id bigint,p_usuario_id uuid
)
RETURNS TABLE (projeto_id bigint,gerente_email text)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $pmo$
  SELECT * FROM app_private.pmo_admin_atribuir_gerente_privado(
    p_projeto_id,p_usuario_id
  );
$pmo$;

REVOKE ALL ON FUNCTION public.pmo_admin_atribuir_gerente(bigint,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pmo_admin_atribuir_gerente(bigint,uuid)
  TO authenticated;

COMMIT;

-- Após executar, validar:
-- 1) Admin lê, mas não salva ou exclui reports
-- 2) Gerente só publica projetos vinculados
-- 3) Somente admin consegue chamar pmo_admin_atribuir_gerente
-- 4) Criação de projeto pelo gerente continua vinculando automaticamente
-- 5) Auditoria registra mudança de vínculo e nome de responsável
-- 6) Campos custo_aprovado e custo_realizado permanecem NULL
-- 7) Teste da consulta executiva e do painel gerencial
