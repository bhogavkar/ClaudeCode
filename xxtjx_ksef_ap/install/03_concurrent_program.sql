-- =====================================================================
--  03 - Concurrent executables, programs, parameters, request group
--  Run as APPS. Uses fnd_program API (recreate-safe).
--  Application short name assumed: XXTJX  (custom application).
-- =====================================================================
SET DEFINE OFF;
SET SERVEROUTPUT ON;
DECLARE
  c_app CONSTANT VARCHAR2(30) := 'XXTJX';
BEGIN
  ------------------------------------------------------------------
  -- 1) EXECUTABLE - Main pipeline
  ------------------------------------------------------------------
  fnd_program.executable
    ( executable          => 'XXTJX_KSEF_AP_IMPORT_EXE'
    , application          => c_app
    , short_name           => 'XXTJX_KSEF_AP_IMPORT_EXE'
    , description          => 'KSeF/OpenText AP invoice import pipeline'
    , execution_method     => 'PL/SQL Stored Procedure'
    , execution_file_name  => 'XXTJX_KSEF_MAIN_PKG.RUN' );

  -- EXECUTABLE - standalone loader
  fnd_program.executable
    ( executable          => 'XXTJX_KSEF_LOADER_EXE'
    , application          => c_app
    , short_name           => 'XXTJX_KSEF_LOADER_EXE'
    , description          => 'KSeF JSON loader'
    , execution_method     => 'PL/SQL Stored Procedure'
    , execution_file_name  => 'XXTJX_KSEF_LOADER_PKG.MAIN' );

  ------------------------------------------------------------------
  -- 2) PROGRAM - Main pipeline
  ------------------------------------------------------------------
  fnd_program.register
    ( program               => 'TJX KSeF AP Invoice Import'
    , application            => c_app
    , enabled                => 'Y'
    , short_name             => 'XXTJX_KSEF_AP_IMPORT'
    , description            => 'Import AP invoices from OpenText/KSeF and attach PDFs'
    , executable_short_name  => 'XXTJX_KSEF_AP_IMPORT_EXE'
    , executable_application => c_app
    , output_type            => 'TEXT'
    , print                  => 'Y'
    , cols                   => 132
    , rows                   => 60 );

  -- Parameters (token order matches XXTJX_KSEF_MAIN_PKG.RUN after errbuf/retcode)
  fnd_program.parameter
    ( program_short_name => 'XXTJX_KSEF_AP_IMPORT', application => c_app
    , sequence => 10, parameter => 'P_PHASE'
    , description => 'Phase', enabled => 'Y'
    , value_set => 'XXTJX_KSEF_PHASE', default_type => 'Constant'
    , default_value => 'ALL', required => 'Y', display => 'Y'
    , display_size => 10, description_size => 40, concat_desc_size => 55 );

  fnd_program.parameter
    ( program_short_name => 'XXTJX_KSEF_AP_IMPORT', application => c_app
    , sequence => 20, parameter => 'P_SOURCE_DIR'
    , description => 'Source directory', enabled => 'Y'
    , value_set => 'XXTJX_KSEF_DIR', default_type => 'Constant'
    , default_value => 'XXTJX_KSEF_PROCESS', required => 'N', display => 'Y'
    , display_size => 30, description_size => 40, concat_desc_size => 60 );

  fnd_program.parameter
    ( program_short_name => 'XXTJX_KSEF_AP_IMPORT', application => c_app
    , sequence => 30, parameter => 'P_MAX_FILES'
    , description => 'Max files (blank = all)', enabled => 'Y'
    , value_set => 'FND_NUMBER', required => 'N', display => 'Y'
    , display_size => 10, description_size => 40, concat_desc_size => 55 );

  ------------------------------------------------------------------
  -- 3) PROGRAM - standalone loader
  ------------------------------------------------------------------
  fnd_program.register
    ( program               => 'TJX KSeF JSON Loader'
    , application            => c_app
    , enabled                => 'Y'
    , short_name             => 'XXTJX_KSEF_LOADER'
    , description            => 'Load KSeF JSON files into the raw repository'
    , executable_short_name  => 'XXTJX_KSEF_LOADER_EXE'
    , executable_application => c_app
    , output_type            => 'TEXT' );

  fnd_program.parameter
    ( program_short_name => 'XXTJX_KSEF_LOADER', application => c_app
    , sequence => 10, parameter => 'P_SOURCE_DIR'
    , description => 'Source directory', enabled => 'Y'
    , value_set => 'XXTJX_KSEF_DIR', default_type => 'Constant'
    , default_value => 'XXTJX_KSEF_PROCESS', required => 'N', display => 'Y'
    , display_size => 30, description_size => 40, concat_desc_size => 60 );

  fnd_program.parameter
    ( program_short_name => 'XXTJX_KSEF_LOADER', application => c_app
    , sequence => 20, parameter => 'P_MAX_FILES'
    , description => 'Max files', enabled => 'Y'
    , value_set => 'FND_NUMBER', required => 'N', display => 'Y'
    , display_size => 10, description_size => 40, concat_desc_size => 55 );

  ------------------------------------------------------------------
  -- 4) Attach to request group (Payables All + custom KSeF group)
  ------------------------------------------------------------------
  fnd_program.add_to_group
    ( program_short_name => 'XXTJX_KSEF_AP_IMPORT', program_application => c_app
    , request_group => 'All Reports', group_application => 'SQLAP' );
  fnd_program.add_to_group
    ( program_short_name => 'XXTJX_KSEF_LOADER', program_application => c_app
    , request_group => 'All Reports', group_application => 'SQLAP' );

  COMMIT;
  DBMS_OUTPUT.put_line('Concurrent programs registered.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.put_line('Registration error: '||SQLERRM);
    ROLLBACK;
    RAISE;
END;
/
