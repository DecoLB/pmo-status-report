-- PMO V5 - PROPOSTA DE MIGRACAO DE ATRIBUICAO ADMINISTRATIVA.
-- NAO EXECUTAR em producao antes de validar o checklist
-- homologacao/auditoria-seguranca-readonly.sql e o gatilho do criador.
-- Requer transacao, backup e testes negativos. Sem contas, senhas ou dados pessoais.

BEGIN;

-- A criacao de projetos por gerente depende do gatilho de vinculo automatico.
-- Se ele nao for SECURITY DEFINER, abortar ANTES de revogar escritas diretas.
DO $pmo$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_proc f ON f.oid=t.tgfoid
    WHERE c.oid='public.projetos'::regclass
      AND t.tgname='vincular_gerente_criador'
      AND NOT t.tgisinternal
      AND f.prosecdef=true
  ) THEN
    RAISE EXCEPTION 'ABORTADO: vincular_gerente_criador nao possui SECURITY DEFINER confirmado';
  END IF;
END;
$pmo$;

-- A lista de gerentes nao entrega auth.users ao navegador: somente admin.
CREATE OR REPLACE FUNCTION public.pmo_admin_listar_gerentes()
RETURNS TABLE(usuario_id uuid, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $pmo$
  SELECT u.id, u.email::text
  FROM auth.users AS u
  JOIN public.perfis AS p ON p.usuario_id=u.id
  WHERE p.ativo=true AND p.papel='gerente'
    AND EXISTS (
      SELECT 1 FROM public.perfis AS a
      WHERE a.usuario_id=auth.uid()
        AND a.ativo=true AND a.papel='administrador'
    )
  ORDER BY u.email
$pmo$;

REVOKE ALL ON FUNCTION public.pmo_admin_listar_gerentes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pmo_admin_listar_gerentes() TO authenticated;

-- Transferencia atomica, autorizacao server-side e trilha por gatilhos existentes.
CREATE OR REPLACE FUNCTION public.pmo_admin_atribuir_gerente(
  p_projeto_id bigint, p_usuario_id uuid
)
RETURNS TABLE(projeto_id bigint, gerente_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $pmo$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.perfis a
    WHERE a.usuario_id=auth.uid()
      AND a.ativo=true AND a.papel='administrador'
  ) THEN
    RAISE EXCEPTION 'Atribuicao permitida apenas ao administrador'
      USING ERRCODE='42501';
  END IF;
  SELECT u.email::text INTO v_email
  FROM auth.users u
  JOIN public.perfis p ON p.usuario_id=u.id
  WHERE u.id=p_usuario_id AND p.papel='gerente' AND p.ativo=true;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Gerente inexistente ou inativo';
  END IF;
  PERFORM 1 FROM public.projetos pr
  WHERE pr.id=p_projeto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Projeto inexistente';
  END IF;

  -- O banco guarda o vinculo EFETIVO neste relacionamento, nao no texto.
  DELETE FROM public.projeto_gerentes pg WHERE pg.projeto_id=p_projeto_id;
  INSERT INTO public.projeto_gerentes (projeto_id,usuario_id)
  VALUES (p_projeto_id,p_usuario_id);

  -- Campo descritivo atualizado somente por processo autorizado.
  UPDATE public.projetos pr
  SET gerente=v_email
  WHERE pr.id=p_projeto_id;

  RETURN QUERY SELECT p_projeto_id,v_email;
END;
$pmo$;

REVOKE ALL ON FUNCTION public.pmo_admin_atribuir_gerente(bigint,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pmo_admin_atribuir_gerente(bigint,uuid)
  TO authenticated;

-- Impede API autenticada de transferir vinculos diretamente.
-- A insercao automatica via gatilho SECURITY DEFINER permanece permitida.
REVOKE INSERT,UPDATE,DELETE ON public.projeto_gerentes
  FROM PUBLIC,anon,authenticated;

-- Bloqueia alteracao da coluna descritiva por usuarios nao administradores.
CREATE OR REPLACE FUNCTION app_private.pmo_proteger_nome_gerente()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $pmo$
BEGIN
  IF NEW.gerente IS DISTINCT FROM OLD.gerente THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.perfis p
      WHERE p.usuario_id=auth.uid() AND p.ativo AND p.papel='administrador'
    ) THEN
      RAISE EXCEPTION 'Somente administrador pode alterar o gerente do projeto'
      USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$pmo$;

DROP TRIGGER IF EXISTS pmo_proteger_nome_gerente ON public.projetos;
CREATE TRIGGER pmo_proteger_nome_gerente
BEFORE UPDATE OF gerente ON public.projetos
FOR EACH ROW EXECUTE FUNCTION app_private.pmo_proteger_nome_gerente();

COMMIT;

-- TESTES OBRIGATORIOS: admin transfere; gerente cria proprio;
-- gerente nao consegue editar campo gerente via REST nem projeto_gerentes;
-- anonimo nao transfere; auditoria registra DELETE+INSERT+UPDATE;
-- report do gerente anterior fica apenas leitura apos transferencia.
