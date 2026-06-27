CREATE OR REPLACE PACKAGE BODY xxtjx_wd_exp_ap_imp_pkg AS
/****************************************************************************
 * PACKAGE BODY : XXTJX_WD_EXP_AP_IMP_PKG
 * See package specification for purpose, scope and history.
 ***************************************************************************/

   --======================================================================
   -- Private global state (lightweight - no custom log/control tables)
   --======================================================================
   g_request_id  CONSTANT NUMBER := NVL(fnd_global.conc_request_id, -1);
   g_user_id     CONSTANT NUMBER := NVL(fnd_global.user_id, -1);
   g_login_id    CONSTANT NUMBER := NVL(fnd_global.login_id, -1);
   g_debug                BOOLEAN := FALSE;

   g_fetched              PLS_INTEGER := 0;
   g_success              PLS_INTEGER := 0;
   g_failed               PLS_INTEGER := 0;

   e_fatal       EXCEPTION;        -- aborts the run

   --======================================================================
   -- 1. log : single Oracle-standard logging primitive
   --======================================================================
   PROCEDURE log (p_proc IN VARCHAR2, p_msg IN VARCHAR2,
                  p_force IN BOOLEAN DEFAULT FALSE)
   IS
   BEGIN
      IF g_debug OR p_force THEN
         fnd_file.put_line(fnd_file.log,
            TO_CHAR(SYSTIMESTAMP,'HH24:MI:SS.FF3')||' ['||p_proc||'] '||p_msg);
      END IF;
   END log;

   --======================================================================
   -- 2. flag_error : stamp error on a single staging row.
   --    Autonomous so the error survives a later interface rollback.
   --    Used for the file/parse/unexpected paths and bulk-exception mapping.
   --======================================================================
   PROCEDURE flag_error (p_stg_id IN NUMBER, p_message IN VARCHAR2)
   IS
      PRAGMA AUTONOMOUS_TRANSACTION;
   BEGIN
      UPDATE xxtjx_wd_exp_stg
         SET error_flag       = gc_yes,
             process_status   = gc_st_error,
             error_message    = SUBSTR(p_message,1,2000),
             last_update_date = SYSDATE,
             last_updated_by  = g_user_id
       WHERE stg_id = p_stg_id;
      COMMIT;
   END flag_error;

   --======================================================================
   -- 3. cascade_header_errors : a header in error invalidates all its lines
   --======================================================================
   PROCEDURE cascade_header_errors (p_batch_id IN VARCHAR2)
   IS
   BEGIN
      UPDATE xxtjx_wd_exp_stg l
         SET l.error_flag       = gc_yes,
             l.process_status   = gc_st_error,
             l.error_message    = SUBSTR(NVL(l.error_message,
                                       'Parent invoice header is in error'),1,2000),
             l.last_update_date = SYSDATE,
             l.last_updated_by  = g_user_id
       WHERE l.batch_id    = p_batch_id
         AND l.record_type = gc_rec_line
         AND l.error_flag  = gc_no
         AND EXISTS ( SELECT 1
                        FROM xxtjx_wd_exp_stg h
                       WHERE h.batch_id    = l.batch_id
                         AND h.invoice_num = l.invoice_num
                         AND h.record_type = gc_rec_header
                         AND h.error_flag  = gc_yes );
   END cascade_header_errors;

   --======================================================================
   -- 4. reconcile_batch : trailer-count vs loaded-count check
   --======================================================================
   PROCEDURE reconcile_batch (p_batch_id IN VARCHAR2, p_trailer_cnt IN NUMBER)
   IS
      l_loaded  PLS_INTEGER;
   BEGIN
      IF p_trailer_cnt IS NULL THEN
         log('reconcile_batch','No trailer count supplied - skipping reconciliation');
         RETURN;
      END IF;

      SELECT COUNT(*)
        INTO l_loaded
        FROM xxtjx_wd_exp_stg
       WHERE batch_id = p_batch_id
         AND record_type IN (gc_rec_header, gc_rec_line);

      log('reconcile_batch','Trailer='||p_trailer_cnt||' Loaded='||l_loaded, TRUE);

      IF l_loaded <> p_trailer_cnt THEN
         fnd_file.put_line(fnd_file.log,
            'FATAL: Trailer count ('||p_trailer_cnt||') <> loaded DH+DL count ('
            ||l_loaded||') for batch '||p_batch_id);
         RAISE e_fatal;
      END IF;
   END reconcile_batch;

   --======================================================================
   -- 5. validate_mandatory : null / format / constant checks (set-based)
   --======================================================================
   PROCEDURE validate_mandatory (p_batch_id IN VARCHAR2, p_source IN VARCHAR2)
   IS
   BEGIN
      ------------------------------------------------ header mandatory fields
      UPDATE xxtjx_wd_exp_stg s
         SET s.error_flag     = gc_yes,
             s.process_status = gc_st_error,
             s.error_message  = RTRIM(
                CASE WHEN s.invoice_num         IS NULL THEN 'Missing Invoice Number; '         END ||
                CASE WHEN s.employee_number     IS NULL THEN 'Missing Employee Number; '        END ||
                CASE WHEN s.operating_unit_name IS NULL THEN 'Missing Operating Unit; '         END ||
                CASE WHEN s.source              IS NULL THEN 'Missing Source; '                 END ||
                CASE WHEN s.invoice_date        IS NULL THEN 'Missing Invoice Date; '           END ||
                CASE WHEN s.invoice_amount      IS NULL THEN 'Missing Invoice Amount; '         END ||
                CASE WHEN s.currency_code       IS NULL THEN 'Missing Currency; '               END ||
                CASE WHEN NVL(s.invoice_type,'~') <> gc_inv_type
                                                        THEN 'Invoice Type must be STANDARD; '  END ||
                CASE WHEN NVL(s.source,'~') <> p_source THEN 'Source does not match parameter; ' END ||
                CASE WHEN s.invoice_amount IS NOT NULL
                      AND VALIDATE_CONVERSION(s.invoice_amount AS NUMBER) = 0
                                                        THEN 'Invoice Amount not numeric; '     END ||
                CASE WHEN s.invoice_date IS NOT NULL
                      AND VALIDATE_CONVERSION(s.invoice_date AS DATE,'MMDDYYYY') = 0
                                                        THEN 'Invoice Date not MMDDYYYY; '      END )
       WHERE s.batch_id     = p_batch_id
         AND s.record_type  = gc_rec_header
         AND s.error_flag   = gc_no
         AND ( s.invoice_num IS NULL OR s.employee_number IS NULL
            OR s.operating_unit_name IS NULL OR s.source IS NULL
            OR s.invoice_date IS NULL OR s.invoice_amount IS NULL
            OR s.currency_code IS NULL OR NVL(s.invoice_type,'~') <> gc_inv_type
            OR NVL(s.source,'~') <> p_source
            OR VALIDATE_CONVERSION(s.invoice_amount AS NUMBER) = 0
            OR VALIDATE_CONVERSION(s.invoice_date AS DATE,'MMDDYYYY') = 0 );

      ------------------------------------------------ line mandatory fields
      UPDATE xxtjx_wd_exp_stg s
         SET s.error_flag     = gc_yes,
             s.process_status = gc_st_error,
             s.error_message  = RTRIM(
                CASE WHEN s.line_number      IS NULL THEN 'Missing Line Number; '       END ||
                CASE WHEN s.line_description IS NULL THEN 'Missing Line Description; '  END ||
                CASE WHEN s.line_amount      IS NULL THEN 'Missing Line Amount; '       END ||
                CASE WHEN s.dist_account     IS NULL THEN 'Missing Distribution Acct; ' END ||
                CASE WHEN NVL(s.line_type,'~') <> gc_line_type
                                                    THEN 'Line Type must be ITEM; '     END ||
                CASE WHEN s.line_amount IS NOT NULL
                      AND VALIDATE_CONVERSION(s.line_amount AS NUMBER) = 0
                                                    THEN 'Line Amount not numeric; '    END )
       WHERE s.batch_id     = p_batch_id
         AND s.record_type  = gc_rec_line
         AND s.error_flag   = gc_no
         AND ( s.line_number IS NULL OR s.line_description IS NULL
            OR s.line_amount IS NULL OR s.dist_account IS NULL
            OR NVL(s.line_type,'~') <> gc_line_type
            OR VALIDATE_CONVERSION(s.line_amount AS NUMBER) = 0 );

      ------------------------------------------------ source active in FND lookups
      UPDATE xxtjx_wd_exp_stg s
         SET s.error_flag     = gc_yes,
             s.process_status = gc_st_error,
             s.error_message  = 'Invalid / inactive Source: '||s.source
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_header
         AND s.error_flag  = gc_no
         AND NOT EXISTS ( SELECT 1
                            FROM fnd_lookup_values flv
                           WHERE flv.lookup_type = 'SOURCE'
                             AND flv.language     = 'US'
                             AND flv.enabled_flag = gc_yes
                             AND flv.lookup_code  = s.source
                             AND TRUNC(SYSDATE) BETWEEN
                                  NVL(flv.start_date_active,SYSDATE-1)
                              AND NVL(flv.end_date_active,SYSDATE+1) );

      ------------------------------------------------ currency enabled & effective
      UPDATE xxtjx_wd_exp_stg s
         SET s.error_flag     = gc_yes,
             s.process_status = gc_st_error,
             s.error_message  = 'Invalid currency: '||s.currency_code
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_header
         AND s.error_flag  = gc_no
         AND NOT EXISTS ( SELECT 1
                            FROM fnd_currencies c
                           WHERE c.currency_code = s.currency_code
                             AND c.enabled_flag  = gc_yes
                             AND c.currency_flag = gc_yes
                             AND TRUNC(SYSDATE) BETWEEN
                                  NVL(c.start_date_active,SYSDATE-1)
                              AND NVL(c.end_date_active,SYSDATE+1) );

      cascade_header_errors(p_batch_id);
   END validate_mandatory;

   --======================================================================
   -- 6. derive_person : employee_number -> person_id (effective-dated)
   --======================================================================
   PROCEDURE derive_person (p_batch_id IN VARCHAR2)
   IS
   BEGIN
      -- resolve person id (regular employee OR contingent worker / NPW)
      UPDATE xxtjx_wd_exp_stg s
         SET s.person_id =
             ( SELECT MAX(papf.person_id)
                 FROM per_all_people_f papf
                WHERE papf.employee_number = s.employee_number
                  AND TRUNC(SYSDATE) BETWEEN papf.effective_start_date
                                         AND papf.effective_end_date )
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_header
         AND s.error_flag  = gc_no;

      -- not found -> error
      UPDATE xxtjx_wd_exp_stg s
         SET s.error_flag     = gc_yes,
             s.process_status = gc_st_error,
             s.error_message  = 'Employee not found for number: '||s.employee_number
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_header
         AND s.error_flag  = gc_no
         AND s.person_id   IS NULL;

      cascade_header_errors(p_batch_id);
   END derive_person;

   --======================================================================
   -- 7. validate_assignment : exactly ONE active, primary, effective
   --    assignment must remain (multiple => meaningful error)
   --======================================================================
   PROCEDURE validate_assignment (p_batch_id IN VARCHAR2)
   IS
   BEGIN
      -- no active assignment at all
      UPDATE xxtjx_wd_exp_stg s
         SET s.error_flag     = gc_yes,
             s.process_status = gc_st_error,
             s.error_message  = 'No active assignment for employee: '||s.employee_number
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_header
         AND s.error_flag  = gc_no
         AND ( SELECT COUNT(*)
                 FROM per_all_assignments_f      asg,
                      per_assignment_status_types ast
                WHERE asg.person_id                = s.person_id
                  AND asg.primary_flag             = gc_yes
                  AND asg.assignment_type          IN ('E','C')
                  AND asg.assignment_status_type_id = ast.assignment_status_type_id
                  AND ast.per_system_status        = 'ACTIVE_ASSIGN'
                  AND TRUNC(SYSDATE) BETWEEN asg.effective_start_date
                                         AND asg.effective_end_date ) = 0;

      -- more than one active primary assignment => ambiguous
      UPDATE xxtjx_wd_exp_stg s
         SET s.error_flag     = gc_yes,
             s.process_status = gc_st_error,
             s.error_message  = 'Multiple active employees found for: '||s.employee_number
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_header
         AND s.error_flag  = gc_no
         AND ( SELECT COUNT(*)
                 FROM per_all_assignments_f      asg,
                      per_assignment_status_types ast
                WHERE asg.person_id                = s.person_id
                  AND asg.primary_flag             = gc_yes
                  AND asg.assignment_type          IN ('E','C')
                  AND asg.assignment_status_type_id = ast.assignment_status_type_id
                  AND ast.per_system_status        = 'ACTIVE_ASSIGN'
                  AND TRUNC(SYSDATE) BETWEEN asg.effective_start_date
                                         AND asg.effective_end_date ) > 1;

      cascade_header_errors(p_batch_id);
   END validate_assignment;

   --======================================================================
   -- 8. validate_org : OU name -> org_id, enabled, employee belongs
   --======================================================================
   PROCEDURE validate_org (p_batch_id IN VARCHAR2, p_org_id IN NUMBER)
   IS
   BEGIN
      -- derive org_id : program parameter wins, else resolve OU name
      UPDATE xxtjx_wd_exp_stg s
         SET s.org_id = NVL( p_org_id,
                           ( SELECT MAX(hou.organization_id)
                               FROM hr_operating_units hou
                              WHERE hou.name = s.operating_unit_name
                                AND TRUNC(SYSDATE) BETWEEN
                                     NVL(hou.date_from,SYSDATE-1)
                                 AND NVL(hou.date_to,SYSDATE+1) ) )
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_header
         AND s.error_flag  = gc_no;

      -- invalid / disabled operating unit
      UPDATE xxtjx_wd_exp_stg s
         SET s.error_flag     = gc_yes,
             s.process_status = gc_st_error,
             s.error_message  = 'Invalid or disabled Operating Unit: '
                                ||s.operating_unit_name
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_header
         AND s.error_flag  = gc_no
         AND s.org_id      IS NULL;

      -- employee's active assignment does not belong to the resolved OU
      UPDATE xxtjx_wd_exp_stg s
         SET s.error_flag     = gc_yes,
             s.process_status = gc_st_error,
             s.error_message  = 'Organization mismatch: employee '||s.employee_number
                                ||' has no active assignment in OU '||s.operating_unit_name
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_header
         AND s.error_flag  = gc_no
         AND s.org_id      IS NOT NULL
         AND NOT EXISTS
             ( SELECT 1
                 FROM per_all_assignments_f      asg,
                      hr_all_organization_units   hou,
                      per_assignment_status_types ast
                WHERE asg.person_id                = s.person_id
                  AND asg.primary_flag             = gc_yes
                  AND asg.assignment_status_type_id = ast.assignment_status_type_id
                  AND ast.per_system_status        = 'ACTIVE_ASSIGN'
                  AND TRUNC(SYSDATE) BETWEEN asg.effective_start_date
                                         AND asg.effective_end_date
                  AND hou.organization_id          = asg.organization_id
                  AND NVL(hou.attribute1, s.org_id) = s.org_id );  -- OU linkage

      cascade_header_errors(p_batch_id);
   END validate_org;

   --======================================================================
   -- 9. derive_supplier : person_id -> vendor_id -> vendor_site_id
   --    (reuses the seeded ap_suppliers.employee_id linkage)
   --======================================================================
   PROCEDURE derive_supplier (p_batch_id IN VARCHAR2)
   IS
   BEGIN
      -- vendor from employee link
      UPDATE xxtjx_wd_exp_stg s
         SET s.vendor_id =
             ( SELECT MAX(sup.vendor_id)
                 FROM ap_suppliers sup
                WHERE sup.employee_id  = s.person_id
                  AND sup.enabled_flag = gc_yes
                  AND TRUNC(SYSDATE) BETWEEN
                       NVL(sup.start_date_active,SYSDATE-1)
                   AND NVL(sup.end_date_active,SYSDATE+1) )
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_header
         AND s.error_flag  = gc_no;

      UPDATE xxtjx_wd_exp_stg s
         SET s.error_flag     = gc_yes,
             s.process_status = gc_st_error,
             s.error_message  = 'Vendor not found for employee: '||s.employee_number
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_header
         AND s.error_flag  = gc_no
         AND s.vendor_id   IS NULL;

      -- active pay site for the vendor in the resolved OU
      UPDATE xxtjx_wd_exp_stg s
         SET s.vendor_site_id =
             ( SELECT MAX(ass.vendor_site_id)
                 FROM ap_supplier_sites_all ass
                WHERE ass.vendor_id    = s.vendor_id
                  AND ass.org_id       = s.org_id
                  AND ass.pay_site_flag = gc_yes
                  AND NVL(ass.inactive_date,SYSDATE+1) > SYSDATE )
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_header
         AND s.error_flag  = gc_no;

      UPDATE xxtjx_wd_exp_stg s
         SET s.error_flag     = gc_yes,
             s.process_status = gc_st_error,
             s.error_message  = 'Vendor pay site not found in OU for employee: '
                                ||s.employee_number
       WHERE s.batch_id      = p_batch_id
         AND s.record_type   = gc_rec_header
         AND s.error_flag    = gc_no
         AND s.vendor_site_id IS NULL;

      cascade_header_errors(p_batch_id);
   END derive_supplier;

   --======================================================================
   -- 10. validate_expense : amounts, dist account -> ccid, hdr=Sum(lines),
   --     duplicate invoice number
   --======================================================================
   PROCEDURE validate_expense (p_batch_id IN VARCHAR2)
   IS
   BEGIN
      -- resolve distribution account string -> code_combination_id
      UPDATE xxtjx_wd_exp_stg s
         SET s.ccid =
             ( SELECT MAX(gcc.code_combination_id)
                 FROM gl_code_combinations gcc
                WHERE gcc.concatenated_segments = s.dist_account   -- view/syn supplied site-side
                  AND gcc.enabled_flag = gc_yes
                  AND TRUNC(SYSDATE) BETWEEN
                       NVL(gcc.start_date_active,SYSDATE-1)
                   AND NVL(gcc.end_date_active,SYSDATE+1) )
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_line
         AND s.error_flag  = gc_no;

      UPDATE xxtjx_wd_exp_stg s
         SET s.error_flag     = gc_yes,
             s.process_status = gc_st_error,
             s.error_message  = 'Invalid distribution account: '||s.dist_account
       WHERE s.batch_id    = p_batch_id
         AND s.record_type = gc_rec_line
         AND s.error_flag  = gc_no
         AND s.ccid        IS NULL;

      cascade_header_errors(p_batch_id);   -- a bad line invalidates its header

      -- header amount must equal sum of its (valid) line amounts
      UPDATE xxtjx_wd_exp_stg h
         SET h.error_flag     = gc_yes,
             h.process_status = gc_st_error,
             h.error_message  = 'Header amount <> sum of line amounts'
       WHERE h.batch_id    = p_batch_id
         AND h.record_type = gc_rec_header
         AND h.error_flag  = gc_no
         AND TO_NUMBER(h.invoice_amount) <>
             ( SELECT NVL(SUM(TO_NUMBER(l.line_amount)),-1)
                 FROM xxtjx_wd_exp_stg l
                WHERE l.batch_id    = h.batch_id
                  AND l.invoice_num = h.invoice_num
                  AND l.record_type = gc_rec_line );

      -- duplicate invoice number for the same vendor within this batch
      UPDATE xxtjx_wd_exp_stg h
         SET h.error_flag     = gc_yes,
             h.process_status = gc_st_error,
             h.error_message  = 'Duplicate invoice number within batch: '||h.invoice_num
       WHERE h.batch_id    = p_batch_id
         AND h.record_type = gc_rec_header
         AND h.error_flag  = gc_no
         AND ( SELECT COUNT(*)
                 FROM xxtjx_wd_exp_stg d
                WHERE d.batch_id    = h.batch_id
                  AND d.record_type = gc_rec_header
                  AND d.invoice_num = h.invoice_num
                  AND NVL(d.vendor_id,-1) = NVL(h.vendor_id,-1) ) > 1;

      -- duplicate invoice already in AP (same vendor)
      UPDATE xxtjx_wd_exp_stg h
         SET h.error_flag     = gc_yes,
             h.process_status = gc_st_error,
             h.error_message  = 'Invoice already exists in AP: '||h.invoice_num
       WHERE h.batch_id    = p_batch_id
         AND h.record_type = gc_rec_header
         AND h.error_flag  = gc_no
         AND EXISTS ( SELECT 1
                        FROM ap_invoices_all ai
                       WHERE ai.vendor_id   = h.vendor_id
                         AND UPPER(ai.invoice_num) = UPPER(h.invoice_num) );

      cascade_header_errors(p_batch_id);
   END validate_expense;

   --======================================================================
   -- 11. insert_intf_headers : valid DH rows -> AP_INVOICES_INTERFACE
   --     (assigns invoice_id from ap_invoices_interface_s)
   --======================================================================
   PROCEDURE insert_intf_headers (p_batch_id IN VARCHAR2, p_source IN VARCHAR2,
                                  p_gl_date IN DATE)
   IS
      TYPE t_hdr IS TABLE OF xxtjx_wd_exp_stg%ROWTYPE INDEX BY PLS_INTEGER;
      l_hdr      t_hdr;
      l_ex_bulk  EXCEPTION;
      PRAGMA EXCEPTION_INIT(l_ex_bulk, -24381);
   BEGIN
      -- assign invoice_id to each valid header (and propagate to its lines)
      FOR r IN ( SELECT stg_id, invoice_num
                   FROM xxtjx_wd_exp_stg
                  WHERE batch_id    = p_batch_id
                    AND record_type = gc_rec_header
                    AND error_flag  = gc_no )
      LOOP
         UPDATE xxtjx_wd_exp_stg
            SET invoice_id = ap_invoices_interface_s.NEXTVAL
          WHERE stg_id = r.stg_id
          RETURNING invoice_id INTO l_hdr(0).invoice_id;  -- scratch use

         UPDATE xxtjx_wd_exp_stg
            SET invoice_id = l_hdr(0).invoice_id
          WHERE batch_id    = p_batch_id
            AND record_type = gc_rec_line
            AND invoice_num = r.invoice_num
            AND error_flag  = gc_no;
      END LOOP;

      SELECT * BULK COLLECT INTO l_hdr
        FROM xxtjx_wd_exp_stg
       WHERE batch_id    = p_batch_id
         AND record_type = gc_rec_header
         AND error_flag  = gc_no;

      log('insert_intf_headers','Headers to insert: '||l_hdr.COUNT, TRUE);

      BEGIN
         FORALL i IN 1 .. l_hdr.COUNT SAVE EXCEPTIONS
            INSERT INTO ap_invoices_interface
               ( invoice_id, invoice_num, invoice_type_lookup_code, invoice_date,
                 vendor_id, vendor_site_id, invoice_amount, invoice_currency_code,
                 description, gl_date, source, group_id, org_id,
                 product_table, reference_key1, status, request_id,
                 created_by, creation_date, last_updated_by, last_update_date,
                 last_update_login )
            VALUES
               ( l_hdr(i).invoice_id,
                 l_hdr(i).invoice_num,
                 gc_inv_type,
                 TO_DATE(l_hdr(i).invoice_date,'MMDDYYYY'),
                 l_hdr(i).vendor_id,
                 l_hdr(i).vendor_site_id,
                 TO_NUMBER(l_hdr(i).invoice_amount),
                 l_hdr(i).currency_code,
                 l_hdr(i).invoice_description,
                 NVL(p_gl_date, TO_DATE(l_hdr(i).invoice_date,'MMDDYYYY')),
                 p_source,
                 g_request_id,
                 l_hdr(i).org_id,
                 gc_product_tab,
                 TO_CHAR(l_hdr(i).stg_id),
                 gc_intf_status,
                 g_request_id,
                 g_user_id, SYSDATE, g_user_id, SYSDATE, g_login_id );
      EXCEPTION
         WHEN l_ex_bulk THEN
            FOR j IN 1 .. SQL%BULK_EXCEPTIONS.COUNT LOOP
               flag_error( l_hdr(SQL%BULK_EXCEPTIONS(j).error_index).stg_id,
                           'Header interface insert failed: '||
                           SQLERRM(-SQL%BULK_EXCEPTIONS(j).error_code) );
            END LOOP;
      END;
   END insert_intf_headers;

   --======================================================================
   -- 12. insert_intf_lines : valid DL rows -> AP_INVOICE_LINES_INTERFACE
   --======================================================================
   PROCEDURE insert_intf_lines (p_batch_id IN VARCHAR2)
   IS
      TYPE t_lin IS TABLE OF xxtjx_wd_exp_stg%ROWTYPE INDEX BY PLS_INTEGER;
      l_lin      t_lin;
      l_ex_bulk  EXCEPTION;
      PRAGMA EXCEPTION_INIT(l_ex_bulk, -24381);
   BEGIN
      SELECT * BULK COLLECT INTO l_lin
        FROM xxtjx_wd_exp_stg
       WHERE batch_id    = p_batch_id
         AND record_type = gc_rec_line
         AND error_flag  = gc_no
         AND invoice_id  IS NOT NULL;

      log('insert_intf_lines','Lines to insert: '||l_lin.COUNT, TRUE);

      BEGIN
         FORALL i IN 1 .. l_lin.COUNT SAVE EXCEPTIONS
            INSERT INTO ap_invoice_lines_interface
               ( invoice_id, invoice_line_id, line_number, line_type_lookup_code,
                 amount, description, dist_code_combination_id,
                 dist_code_concatenated, tax_classification_code, org_id,
                 created_by, creation_date, last_updated_by, last_update_date,
                 last_update_login )
            VALUES
               ( l_lin(i).invoice_id,
                 ap_invoice_lines_interface_s.NEXTVAL,
                 TO_NUMBER(l_lin(i).line_number),
                 gc_line_type,
                 TO_NUMBER(l_lin(i).line_amount),
                 l_lin(i).line_description,
                 l_lin(i).ccid,
                 l_lin(i).dist_account,
                 l_lin(i).tax_classification_code,
                 l_lin(i).org_id,
                 g_user_id, SYSDATE, g_user_id, SYSDATE, g_login_id );
      EXCEPTION
         WHEN l_ex_bulk THEN
            FOR j IN 1 .. SQL%BULK_EXCEPTIONS.COUNT LOOP
               flag_error( l_lin(SQL%BULK_EXCEPTIONS(j).error_index).stg_id,
                           'Line interface insert failed: '||
                           SQLERRM(-SQL%BULK_EXCEPTIONS(j).error_code) );
            END LOOP;
      END;
   END insert_intf_lines;

   --======================================================================
   -- 13. update_stg_status : mark success / error and count
   --======================================================================
   PROCEDURE update_stg_status (p_batch_id IN VARCHAR2)
   IS
   BEGIN
      UPDATE xxtjx_wd_exp_stg
         SET process_status   = gc_st_success,
             last_update_date = SYSDATE,
             last_updated_by  = g_user_id
       WHERE batch_id   = p_batch_id
         AND error_flag = gc_no
         AND invoice_id IS NOT NULL;

      SELECT COUNT(DISTINCT CASE WHEN record_type = gc_rec_header THEN stg_id END),
             COUNT(DISTINCT CASE WHEN record_type = gc_rec_header
                                  AND process_status = gc_st_success THEN stg_id END),
             COUNT(DISTINCT CASE WHEN record_type = gc_rec_header
                                  AND process_status = gc_st_error   THEN stg_id END)
        INTO g_fetched, g_success, g_failed
        FROM xxtjx_wd_exp_stg
       WHERE batch_id = p_batch_id;
   END update_stg_status;

   --======================================================================
   -- MAIN : concurrent program entry point / orchestrator
   --======================================================================
   PROCEDURE main
     ( errbuf          OUT NOCOPY VARCHAR2
     , retcode         OUT NOCOPY NUMBER
     , p_org_id        IN  NUMBER
     , p_source        IN  VARCHAR2
     , p_batch_id      IN  VARCHAR2
     , p_gl_date       IN  VARCHAR2 DEFAULT NULL
     , p_commit_limit  IN  NUMBER   DEFAULT 1000
     , p_validate_only IN  VARCHAR2 DEFAULT 'N'
     , p_debug_flag    IN  VARCHAR2 DEFAULT 'N'
     )
   IS
      l_start    TIMESTAMP := SYSTIMESTAMP;
      l_gl_date  DATE := CASE WHEN p_gl_date IS NOT NULL
                              THEN TO_DATE(p_gl_date,'YYYY/MM/DD') END;
   BEGIN
      g_debug := (NVL(p_debug_flag,'N') = gc_yes);
      retcode := 0;

      fnd_file.put_line(fnd_file.log, '=== XXTJX WD Expense -> AP Import : START ===');
      fnd_file.put_line(fnd_file.log, 'Request ID : '||g_request_id);
      fnd_file.put_line(fnd_file.log, 'Source     : '||p_source||'   Batch: '||p_batch_id);
      fnd_file.put_line(fnd_file.log, 'Org ID     : '||p_org_id);

      IF p_batch_id IS NULL THEN
         errbuf := 'p_batch_id is mandatory (the SQL*Loader batch to process).';
         RAISE e_fatal;
      END IF;

      ------------------------------------------------ validations (set-based)
      validate_mandatory (p_batch_id, p_source);
      derive_person      (p_batch_id);
      validate_assignment(p_batch_id);
      validate_org       (p_batch_id, p_org_id);
      derive_supplier    (p_batch_id);
      validate_expense   (p_batch_id);
      COMMIT;                                  -- persist validation results

      ------------------------------------------------ interface population
      IF NVL(p_validate_only, gc_no) = gc_yes THEN
         fnd_file.put_line(fnd_file.log, 'Validate-only mode: interface insert skipped.');
      ELSE
         insert_intf_headers(p_batch_id, p_source, l_gl_date);
         insert_intf_lines  (p_batch_id);
         update_stg_status  (p_batch_id);
         COMMIT;
      END IF;

      ------------------------------------------------ finalize / report
      fnd_file.put_line(fnd_file.output, 'Workday Expense -> AP Interface Summary');
      fnd_file.put_line(fnd_file.output, '  Invoices fetched : '||g_fetched);
      fnd_file.put_line(fnd_file.output, '  Success          : '||g_success);
      fnd_file.put_line(fnd_file.output, '  Failed           : '||g_failed);
      fnd_file.put_line(fnd_file.log,
         'Elapsed : '||EXTRACT(SECOND FROM (SYSTIMESTAMP - l_start))||' s');

      IF g_failed > 0 THEN
         retcode := 1;                         -- warning
         errbuf  := g_failed||' invoice(s) errored - see staging ERROR_MESSAGE.';
      END IF;

      fnd_file.put_line(fnd_file.log,
         '=== END  retcode='||retcode||' ===');

   EXCEPTION
      WHEN e_fatal THEN
         ROLLBACK;
         retcode := 2;
         errbuf  := NVL(errbuf,'Fatal error - run aborted.');
         fnd_file.put_line(fnd_file.log, 'FATAL: '||errbuf);
      WHEN OTHERS THEN
         ROLLBACK;
         retcode := 2;
         errbuf  := 'Unhandled error: '||SQLERRM;
         fnd_file.put_line(fnd_file.log, 'FATAL: '||DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
         fnd_file.put_line(fnd_file.log, errbuf);
   END main;

END xxtjx_wd_exp_ap_imp_pkg;
/
