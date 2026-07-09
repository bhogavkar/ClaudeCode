CREATE OR REPLACE PACKAGE BODY apps.xxtjx_ksef_loader_pkg
AS
  gc_pkg CONSTANT VARCHAR2(30) := 'XXTJX_KSEF_LOADER_PKG';

  ------------------------------------------------------------------
  FUNCTION is_valid_json ( p_clob IN CLOB ) RETURN BOOLEAN
  IS
    l_doc JSON_ELEMENT_T;
  BEGIN
    l_doc := JSON_ELEMENT_T.parse(p_clob);   -- raises on malformed JSON
    RETURN TRUE;
  EXCEPTION
    WHEN OTHERS THEN RETURN FALSE;
  END is_valid_json;

  ------------------------------------------------------------------
  PROCEDURE load_one_file ( p_directory IN  VARCHAR2
                          , p_file_name IN  VARCHAR2
                          , p_file_id   OUT NUMBER
                          , p_status    OUT VARCHAR2 )
  IS
    l_clob      CLOB;
    l_hash      VARCHAR2(64);
    l_size      NUMBER;
    l_dup_id    NUMBER;
    l_ksef      VARCHAR2(50);
    l_batch     VARCHAR2(17);
    l_invnum    VARCHAR2(50);
    l_doctype   VARCHAR2(30);
    l_file_id   NUMBER;
  BEGIN
    xxtjx_ksef_log_pkg.set_file_context(p_file_name => p_file_name);

    -- 1) File-name policy (security: reject unexpected names).
    IF NOT REGEXP_LIKE(p_file_name, xxtjx_ksef_cons_pkg.gc_file_name_regex) THEN
      xxtjx_ksef_log_pkg.log_warn('load_one_file'
        ,'Rejected file name (policy): '||p_file_name);
      xxtjx_ksef_util_pkg.move_file(p_directory, p_file_name
        , xxtjx_ksef_cons_pkg.gc_dir_error, p_file_name);
      p_status := xxtjx_ksef_cons_pkg.gc_st_rejected;
      p_file_id := NULL;
      RETURN;
    END IF;

    -- 2) Read raw bytes -> CLOB.
    xxtjx_ksef_util_pkg.load_file_to_clob(p_directory, p_file_name, l_clob);
    l_size := DBMS_LOB.getlength(l_clob);
    l_hash := xxtjx_ksef_util_pkg.sha256_clob(l_clob);

    -- 3) Duplicate FILE detection (identical bytes already stored).
    BEGIN
      SELECT file_id INTO l_dup_id
        FROM xxtjx.xxtjx_ksef_files
       WHERE file_hash = l_hash
         AND ROWNUM = 1;
      -- Already have this exact payload -> do NOT reload; archive the copy.
      xxtjx_ksef_log_pkg.log_warn('load_one_file'
        ,'Duplicate file (hash match, existing file_id='||l_dup_id||'): '||p_file_name);
      xxtjx_ksef_util_pkg.move_file(p_directory, p_file_name
        , xxtjx_ksef_cons_pkg.gc_dir_archive, p_file_name||'.dup');
      p_file_id := l_dup_id;
      p_status  := xxtjx_ksef_cons_pkg.gc_st_duplicate;
      RETURN;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN NULL;   -- new file, continue
    END;

    l_file_id := xxtjx.xxtjx_ksef_file_s.NEXTVAL;

    -- 4) JSON syntax + document-type routing guard.
    IF NOT is_valid_json(l_clob) THEN
      INSERT INTO xxtjx.xxtjx_ksef_files
        ( file_id, file_name, file_content, file_size, file_hash
        , source_system, process_status, error_code, error_message
        , request_id, received_date )
      VALUES
        ( l_file_id, p_file_name, l_clob, l_size, l_hash
        , xxtjx_ksef_cons_pkg.gc_source_system, xxtjx_ksef_cons_pkg.gc_st_error
        , xxtjx_ksef_cons_pkg.gc_err_invalid_json, 'Malformed JSON - failed parse'
        , fnd_global.conc_request_id, SYSDATE );
      xxtjx_ksef_util_pkg.move_file(p_directory, p_file_name
        , xxtjx_ksef_cons_pkg.gc_dir_error, p_file_name);
      p_file_id := l_file_id;
      p_status  := xxtjx_ksef_cons_pkg.gc_st_error;
      RETURN;
    END IF;

    -- 5) Lift key fields for fast dedup/reporting (no heavy parse here).
    l_doctype := JSON_VALUE(l_clob, '$.documentType');
    l_batch   := JSON_VALUE(l_clob, '$.batchId');
    l_ksef    := JSON_VALUE(l_clob, '$.header.ksefNumber');
    l_invnum  := JSON_VALUE(l_clob, '$.header.invoiceNumber');

    -- 6) Persist raw payload (immutable audit record).
    INSERT INTO xxtjx.xxtjx_ksef_files
      ( file_id, file_name, file_content, file_size, file_hash
      , source_system, document_type, batch_id, ksef_number, invoice_number
      , process_status, request_id, received_date )
    VALUES
      ( l_file_id, p_file_name, l_clob, l_size, l_hash
      , xxtjx_ksef_cons_pkg.gc_source_system, l_doctype, l_batch, l_ksef, l_invnum
      , xxtjx_ksef_cons_pkg.gc_st_loaded, fnd_global.conc_request_id, SYSDATE );

    xxtjx_ksef_log_pkg.set_file_context(l_file_id, p_file_name, l_invnum, l_ksef);
    xxtjx_ksef_log_pkg.log_info('load_one_file'
      ,'Loaded file_id='||l_file_id||' size='||l_size||' hash='||SUBSTR(l_hash,1,12)||'..');

    -- 7) Archive the processed source file.
    xxtjx_ksef_util_pkg.move_file(p_directory, p_file_name
      , xxtjx_ksef_cons_pkg.gc_dir_archive, p_file_name);

    p_file_id := l_file_id;
    p_status  := xxtjx_ksef_cons_pkg.gc_st_loaded;

  EXCEPTION
    WHEN OTHERS THEN
      xxtjx_ksef_log_pkg.log_error('load_one_file','Load failed for '||p_file_name);
      -- Best-effort quarantine so the file is not retried forever.
      BEGIN
        xxtjx_ksef_util_pkg.move_file(p_directory, p_file_name
          , xxtjx_ksef_cons_pkg.gc_dir_error, p_file_name);
      EXCEPTION WHEN OTHERS THEN NULL; END;
      p_file_id := NULL;
      p_status  := xxtjx_ksef_cons_pkg.gc_st_error;
  END load_one_file;

  ------------------------------------------------------------------
  PROCEDURE main ( errbuf       OUT VARCHAR2
                 , retcode      OUT VARCHAR2
                 , p_source_dir IN  VARCHAR2 DEFAULT NULL
                 , p_max_files  IN  NUMBER   DEFAULT NULL )
  IS
    l_dir       VARCHAR2(30) := NVL(p_source_dir, xxtjx_ksef_cons_pkg.gc_dir_process);
    l_count     PLS_INTEGER  := 0;
    l_ok        PLS_INTEGER  := 0;
    l_dup       PLS_INTEGER  := 0;
    l_err       PLS_INTEGER  := 0;
    l_file_id   NUMBER;
    l_status    VARCHAR2(30);
    l_t0        NUMBER := DBMS_UTILITY.get_time;
  BEGIN
    xxtjx_ksef_log_pkg.init_context(fnd_global.conc_request_id, gc_pkg);
    xxtjx_ksef_log_pkg.log_info('main','=== KSeF Loader START (dir='||l_dir||') ===');
    retcode := TO_CHAR(xxtjx_ksef_cons_pkg.gc_ret_success);

    FOR f IN ( SELECT file_name
                 FROM TABLE(xxtjx_ksef_util_pkg.list_files(l_dir, '%.json')) )
    LOOP
      EXIT WHEN p_max_files IS NOT NULL AND l_count >= p_max_files;
      l_count := l_count + 1;

      load_one_file(l_dir, f.file_name, l_file_id, l_status);

      -- Commit per file => restartable at file granularity.
      COMMIT;

      CASE l_status
        WHEN xxtjx_ksef_cons_pkg.gc_st_loaded    THEN l_ok  := l_ok  + 1;
        WHEN xxtjx_ksef_cons_pkg.gc_st_duplicate THEN l_dup := l_dup + 1;
        ELSE                                          l_err := l_err + 1;
      END CASE;
    END LOOP;

    xxtjx_ksef_log_pkg.log_metric('main','Loader complete'
      , DBMS_UTILITY.get_time - l_t0);
    xxtjx_ksef_log_pkg.log_info('main'
      ,'Scanned='||l_count||' Loaded='||l_ok||' Duplicate='||l_dup||' Error='||l_err);

    IF l_err > 0 THEN
      retcode := TO_CHAR(xxtjx_ksef_cons_pkg.gc_ret_warning);
      errbuf  := l_err||' file(s) quarantined - see XXTJX_KSEF_LOG.';
    END IF;
    xxtjx_ksef_log_pkg.log_info('main','=== KSeF Loader END ===');
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      xxtjx_ksef_log_pkg.log_error('main','Fatal loader error');
      retcode := TO_CHAR(xxtjx_ksef_cons_pkg.gc_ret_error);
      errbuf  := SUBSTR(SQLERRM,1,240);
  END main;

END xxtjx_ksef_loader_pkg;
/
