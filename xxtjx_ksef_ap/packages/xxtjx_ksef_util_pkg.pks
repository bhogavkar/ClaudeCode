CREATE OR REPLACE PACKAGE apps.xxtjx_ksef_util_pkg
AS
  -- ===================================================================
  --  XXTJX_KSEF_UTIL_PKG : Reusable, side-effect-light utilities.
  -- ===================================================================

  TYPE g_file_rec  IS RECORD ( file_name VARCHAR2(512), file_size NUMBER );
  TYPE g_file_tab  IS TABLE OF g_file_rec;

  -- ---- Date helpers (schema uses MMDDYYYY / MMDDYYHHMISS) ----
  FUNCTION to_date_mmddyyyy   ( p_str IN VARCHAR2 ) RETURN DATE;
  FUNCTION to_date_mmddyyhhmi ( p_str IN VARCHAR2 ) RETURN DATE;  -- batchId
  FUNCTION is_valid_mmddyyyy  ( p_str IN VARCHAR2 ) RETURN BOOLEAN;

  -- ---- Hashing ----
  FUNCTION sha256_clob ( p_clob IN CLOB ) RETURN VARCHAR2;
  FUNCTION sha256_blob ( p_blob IN BLOB ) RETURN VARCHAR2;

  -- ---- Base64 ----
  FUNCTION is_base64    ( p_str IN VARCHAR2 ) RETURN BOOLEAN;
  -- Chunked, memory-safe decode of a (potentially large) base64 CLOB to BLOB.
  FUNCTION base64_to_blob ( p_b64 IN CLOB ) RETURN BLOB;

  -- ---- PDF checks ----
  FUNCTION is_pdf_signature ( p_blob IN BLOB ) RETURN BOOLEAN;

  -- ---- Chart of accounts ----
  -- Normalise the payload '.'-delimited COA to the live GL flexfield delimiter.
  FUNCTION normalize_ccid_string ( p_concat IN VARCHAR2, p_coa_id IN NUMBER )
    RETURN VARCHAR2;
  -- Resolve concatenated segments to a CODE_COMBINATION_ID (0 => not found).
  FUNCTION get_ccid ( p_concat  IN VARCHAR2
                    , p_coa_id  IN NUMBER
                    , p_date    IN DATE DEFAULT SYSDATE ) RETURN NUMBER;

  -- ---- File system (native, no Java) ----
  -- Enumerate files in a DB directory object matching a LIKE mask.
  FUNCTION list_files ( p_directory IN VARCHAR2, p_mask IN VARCHAR2 DEFAULT '%' )
    RETURN g_file_tab PIPELINED;
  -- Load an OS file into a CLOB (native charset conversion).
  PROCEDURE load_file_to_clob ( p_directory IN VARCHAR2
                              , p_file_name IN VARCHAR2
                              , p_clob      OUT NOCOPY CLOB );
  -- Move a file between directory objects (rename = atomic move on same FS).
  PROCEDURE move_file ( p_src_dir IN VARCHAR2, p_src_file IN VARCHAR2
                      , p_dst_dir IN VARCHAR2, p_dst_file IN VARCHAR2 );

END xxtjx_ksef_util_pkg;
/
