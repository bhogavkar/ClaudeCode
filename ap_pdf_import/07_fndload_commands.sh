#!/bin/bash
# =============================================================================
# File        : 07_fndload_commands.sh
# Description : FNDLOAD commands to register the AP PDF Import concurrent
#               program (and its executable) in Oracle EBS R12.
# Run as      : applmgr user on the EBS application tier
# Pre-req     : Oracle EBS environment sourced (. /path/to/EBSapps.env run)
# =============================================================================

# ---------------------------------------------------------------------------
# ENVIRONMENT — adjust the two variables below before running
# ---------------------------------------------------------------------------
APPS_PWD="apps"                   # APPS schema password
LDT_FILE="$CUSTOM_TOP/import/XXCUST_AP_PDF_CP.ldt"

# LCT (loader configuration template) for concurrent programs
LCT_FILE="$FND_TOP/patch/115/import/afcpprog.lct"

# ---------------------------------------------------------------------------
# Validation: ensure the LDT and LCT files exist
# ---------------------------------------------------------------------------
if [ ! -f "$LDT_FILE" ]; then
  echo "ERROR: LDT file not found: $LDT_FILE"
  echo "       Copy 06_concurrent_program.ldt to \$CUSTOM_TOP/import/ and rename."
  exit 1
fi

if [ ! -f "$LCT_FILE" ]; then
  echo "ERROR: LCT file not found: $LCT_FILE"
  echo "       Check that FND_TOP is sourced correctly."
  exit 1
fi

echo "============================================================"
echo " Oracle EBS R12 - FNDLOAD: AP PDF Import CP Registration"
echo " LDT : $LDT_FILE"
echo " LCT : $LCT_FILE"
echo "============================================================"

# ---------------------------------------------------------------------------
# STEP 1: UPLOAD — register Executable + Concurrent Program in EBS
# ---------------------------------------------------------------------------
echo ""
echo "Step 1: Uploading executable and concurrent program..."

FNDLOAD apps/$APPS_PWD 0 Y UPLOAD \
    "$LCT_FILE" \
    "$LDT_FILE"

if [ $? -ne 0 ]; then
  echo "ERROR: FNDLOAD UPLOAD failed. Check the log above."
  exit 1
fi

echo "UPLOAD complete."

# ---------------------------------------------------------------------------
# STEP 2: VERIFY — query EBS to confirm objects were created
# ---------------------------------------------------------------------------
echo ""
echo "Step 2: Verifying registered objects in EBS..."

sqlplus -s apps/$APPS_PWD <<EOF
SET LINESIZE 200
SET PAGESIZE 50
SET FEEDBACK OFF

PROMPT
PROMPT --- Executable ---
SELECT fe.executable_short_name,
       fe.user_executable_name,
       fe.execution_method,
       fe.execution_file_name,
       fe.subroutine_name
FROM   fnd_executables_vl fe
WHERE  fe.executable_short_name = 'XXCUST_AP_PDF_EXE';

PROMPT
PROMPT --- Concurrent Program ---
SELECT fcp.concurrent_program_name,
       fcp.user_concurrent_program_name,
       fcp.enabled_flag,
       fcp.execution_method_code
FROM   fnd_concurrent_programs_vl fcp
WHERE  fcp.concurrent_program_name    = 'XXCUST_AP_PDF_PRG'
AND    fcp.application_id = (
           SELECT application_id FROM fnd_application
           WHERE  application_short_name = 'SQLAP');

PROMPT
PROMPT --- Parameters ---
SELECT fcpp.column_seq_num     AS seq,
       fcpp.end_user_column_name,
       fcpp.prompt,
       fcpp.required_flag,
       fcpp.display_flag,
       fcpp.maximum_size
FROM   fnd_concurrent_program_parameters fcpp
JOIN   fnd_concurrent_programs fcp
    ON fcp.concurrent_program_id = fcpp.concurrent_program_id
   AND fcp.application_id        = fcpp.application_id
WHERE  fcp.concurrent_program_name = 'XXCUST_AP_PDF_PRG'
ORDER  BY fcpp.column_seq_num;
EOF

# ---------------------------------------------------------------------------
# STEP 3: ADD TO REQUEST GROUP
#   Adds the CP to the "Payables All Reports" request group so it is
#   visible to users with the Payables Manager responsibility.
#   Adjust REQUEST_GROUP_NAME / APPLICATION_SHORT_NAME as needed.
# ---------------------------------------------------------------------------
echo ""
echo "Step 3: Adding CP to Request Group..."

