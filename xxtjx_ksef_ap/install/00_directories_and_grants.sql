-- =====================================================================
--  00 - DB directory objects + privilege grants
--  Run as SYS / SYSTEM (or a DBA). Paths must match the SFTP mount and
--  be on the DB server / shared APPL_TOP filesystem.
-- =====================================================================
SET DEFINE OFF;

-- ---- Directory objects (align to the existing TJX SFTP mount) ----
CREATE OR REPLACE DIRECTORY XXTJX_KSEF_TMP     AS '/u01/tjx/ksef/tmp';
CREATE OR REPLACE DIRECTORY XXTJX_KSEF_PROCESS AS '/u01/tjx/ksef/process';
CREATE OR REPLACE DIRECTORY XXTJX_KSEF_ARCHIVE AS '/u01/tjx/ksef/archive';
CREATE OR REPLACE DIRECTORY XXTJX_KSEF_ERROR   AS '/u01/tjx/ksef/error';
CREATE OR REPLACE DIRECTORY XXTJX_KSEF_LOG     AS '/u01/tjx/ksef/log';

-- Read/write to APPS + XXTJX
BEGIN
  FOR d IN (SELECT 'XXTJX_KSEF_TMP' n FROM dual UNION ALL
            SELECT 'XXTJX_KSEF_PROCESS' FROM dual UNION ALL
            SELECT 'XXTJX_KSEF_ARCHIVE' FROM dual UNION ALL
            SELECT 'XXTJX_KSEF_ERROR' FROM dual UNION ALL
            SELECT 'XXTJX_KSEF_LOG' FROM dual)
  LOOP
    EXECUTE IMMEDIATE 'GRANT READ, WRITE ON DIRECTORY '||d.n||' TO xxtjx, apps';
  END LOOP;
END;
/

-- ---- Package execution privileges (native, no Java) ----
GRANT EXECUTE ON sys.dbms_crypto          TO xxtjx;   -- SHA-256
GRANT EXECUTE ON sys.dbms_lob             TO xxtjx;
GRANT EXECUTE ON sys.utl_encode           TO xxtjx;
GRANT EXECUTE ON sys.utl_raw              TO xxtjx;
GRANT EXECUTE ON sys.utl_file             TO xxtjx;

-- ---- Native directory listing (list_files) ----
--   Only needed if the site does not substitute the existing TJX
--   framework's directory-listing routine.
GRANT EXECUTE ON sys.dbms_backup_restore  TO xxtjx;
GRANT SELECT  ON sys.x$krbmsft            TO xxtjx;   -- via a fixed view if x$ blocked

-- ---- ACL for UTL_FILE symbolic paths is not required (directory objects). ----

PROMPT >> Directories + grants complete.
