CREATE OR REPLACE PACKAGE apps.xxtjx_ksef_loader_pkg
AS
  -- ===================================================================
  --  XXTJX_KSEF_LOADER_PKG : File acquisition layer.
  --  Concurrent program entry point. Scans PROCESS, stores raw JSON to
  --  XXTJX_KSEF_FILES, validates file name + JSON syntax, computes hash,
  --  detects duplicate files, archives success / quarantines failures.
  --  Idempotent & restartable: driven purely by process_status.
  -- ===================================================================

  -- Concurrent program executable.
  --   p_purge_days : archive-retention passthrough (informational).
  PROCEDURE main ( errbuf        OUT VARCHAR2
                 , retcode       OUT VARCHAR2
                 , p_source_dir  IN  VARCHAR2 DEFAULT NULL   -- default PROCESS
                 , p_max_files   IN  NUMBER   DEFAULT NULL );

  -- Load a single named file (reusable / unit-testable).
  --   Returns the new file_id, or the existing file_id on duplicate.
  PROCEDURE load_one_file ( p_directory  IN  VARCHAR2
                          , p_file_name  IN  VARCHAR2
                          , p_file_id    OUT NUMBER
                          , p_status     OUT VARCHAR2 );

END xxtjx_ksef_loader_pkg;
/
