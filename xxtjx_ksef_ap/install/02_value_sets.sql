-- =====================================================================
--  02 - Value sets for concurrent-program parameters
--  Run as APPS. Uses fnd_flex_val_api (idempotent - ignores dup errors).
-- =====================================================================
SET DEFINE OFF;
SET SERVEROUTPUT ON;
DECLARE
  PROCEDURE mk_vs ( p_name IN VARCHAR2, p_desc IN VARCHAR2, p_len IN NUMBER ) IS
  BEGIN
    fnd_flex_val_api.create_valueset_char
      ( p_value_set_name    => p_name
      , p_description        => p_desc
      , p_security_available => 'N'
      , p_enable_longlist    => 'N'
      , p_format_type        => 'C'
      , p_maximum_size       => p_len
      , p_uppercase_only     => 'N'
      , p_numeric_only       => 'N'
      , p_min_value          => NULL
      , p_max_value          => NULL );
  EXCEPTION WHEN OTHERS THEN
    DBMS_OUTPUT.put_line(p_name||' : '||SQLERRM);   -- already exists -> continue
  END;

  PROCEDURE mk_val ( p_vs IN VARCHAR2, p_code IN VARCHAR2, p_mean IN VARCHAR2 ) IS
  BEGIN
    fnd_flex_val_api.create_value
      ( p_value_set_name => p_vs
      , p_value          => p_code
      , p_description     => p_mean
      , p_enabled_flag    => 'Y' );
  EXCEPTION WHEN OTHERS THEN
    DBMS_OUTPUT.put_line(p_vs||'/'||p_code||' : '||SQLERRM);
  END;
BEGIN
  -- Phase selector (independent value set)
  mk_vs('XXTJX_KSEF_PHASE','KSeF pipeline phase', 10);
  mk_val('XXTJX_KSEF_PHASE','ALL'     ,'Full pipeline');
  mk_val('XXTJX_KSEF_PHASE','LOAD'    ,'Load raw JSON only');
  mk_val('XXTJX_KSEF_PHASE','PARSE'   ,'Parse only');
  mk_val('XXTJX_KSEF_PHASE','VALIDATE','Validate only');
  mk_val('XXTJX_KSEF_PHASE','IMPORT'  ,'Import to Payables only');
  mk_val('XXTJX_KSEF_PHASE','ATTACH'  ,'Attach PDFs only');
  mk_val('XXTJX_KSEF_PHASE','REPORT'  ,'Summary report only');

  -- Directory name (char, matches DB directory objects)
  mk_vs('XXTJX_KSEF_DIR','KSeF directory object name', 30);
  mk_val('XXTJX_KSEF_DIR','XXTJX_KSEF_PROCESS','Process directory');
  mk_val('XXTJX_KSEF_DIR','XXTJX_KSEF_TMP','Tmp directory');

  COMMIT;
  DBMS_OUTPUT.put_line('Value sets created.');
END;
/
