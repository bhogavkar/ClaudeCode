CREATE OR REPLACE PACKAGE BODY apps.xxtjx_ksef_util_pkg
AS
  gc_pkg CONSTANT VARCHAR2(30) := 'XXTJX_KSEF_UTIL_PKG';

  ------------------------------------------------------------------
  --  DATE HELPERS
  ------------------------------------------------------------------
  FUNCTION is_valid_mmddyyyy ( p_str IN VARCHAR2 ) RETURN BOOLEAN
  IS
    l_dummy DATE;
  BEGIN
    IF p_str IS NULL OR NOT REGEXP_LIKE(p_str,'^[0-9]{8}$') THEN
      RETURN FALSE;
    END IF;
    l_dummy := TO_DATE(p_str,'MMDDYYYY');   -- raises if impossible date
    RETURN TRUE;
  EXCEPTION
    WHEN OTHERS THEN RETURN FALSE;
  END is_valid_mmddyyyy;

  FUNCTION to_date_mmddyyyy ( p_str IN VARCHAR2 ) RETURN DATE
  IS
  BEGIN
    IF p_str IS NULL THEN RETURN NULL; END IF;
    RETURN TO_DATE(p_str,'MMDDYYYY');
  END to_date_mmddyyyy;

  FUNCTION to_date_mmddyyhhmi ( p_str IN VARCHAR2 ) RETURN DATE
  IS
  BEGIN
    IF p_str IS NULL THEN RETURN NULL; END IF;
    -- MMDDYYHHMISS (12 digits) -> DATE
    RETURN TO_DATE(p_str,'MMDDRRHH24MISS');
  END to_date_mmddyyhhmi;

  ------------------------------------------------------------------
  --  HASHING (SHA-256 via DBMS_CRYPTO)
  ------------------------------------------------------------------
  FUNCTION sha256_clob ( p_clob IN CLOB ) RETURN VARCHAR2
  IS
    l_blob BLOB;
    l_dstoff INTEGER := 1;
    l_srcoff INTEGER := 1;
    l_lang   INTEGER := 0;
    l_warn   INTEGER := 0;
  BEGIN
    IF p_clob IS NULL THEN RETURN NULL; END IF;
    DBMS_LOB.createtemporary(l_blob, TRUE);
    DBMS_LOB.converttoblob(l_blob, p_clob, DBMS_LOB.getlength(p_clob)
                          , l_dstoff, l_srcoff, DBMS_LOB.default_csid, l_lang, l_warn);
    RETURN LOWER(RAWTOHEX(DBMS_CRYPTO.hash(l_blob, DBMS_CRYPTO.hash_sh256)));
  END sha256_clob;

  FUNCTION sha256_blob ( p_blob IN BLOB ) RETURN VARCHAR2
  IS
  BEGIN
    IF p_blob IS NULL THEN RETURN NULL; END IF;
    RETURN LOWER(RAWTOHEX(DBMS_CRYPTO.hash(p_blob, DBMS_CRYPTO.hash_sh256)));
  END sha256_blob;

  ------------------------------------------------------------------
  --  BASE64
  ------------------------------------------------------------------
  FUNCTION is_base64 ( p_str IN VARCHAR2 ) RETURN BOOLEAN
  IS
  BEGIN
    RETURN p_str IS NOT NULL AND REGEXP_LIKE(p_str,'^[A-Za-z0-9+/]*={0,2}$');
  END is_base64;

  FUNCTION base64_to_blob ( p_b64 IN CLOB ) RETURN BLOB
  IS
    l_blob      BLOB;
    l_amt       PLS_INTEGER := 5700;   -- multiple of 4, < 32k varchar limit
    l_pos       PLS_INTEGER := 1;
    l_len       PLS_INTEGER;
    l_chunk     VARCHAR2(32767);
  BEGIN
    DBMS_LOB.createtemporary(l_blob, TRUE);
    l_len := DBMS_LOB.getlength(p_b64);
    WHILE l_pos <= l_len LOOP
      l_chunk := DBMS_LOB.substr(p_b64, l_amt, l_pos);
      -- decode this chunk (chunk boundary is a multiple of 4 => safe)
      DBMS_LOB.append( l_blob
                     , UTL_ENCODE.base64_decode(UTL_RAW.cast_to_raw(l_chunk)) );
      l_pos := l_pos + l_amt;
    END LOOP;
    RETURN l_blob;
  END base64_to_blob;

  ------------------------------------------------------------------
  --  PDF SIGNATURE  ("%PDF" at head, "%%EOF" near tail)
  ------------------------------------------------------------------
  FUNCTION is_pdf_signature ( p_blob IN BLOB ) RETURN BOOLEAN
  IS
    l_head  VARCHAR2(8);
    l_tail  VARCHAR2(64);
    l_len   INTEGER;
  BEGIN
    IF p_blob IS NULL OR DBMS_LOB.getlength(p_blob) < 8 THEN
      RETURN FALSE;
    END IF;
    l_len  := DBMS_LOB.getlength(p_blob);
    l_head := UTL_RAW.cast_to_varchar2(DBMS_LOB.substr(p_blob, 4, 1));
    l_tail := UTL_RAW.cast_to_varchar2(
                DBMS_LOB.substr(p_blob, LEAST(64,l_len), GREATEST(1,l_len-63)));
    RETURN l_head = xxtjx_ksef_cons_pkg.gc_pdf_magic
       AND INSTR(l_tail, xxtjx_ksef_cons_pkg.gc_pdf_eof) > 0;
  END is_pdf_signature;

  ------------------------------------------------------------------
  --  CHART OF ACCOUNTS
  ------------------------------------------------------------------
  FUNCTION normalize_ccid_string ( p_concat IN VARCHAR2, p_coa_id IN NUMBER )
    RETURN VARCHAR2
  IS
    l_delim VARCHAR2(1);
  BEGIN
    l_delim := fnd_flex_ext.get_delimiter('SQLGL','GL#',p_coa_id);
    IF l_delim = '.' THEN
      RETURN p_concat;                 -- already correct
    END IF;
    RETURN REPLACE(p_concat, '.', l_delim);
  END normalize_ccid_string;

  FUNCTION get_ccid ( p_concat IN VARCHAR2, p_coa_id IN NUMBER
                    , p_date IN DATE DEFAULT SYSDATE ) RETURN NUMBER
  IS
    l_ccid   NUMBER;
    l_segs   fnd_flex_ext.segmentarray;
    l_nsegs  NUMBER;
    l_delim  VARCHAR2(1);
  BEGIN
    l_delim := fnd_flex_ext.get_delimiter('SQLGL','GL#',p_coa_id);
    l_nsegs := fnd_flex_ext.breakup_segments(
                 normalize_ccid_string(p_concat,p_coa_id), l_delim, l_segs);
    l_ccid  := fnd_flex_ext.get_ccid('SQLGL','GL#',p_coa_id
                 , TO_CHAR(p_date,'YYYY/MM/DD HH24:MI:SS')
                 , fnd_flex_ext.concatenate_segments(l_nsegs,l_segs,l_delim));
    RETURN NVL(l_ccid, 0);
  EXCEPTION
    WHEN OTHERS THEN RETURN 0;
  END get_ccid;

  ------------------------------------------------------------------
  --  FILE SYSTEM (native)
  ------------------------------------------------------------------
  FUNCTION list_files ( p_directory IN VARCHAR2, p_mask IN VARCHAR2 DEFAULT '%' )
    RETURN g_file_tab PIPELINED
  IS
    -- Native directory enumeration via DBMS_BACKUP_RESTORE.searchFiles.
    -- NOTE: requires EXECUTE on SYS.DBMS_BACKUP_RESTORE and SELECT on
    --   SYS.X$KRBMSFT (granted to XXTJX at install). If the site policy
    --   forbids x$ access, substitute the existing TJX framework's
    --   directory-listing routine here - it is the ONLY coupling point.
    l_path VARCHAR2(1024);
    l_ns   VARCHAR2(1024);
  BEGIN
    SELECT directory_path INTO l_path
      FROM all_directories WHERE directory_name = UPPER(p_directory);

    sys.dbms_backup_restore.searchFiles(l_path, l_ns);

    FOR r IN ( SELECT fname_krbmsft AS fname
                 FROM sys.x$krbmsft
                WHERE fname_krbmsft LIKE l_path || '%'
                  AND fname_krbmsft LIKE '%' )
    LOOP
      DECLARE
        l_base VARCHAR2(512) := REGEXP_SUBSTR(r.fname,'[^/\\]+$');
        l_rec  g_file_rec;
      BEGIN
        IF l_base LIKE p_mask THEN
          l_rec.file_name := l_base;
          l_rec.file_size := NULL;
          PIPE ROW(l_rec);
        END IF;
      END;
    END LOOP;
    RETURN;
  END list_files;

  PROCEDURE load_file_to_clob ( p_directory IN VARCHAR2
                              , p_file_name IN VARCHAR2
                              , p_clob      OUT NOCOPY CLOB )
  IS
    l_bfile   BFILE;
    l_dstoff  INTEGER := 1;
    l_srcoff  INTEGER := 1;
    l_lang    INTEGER := 0;
    l_warn    INTEGER := 0;
  BEGIN
    DBMS_LOB.createtemporary(p_clob, TRUE);
    l_bfile := BFILENAME(p_directory, p_file_name);
    DBMS_LOB.fileopen(l_bfile, DBMS_LOB.file_readonly);
    DBMS_LOB.loadclobfromfile( p_clob, l_bfile
                             , DBMS_LOB.getlength(l_bfile)
                             , l_dstoff, l_srcoff
                             , NLS_CHARSET_ID('AL32UTF8')  -- JSON is UTF-8
                             , l_lang, l_warn );
    DBMS_LOB.fileclose(l_bfile);
  EXCEPTION
    WHEN OTHERS THEN
      IF DBMS_LOB.fileisopen(l_bfile) = 1 THEN DBMS_LOB.fileclose(l_bfile); END IF;
      RAISE;
  END load_file_to_clob;

  PROCEDURE move_file ( p_src_dir IN VARCHAR2, p_src_file IN VARCHAR2
                      , p_dst_dir IN VARCHAR2, p_dst_file IN VARCHAR2 )
  IS
  BEGIN
    -- UTL_FILE.FRENAME performs an atomic move when dirs share a filesystem.
    UTL_FILE.frename(p_src_dir, p_src_file, p_dst_dir, p_dst_file, overwrite => TRUE);
  EXCEPTION
    WHEN OTHERS THEN
      -- Fall back to copy + remove for cross-filesystem moves.
      BEGIN
        UTL_FILE.fcopy(p_src_dir, p_src_file, p_dst_dir, p_dst_file);
        UTL_FILE.fremove(p_src_dir, p_src_file);
      EXCEPTION WHEN OTHERS THEN
        xxtjx_ksef_log_pkg.log_error('move_file'
          ,'Could not move '||p_src_file||' from '||p_src_dir||' to '||p_dst_dir);
        RAISE;
      END;
  END move_file;

END xxtjx_ksef_util_pkg;
/
