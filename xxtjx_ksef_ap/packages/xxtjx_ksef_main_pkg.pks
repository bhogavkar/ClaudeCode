CREATE OR REPLACE PACKAGE apps.xxtjx_ksef_main_pkg
AS
  -- ===================================================================
  --  XXTJX_KSEF_MAIN_PKG : Orchestrator + Post Processor.
  --  Concurrent-program entry point that runs the end-to-end pipeline
  --  (load -> parse -> validate -> import -> attach) and prints the
  --  professional summary report to the request output.
  --  Every phase is status-driven and independently restartable, so a
  --  re-run resumes from the last checkpoint without duplicate invoices.
  -- ===================================================================

  --  p_phase :  ALL (default) | LOAD | PARSE | VALIDATE | IMPORT | ATTACH | REPORT
  --  p_source_dir : override PROCESS directory (LOAD phase only)
  PROCEDURE run ( errbuf       OUT VARCHAR2
                , retcode      OUT VARCHAR2
                , p_phase      IN  VARCHAR2 DEFAULT 'ALL'
                , p_source_dir IN  VARCHAR2 DEFAULT NULL
                , p_max_files  IN  NUMBER   DEFAULT NULL );

  -- Standalone post-processor / summary (also callable as its own CP).
  PROCEDURE post_process ( errbuf OUT VARCHAR2, retcode OUT VARCHAR2 );

END xxtjx_ksef_main_pkg;
/
