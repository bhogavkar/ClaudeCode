CREATE OR REPLACE PACKAGE BODY apps.xxtjx_ksef_purge_pkg
AS
  gc_pkg CONSTANT VARCHAR2(30) := 'XXTJX_KSEF_PURGE_PKG';

  PROCEDURE main ( errbuf          OUT VARCHAR2
                 , retcode         OUT VARCHAR2
                 , p_stg_retention IN  NUMBER DEFAULT 90
                 , p_log_retention IN  NUMBER DEFAULT 180
                 , p_raw_retention IN  NUMBER DEFAULT 2555
                 , p_commit_size   IN  NUMBER DEFAULT 5000 )
  IS
    l_stg  NUMBER := 0; l_att NUMBER := 0; l_log NUMBER := 0; l_raw NUMBER := 0;
  BEGIN
    xxtjx_ksef_log_pkg.init_context(fnd_global.conc_request_id, gc_pkg);
    retcode := TO_CHAR(xxtjx_ksef_cons_pkg.gc_ret_success);

    -- 1) Attachments for COMPLETED files past staging retention.
    DELETE FROM xxtjx.xxtjx_ap_attachments a
     WHERE a.upload_status = xxtjx_ksef_cons_pkg.gc_att_attached
       AND a.creation_date < TRUNC(SYSDATE) - p_stg_retention
       AND EXISTS ( SELECT 1 FROM xxtjx.xxtjx_ksef_files f
                     WHERE f.file_id = a.file_id
                       AND f.process_status = xxtjx_ksef_cons_pkg.gc_st_completed );
    l_att := SQL%ROWCOUNT; COMMIT;

    -- 2) Line + header staging for COMPLETED files past retention.
    DELETE FROM xxtjx.xxtjx_ksef_ap_line_stg l
     WHERE l.creation_date < TRUNC(SYSDATE) - p_stg_retention
       AND EXISTS ( SELECT 1 FROM xxtjx.xxtjx_ksef_ap_hdr_stg h
                     WHERE h.hdr_stg_id = l.hdr_stg_id
                       AND h.interface_status = xxtjx_ksef_cons_pkg.gc_if_imported );
    COMMIT;

    DELETE FROM xxtjx.xxtjx_ksef_ap_hdr_stg h
     WHERE h.interface_status = xxtjx_ksef_cons_pkg.gc_if_imported
       AND h.creation_date < TRUNC(SYSDATE) - p_stg_retention;
    l_stg := SQL%ROWCOUNT; COMMIT;

    -- 3) Log rows past log retention.
    DELETE FROM xxtjx.xxtjx_ksef_log
     WHERE log_date < TRUNC(SYSDATE) - p_log_retention;
    l_log := SQL%ROWCOUNT; COMMIT;

    -- 4) Raw JSON audit ONLY past the (long) legal retention AND COMPLETED.
    DELETE FROM xxtjx.xxtjx_ksef_files f
     WHERE f.process_status = xxtjx_ksef_cons_pkg.gc_st_completed
       AND f.received_date < TRUNC(SYSDATE) - p_raw_retention;
    l_raw := SQL%ROWCOUNT; COMMIT;

    xxtjx_ksef_log_pkg.log_info('main'
      ,'Purged attachments='||l_att||' headers='||l_stg||' log='||l_log||' raw='||l_raw);
    errbuf := 'Purged hdr='||l_stg||' att='||l_att||' log='||l_log||' raw='||l_raw;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      xxtjx_ksef_log_pkg.log_error('main','Purge failed');
      retcode := TO_CHAR(xxtjx_ksef_cons_pkg.gc_ret_error);
      errbuf  := SUBSTR(SQLERRM,1,240);
  END main;

END xxtjx_ksef_purge_pkg;
/