sqlplus -s apps/$APPS_PWD <<EOF
SET SERVEROUTPUT ON SIZE UNLIMITED
SET FEEDBACK OFF

DECLARE
    l_request_group_id NUMBER;
    l_application_id   NUMBER;
    l_prog_app_id      NUMBER;
    l_prog_id          NUMBER;
BEGIN
    -- Resolve application IDs
    SELECT application_id INTO l_application_id
    FROM   fnd_application
    WHERE  application_short_name = 'SQLAP';

    SELECT application_id INTO l_prog_app_id
    FROM   fnd_application
    WHERE  application_short_name = 'SQLAP';

    -- Resolve concurrent program ID
    SELECT concurrent_program_id INTO l_prog_id
    FROM   fnd_concurrent_programs
    WHERE  concurrent_program_name = 'XXCUST_AP_PDF_PRG'
    AND    application_id          = l_prog_app_id;

    -- Resolve Request Group ID
    -- Change REQUEST_GROUP_NAME to match your target responsibility's group.
    SELECT request_group_id INTO l_request_group_id
    FROM   fnd_request_groups
    WHERE  request_group_name    = 'Payables All Reports'
    AND    application_id        = l_application_id
    AND    ROWNUM = 1;

    -- Insert into request group (skip if already present)
    INSERT INTO fnd_request_group_units (
        request_group_id,
        application_id,
        request_unit_type,
        request_unit_id,
        unit_application_id,
        created_by,
        creation_date,
        last_updated_by,
        last_update_date,
        last_update_login
    )
    SELECT l_request_group_id,
           l_application_id,
           'P',           -- P = Program
           l_prog_id,
           l_prog_app_id,
           -1, SYSDATE, -1, SYSDATE, -1
    FROM   DUAL
    WHERE  NOT EXISTS (
               SELECT 1 FROM fnd_request_group_units
               WHERE  request_group_id   = l_request_group_id
               AND    request_unit_id    = l_prog_id
               AND    request_unit_type  = 'P'
           );

    IF SQL%ROWCOUNT > 0 THEN
        COMMIT;
        DBMS_OUTPUT.PUT_LINE('CP added to Request Group "Payables All Reports".');
    ELSE
        DBMS_OUTPUT.PUT_LINE('CP already in Request Group — no action needed.');
    END IF;

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        DBMS_OUTPUT.PUT_LINE('WARNING: Request group "Payables All Reports" not found.');
        DBMS_OUTPUT.PUT_LINE('         Add the CP to a request group manually via:');
        DBMS_OUTPUT.PUT_LINE('         System Administrator > Concurrent > Program > Request');
        ROLLBACK;
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('ERROR adding to request group: ' || SQLERRM);
        ROLLBACK;
END;
/
EOF

# ---------------------------------------------------------------------------
# STEP 4: DOWNLOAD (optional) — extract the registered LDT back from EBS
#         Useful to confirm what FNDLOAD actually stored, or to version-control
#         the canonical record.
# ---------------------------------------------------------------------------
echo ""
echo "Step 4 (optional): Download registered LDT back from EBS for confirmation..."
echo "  Run manually if needed:"
echo ""
echo "  # Download executable:"
echo "  FNDLOAD apps/\$APPS_PWD 0 Y DOWNLOAD \\"
echo "      \$FND_TOP/patch/115/import/afcpprog.lct \\"
echo "      XXCUST_AP_PDF_CP_downloaded.ldt \\"
echo "      EXECUTABLE EXECUTABLE_SHORT_NAME=\"XXCUST_AP_PDF_EXE\" APPLICATION_SHORT_NAME=\"SQLAP\""
echo ""
echo "  # Download concurrent program + parameters:"
echo "  FNDLOAD apps/\$APPS_PWD 0 Y DOWNLOAD \\"
echo "      \$FND_TOP/patch/115/import/afcpprog.lct \\"
echo "      XXCUST_AP_PDF_CP_downloaded.ldt \\"
echo "      PROGRAM SHORT_NAME=\"XXCUST_AP_PDF_PRG\" APPLICATION_SHORT_NAME=\"SQLAP\""

echo ""
echo "============================================================"
echo " Registration complete."
echo " Navigate to: Payables Manager > Submit a New Request"
echo "              Search: 'XX AP PDF Import - KSeF OpenText'"
echo "============================================================"
