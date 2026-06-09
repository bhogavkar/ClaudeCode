-- =============================================================================
-- File        : 05_test_sample.sql
-- Description : Sample test script for one invoice.
--               Run as APPS after placing a test PDF in the OS directory.
--               Assumes the target invoice already exists in AP_INVOICES_ALL.
-- =============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED
SET VERIFY     OFF
SET FEEDBACK   OFF

PROMPT ============================================================
PROMPT  AP PDF Import - Single Invoice Test
PROMPT ============================================================

-- ---------------------------------------------------------------------------
-- STEP 0: Initialise FND session (mandatory before any FND API call).
--         Replace the three values below with real IDs for your environment.
--
--   To find your user_id:
--       SELECT user_id FROM fnd_user WHERE user_name = 'OPERATIONS';
--
--   To find resp_id and resp_appl_id for "Payables Manager":
--       SELECT responsibility_id, application_id
--         FROM fnd_responsibility_vl
--        WHERE responsibility_name = 'Payables Manager';
-- ---------------------------------------------------------------------------
BEGIN
    FND_GLOBAL.APPS_INITIALIZE(
        user_id      => 1003269,   -- <<< replace with actual user_id
        resp_id      => 50559,     -- <<< replace with Payables Manager resp_id
        resp_appl_id => 200        -- 200 = Oracle Payables application
    );
    DBMS_OUTPUT.PUT_LINE('FND context initialised for user_id='
                         || FND_GLOBAL.USER_ID);
END;
/

-- ---------------------------------------------------------------------------
-- STEP 1: Verify the target invoice exists before running the import.
--         Change the invoice number to a real one in your instance.
-- ---------------------------------------------------------------------------
PROMPT
PROMPT Step 1: Verify invoice exists in EBS
PROMPT

SELECT invoice_id,
       invoice_num,
       vendor_id,
       invoice_date,
       invoice_amount,
       org_id
FROM   ap_invoices_all
WHERE  invoice_num = 'TEST-INV-001';     -- <<< replace with real invoice number

-- ---------------------------------------------------------------------------
-- STEP 2: (Optional) Check what is already in the staging table for this K-Sef.
--         Expected: no rows if this is a fresh run.
-- ---------------------------------------------------------------------------
PROMPT
PROMPT Step 2: Check existing staging records
PROMPT

SELECT staging_id,
       ksef_number,
       status,
       ROUND(file_size_bytes / 1048576, 2) AS file_size_mb,
       invoice_num,
       fnd_document_id,
       fnd_attached_doc_id,
       creation_date
FROM   xxcust_ap_pdf_staging
WHERE  ksef_number = '12345678901234567890123456789012345'  -- <<< replace with real K-Sef
ORDER  BY creation_date DESC;

-- ---------------------------------------------------------------------------
-- STEP 3: Run the end-to-end process.
--         p_file_name   : PDF file that must exist under AP_PDF_DIR on disk.
--         p_invoice_num : Invoice number in EBS (already existing).
-- ---------------------------------------------------------------------------
PROMPT
PROMPT Step 3: Execute XXCUST_AP_PDF_PKG.process_pdf
PROMPT

DECLARE
    l_status  VARCHAR2(30);
    l_message VARCHAR2(4000);
BEGIN
    XXCUST_AP_PDF_PKG.process_pdf(
        p_file_name   => '12345678901234567890123456789012345.pdf', -- <<< replace
        p_invoice_num => 'TEST-INV-001',                            -- <<< replace
        x_status      => l_status,
        x_message     => l_message
    );

    DBMS_OUTPUT.PUT_LINE('');
    DBMS_OUTPUT.PUT_LINE('========================================');
    DBMS_OUTPUT.PUT_LINE('RESULT STATUS  : ' || l_status);
    DBMS_OUTPUT.PUT_LINE('RESULT MESSAGE : ' || l_message);
    DBMS_OUTPUT.PUT_LINE('========================================');
END;
/

-- ---------------------------------------------------------------------------
-- STEP 4: Post-run verification queries
-- ---------------------------------------------------------------------------
PROMPT
PROMPT Step 4a: Staging record after run
PROMPT

SELECT staging_id,
       ksef_number,
       status,
       ROUND(file_size_bytes / 1048576, 2)  AS file_size_mb,
       invoice_id,
       invoice_num,
       fnd_media_id,
       fnd_document_id,
       fnd_attached_doc_id,
       error_message,
       process_date
FROM   xxcust_ap_pdf_staging
WHERE  ksef_number = '12345678901234567890123456789012345'  -- <<< replace
ORDER  BY creation_date DESC;

PROMPT
PROMPT Step 4b: FND attachment records created
PROMPT

SELECT fad.attached_document_id,
       fad.entity_name,
       fad.pk1_value           AS invoice_id,
       fad.seq_num,
       fd.document_id,
       fd.datatype_id,
       fd.category_id,
       fd.media_id,
       fd.status_type,
       fd.usage_type,
       tl.description,
       tl.file_name,
       fl.file_content_type,
       ROUND(DBMS_LOB.GETLENGTH(fl.file_data) / 1048576, 2) AS blob_size_mb
FROM   fnd_attached_documents fad
JOIN   fnd_documents          fd  ON  fd.document_id = fad.document_id
JOIN   fnd_documents_tl       tl  ON  tl.document_id = fd.document_id
                                  AND tl.language     = USERENV('LANG')
JOIN   fnd_lobs               fl  ON  fl.file_id      = fd.media_id
WHERE  fad.entity_name = 'AP_INVOICES'
AND    fad.pk1_value   = (
           SELECT TO_CHAR(invoice_id)
           FROM   ap_invoices_all
           WHERE  invoice_num = 'TEST-INV-001'   -- <<< replace
           AND    ROWNUM = 1
       )
ORDER  BY fad.seq_num;

PROMPT
PROMPT Step 4c: Category sanity check (confirm category name and ID)
PROMPT

SELECT category_id,
       name             AS category_code,
       user_name        AS category_display_name,
       description
FROM   fnd_document_categories_vl
WHERE  UPPER(name) IN ('FROM_SUPPLIER','MISCELLANEOUS')
ORDER  BY name;

PROMPT
PROMPT Test script complete.
