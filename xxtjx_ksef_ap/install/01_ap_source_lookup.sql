-- =====================================================================
--  01 - Register the Payables import SOURCE  'TJX E-Invoice'
--  Payables Open Interface Import only accepts a registered SOURCE.
--  Run as APPS.  (Equivalent to Payables > Setup > Lookups > Source.)
-- =====================================================================
SET DEFINE OFF;
DECLARE
  l_exists NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_exists
    FROM ap_lookup_codes
   WHERE lookup_type = 'SOURCE'
     AND lookup_code = 'TJX E-Invoice';

  IF l_exists = 0 THEN
    INSERT INTO fnd_lookup_values
      ( lookup_type, lookup_code, meaning, description
      , enabled_flag, start_date_active, view_application_id
      , security_group_id, language, source_lang
      , creation_date, created_by, last_update_date, last_updated_by, last_update_login )
    SELECT 'SOURCE', 'TJX E-Invoice', 'TJX E-Invoice (KSeF/OpenText)'
         , 'Inbound AP invoices from OpenText / KSeF portal'
         , 'Y', TRUNC(SYSDATE), 200, 0, l.language_code, USERENV('LANG')
         , SYSDATE, fnd_global.user_id, SYSDATE, fnd_global.user_id, fnd_global.login_id
      FROM fnd_languages l
     WHERE l.installed_flag IN ('B','I');
    COMMIT;
    DBMS_OUTPUT.put_line('Source "TJX E-Invoice" registered.');
  ELSE
    DBMS_OUTPUT.put_line('Source "TJX E-Invoice" already present - skipped.');
  END IF;
END;
/

-- Confirm the FND attachment category "Supplier" exists (seeded in AP).
DECLARE l_cat NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_cat
    FROM fnd_document_categories_tl
   WHERE name = 'Supplier' AND language = USERENV('LANG');
  IF l_cat = 0 THEN
    DBMS_OUTPUT.put_line('WARNING: FND category "Supplier" not found - create it before go-live.');
  END IF;
END;
/
