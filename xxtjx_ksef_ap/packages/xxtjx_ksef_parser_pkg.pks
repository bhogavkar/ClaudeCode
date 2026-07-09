CREATE OR REPLACE PACKAGE apps.xxtjx_ksef_parser_pkg
AS
  -- ===================================================================
  --  XXTJX_KSEF_PARSER_PKG : Native JSON parsing layer.
  --  ***  THE ONLY PACKAGE COUPLED TO THE PHYSICAL JSON STRUCTURE.  ***
  --  Reads raw payload from XXTJX_KSEF_FILES (status LOADED), parses
  --  header/lines/files with Oracle 19c native JSON (JSON_TABLE /
  --  JSON_VALUE), and populates HDR_STG / LINE_STG / attachment stub.
  --  No external Java / libraries / shell.
  -- ===================================================================

  -- Parse every file currently in status LOADED (set-based driver).
  PROCEDURE parse_pending ( p_parsed OUT NUMBER, p_failed OUT NUMBER );

  -- Parse one file (reusable / unit-testable).
  PROCEDURE parse_file ( p_file_id IN NUMBER, p_status OUT VARCHAR2 );

END xxtjx_ksef_parser_pkg;
/
