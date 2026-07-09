CREATE OR REPLACE PACKAGE BODY apps.xxtjx_ksef_main_pkg
AS
  gc_pkg CONSTANT VARCHAR2(30) := 'XXTJX_KSEF_MAIN_PKG';
  g_run_start NUMBER;

  ------------------------------------------------------------------
  PROCEDURE o ( p_text IN VARCHAR2 ) IS
  BEGIN fnd_file.put_line(fnd_file.output, p_text); END o;

  ------------------------------------------------------------------
  FUNCTION cnt ( p_sql IN VARCHAR2 ) RETURN NUMBER
  IS l_n NUMBER; BEGIN EXECUTE IMMEDIATE p_sql INTO l_n; RETURN NVL(l_n,0); END;

  ------------------------------------------------------------------
  PROCEDURE post_process ( errbuf OUT VARCHAR2, retcode OUT VARCHAR2 )
  IS
    l_req            NUMBER := fnd_global.conc_request_id;
    l_files_total    NUMBER; l_files_ok NUMBER; l_files_fail NUMBER;
    l_dup_files      NUMBER; l_dup_inv NUMBER; l_bad_json NUMBER;
    l_val_err        NUMBER; l_if_err NUMBER; l_imported NUMBER;
    l_att_ok         NUMBER; l_att_fail NUMBER; l_bad_b64 NUMBER; l_pdf_err NUMBER;
    l_pct            NUMBER; l_elapsed NUMBER;
  BEGIN
    xxtjx_ksef_log_pkg.init_context(l_req, gc_pkg);

    l_files_total := cnt('SELECT COUNT(*) FROM xxtjx.xxtjx_ksef_files WHERE request_id='||l_req);
    l_files_ok    := cnt('SELECT COUNT(*) FROM xxtjx.xxtjx_ksef_files WHERE request_id='||l_req||
                         ' AND process_status='''||xxtjx_ksef_cons_pkg.gc_st_completed||'''');
    l_files_fail  := cnt('SELECT COUNT(*) FROM xxtjx.xxtjx_ksef_files WHERE request_id='||l_req||
                         ' AND process_status='''||xxtjx_ksef_cons_pkg.gc_st_error||'''');
    l_dup_files   := cnt('SELECT COUNT(*) FROM xxtjx.xxtjx_ksef_files WHERE request_id='||l_req||
                         ' AND process_status='''||xxtjx_ksef_cons_pkg.gc_st_duplicate||'''');
    l_bad_json    := cnt('SELECT COUNT(*) FROM xxtjx.xxtjx_ksef_files WHERE request_id='||l_req||
                         ' AND error_code='''||xxtjx_ksef_cons_pkg.gc_err_invalid_json||'''');
    l_imported    := cnt('SELECT COUNT(*) FROM xxtjx.xxtjx_ksef_ap_hdr_stg WHERE request_id='||l_req||
                         ' AND interface_status='''||xxtjx_ksef_cons_pkg.gc_if_imported||'''');
    l_val_err     := cnt('SELECT COUNT(*) FROM xxtjx.xxtjx_ksef_ap_hdr_stg WHERE request_id='||l_req||
                         ' AND validation_status='''||xxtjx_ksef_cons_pkg.gc_val_fail||'''');
    l_if_err      := cnt('SELECT COUNT(*) FROM xxtjx.xxtjx_ksef_ap_hdr_stg WHERE request_id='||l_req||
                         ' AND interface_status='''||xxtjx_ksef_cons_pkg.gc_if_rejected||'''');
    l_dup_inv     := cnt('SELECT COUNT(*) FROM xxtjx.xxtjx_ksef_ap_hdr_stg WHERE request_id='||l_req||
                         ' AND error_code='''||xxtjx_ksef_cons_pkg.gc_err_dup_invoice||'''');
    l_att_ok      := cnt('SELECT COUNT(*) FROM xxtjx.xxtjx_ap_attachments WHERE request_id='||l_req||
                         ' AND upload_status='''||xxtjx_ksef_cons_pkg.gc_att_attached||'''');
    l_att_fail    := cnt('SELECT COUNT(*) FROM xxtjx.xxtjx_ap_attachments WHERE request_id='||l_req||
                         ' AND upload_status='''||xxtjx_ksef_cons_pkg.gc_att_attach_error||'''');
    l_bad_b64     := cnt('SELECT COUNT(*) FROM xxtjx.xxtjx_ksef_ap_hdr_stg WHERE request_id='||l_req||
                         ' AND error_code='''||xxtjx_ksef_cons_pkg.gc_err_base64||'''');
    l_pdf_err     := cnt('SELECT COUNT(*) FROM xxtjx.xxtjx_ksef_ap_hdr_stg WHERE request_id='||l_req||
                         ' AND error_code IN ('''||xxtjx_ksef_cons_pkg.gc_err_pdf_sig||''','''
                         ||xxtjx_ksef_cons_pkg.gc_err_pdf_size||''')');

    l_pct := CASE WHEN l_files_total > 0
                  THEN ROUND(l_imported / l_files_total * 100, 2) ELSE 0 END;
    l_elapsed := ROUND((DBMS_UTILITY.get_time - NVL(g_run_start,DBMS_UTILITY.get_time))/100,2);

    o('=====================================================================');
    o('        TJX KSeF / OpenText  AP Invoice Import - Summary Report');
    o('=====================================================================');
    o('  Concurrent Request Id ...... : '||l_req);
    o('  Run Date ................... : '||TO_CHAR(SYSDATE,'DD-MON-YYYY HH24:MI:SS'));
    o('  Source System .............. : '||xxtjx_ksef_cons_pkg.gc_source_system);
    o('---------------------------------------------------------------------');
    o('  FILE STATISTICS');
    o('    Total JSON files received . : '||l_files_total);
    o('    Files processed (COMPLETED) : '||l_files_ok);
    o('    Files failed ............... : '||l_files_fail);
    o('    Duplicate files ............ : '||l_dup_files);
    o('    Invalid JSON files ......... : '||l_bad_json);
    o('---------------------------------------------------------------------');
    o('  INVOICE STATISTICS');
    o('    Invoices imported .......... : '||l_imported);
    o('    Validation errors .......... : '||l_val_err);
    o('    Interface (AP) errors ...... : '||l_if_err);
    o('    Duplicate invoices ......... : '||l_dup_inv);
    o('---------------------------------------------------------------------');
    o('  ATTACHMENT STATISTICS');
    o('    Attachments succeeded ...... : '||l_att_ok);
    o('    Attachments failed ......... : '||l_att_fail);
    o('    Invalid Base64 ............. : '||l_bad_b64);
    o('    PDF validation errors ...... : '||l_pdf_err);
    o('---------------------------------------------------------------------');
    o('  PERFORMANCE');
    o('    Success percentage ......... : '||l_pct||' %');
    o('    Elapsed / processing time .. : '||l_elapsed||' s');
    o('=====================================================================');

    -- Detailed exception listing (business-friendly).
    o(' ');
    o('  EXCEPTION DETAIL (failed items this run)');
    o('  '||RPAD('File',34)||RPAD('Invoice',18)||'Error');
    o('  '||RPAD('-',33,'-')||' '||RPAD('-',16,'-')||' '||RPAD('-',60,'-'));
    FOR r IN ( SELECT f.file_name, h.invoice_num, h.error_code, h.error_message
                 FROM xxtjx.xxtjx_ksef_ap_hdr_stg h
                 JOIN xxtjx.xxtjx_ksef_files f ON f.file_id = h.file_id
                WHERE h.request_id = l_req
                  AND h.error_message IS NOT NULL
               UNION ALL
               SELECT file_name, invoice_number, error_code, error_message
                 FROM xxtjx.xxtjx_ksef_files
                WHERE request_id = l_req AND error_message IS NOT NULL
                ORDER BY 1 )
    LOOP
      o('  '||RPAD(SUBSTR(r.file_name,1,33),34)
         ||RPAD(NVL(SUBSTR(r.invoice_num,1,16),' '),18)
         ||'['||r.error_code||'] '||SUBSTR(r.error_message,1,120));
    END LOOP;

    retcode := TO_CHAR(xxtjx_ksef_cons_pkg.gc_ret_success);
    IF l_files_fail > 0 OR l_val_err > 0 OR l_if_err > 0 OR l_att_fail > 0 THEN
      retcode := TO_CHAR(xxtjx_ksef_cons_pkg.gc_ret_warning);
      errbuf  := 'Completed with exceptions - see summary report.';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      xxtjx_ksef_log_pkg.log_error('post_process','Report generation failed');
      retcode := TO_CHAR(xxtjx_ksef_cons_pkg.gc_ret_error);
      errbuf  := SUBSTR(SQLERRM,1,240);
  END post_process;

  ------------------------------------------------------------------
  PROCEDURE run ( errbuf       OUT VARCHAR2
                , retcode      OUT VARCHAR2
                , p_phase      IN  VARCHAR2 DEFAULT 'ALL'
                , p_source_dir IN  VARCHAR2 DEFAULT NULL
                , p_max_files  IN  NUMBER   DEFAULT NULL )
  IS
    l_eb   VARCHAR2(4000); l_rc VARCHAR2(10);
    l_a NUMBER; l_b NUMBER; l_c NUMBER; l_grp VARCHAR2(80); l_req NUMBER;
    l_phase VARCHAR2(20) := UPPER(NVL(p_phase,'ALL'));
  BEGIN
    g_run_start := DBMS_UTILITY.get_time;
    xxtjx_ksef_log_pkg.init_context(fnd_global.conc_request_id, gc_pkg);
    xxtjx_ksef_log_pkg.log_info('run','##### KSeF AP Import pipeline START (phase='||l_phase||') #####');
    retcode := TO_CHAR(xxtjx_ksef_cons_pkg.gc_ret_success);

    IF l_phase IN ('ALL','LOAD') THEN
      xxtjx_ksef_loader_pkg.main(l_eb, l_rc, p_source_dir, p_max_files);
    END IF;

    IF l_phase IN ('ALL','PARSE') THEN
      xxtjx_ksef_parser_pkg.parse_pending(l_a, l_b);
    END IF;

    IF l_phase IN ('ALL','VALIDATE') THEN
      xxtjx_ksef_valid_pkg.validate_pending(l_a, l_b);
    END IF;

    IF l_phase IN ('ALL','IMPORT') THEN
      xxtjx_ksef_import_pkg.import_validated(l_a, l_b, l_grp, l_req);
    END IF;

    IF l_phase IN ('ALL','ATTACH') THEN
      xxtjx_ksef_attach_pkg.attach_pending(l_a, l_b);
    END IF;

    -- Always print the summary.
    post_process(l_eb, l_rc);
    IF l_rc = TO_CHAR(xxtjx_ksef_cons_pkg.gc_ret_warning) THEN
      retcode := l_rc; errbuf := l_eb;
    END IF;

    xxtjx_ksef_log_pkg.log_info('run','##### KSeF AP Import pipeline END #####');
  EXCEPTION
    WHEN OTHERS THEN
      xxtjx_ksef_log_pkg.log_error('run','Pipeline fatal error');
      retcode := TO_CHAR(xxtjx_ksef_cons_pkg.gc_ret_error);
      errbuf  := SUBSTR(SQLERRM,1,240);
  END run;

END xxtjx_ksef_main_pkg;
/
