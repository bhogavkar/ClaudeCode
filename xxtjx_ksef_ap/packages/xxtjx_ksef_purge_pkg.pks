CREATE OR REPLACE PACKAGE apps.xxtjx_ksef_purge_pkg
AS
  -- ===================================================================
  --  XXTJX_KSEF_PURGE_PKG : Retention / purge concurrent program.
  --  Purges COMPLETED staging + log + attachment rows older than the
  --  retention window. NEVER purges rows that are not COMPLETED, and
  --  never purges raw audit files younger than the legal retention.
  -- ===================================================================
  PROCEDURE main ( errbuf            OUT VARCHAR2
                 , retcode           OUT VARCHAR2
                 , p_stg_retention   IN  NUMBER DEFAULT 90    -- days: staging
                 , p_log_retention   IN  NUMBER DEFAULT 180   -- days: log
                 , p_raw_retention   IN  NUMBER DEFAULT 2555  -- days: raw JSON (~7y)
                 , p_commit_size     IN  NUMBER DEFAULT 5000 );
END xxtjx_ksef_purge_pkg;
/
