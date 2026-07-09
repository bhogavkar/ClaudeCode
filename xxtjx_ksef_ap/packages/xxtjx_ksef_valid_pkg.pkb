CREATE OR REPLACE PACKAGE BODY apps.xxtjx_ksef_valid_pkg
AS
  gc_pkg CONSTANT VARCHAR2(30) := 'XXTJX_KSEF_VALID_PKG';

  -- Per-header error accumulator.
  g_errors  VARCHAR2(4000);
  g_err_code VARCHAR2(30);
  g_failed  BOOLEAN;

  ------------------------------------------------------------------
  PROCEDURE add_error ( p_code IN VARCHAR2, p_msg IN VARCHAR2 )
  IS
  BEGIN
    g_failed := TRUE;
    g_err_code := NVL(g_err_code, p_code);   -- first error code wins as primary
    g_errors := SUBSTR( g_errors
                  || CASE WHEN g_errors IS NOT NULL THEN ' | ' END
                  || '['||p_code||'] '||p_msg, 1, 4000);
  END add_error;

  ------------------------------------------------------------------
  --  Validate one header + all its lines.
  ------------------------------------------------------------------
  PROCEDURE validate_header ( p_hdr_stg_id IN NUMBER, p_result OUT VARCHAR2 )
  IS
    h            xxtjx.xxtjx_ksef_ap_hdr_stg%ROWTYPE;
    l_vendor_id  NUMBER;
    l_site_ok    NUMBER;
    l_org_id     NUMBER;
    l_le_id      NUMBER;
    l_coa_id     NUMBER;
    l_cnt        NUMBER;
    l_line_sum   NUMBER := 0;
    l_dummy      NUMBER;
    l_period_ok  NUMBER;
  BEGIN
    g_errors := NULL; g_err_code := NULL; g_failed := FALSE;

    SELECT * INTO h FROM xxtjx.xxtjx_ksef_ap_hdr_stg WHERE hdr_stg_id = p_hdr_stg_id;
    xxtjx_ksef_log_pkg.set_file_context(h.file_id, NULL, h.invoice_num, h.ksef_number);

    ---------------------------------------------------------------
    -- 1) MANDATORY FIELDS
    ---------------------------------------------------------------
    IF h.invoice_num          IS NULL THEN add_error(xxtjx_ksef_cons_pkg.gc_err_mandatory,'Invoice number is required.'); END IF;
    IF h.invoice_type_lookup_code IS NULL THEN add_error(xxtjx_ksef_cons_pkg.gc_err_mandatory,'Invoice type is required.'); END IF;
    IF h.vendor_site_id       IS NULL THEN add_error(xxtjx_ksef_cons_pkg.gc_err_mandatory,'Vendor site id is required.'); END IF;
    IF h.operating_unit_name  IS NULL THEN add_error(xxtjx_ksef_cons_pkg.gc_err_mandatory,'Operating unit is required.'); END IF;
    IF h.source               IS NULL THEN add_error(xxtjx_ksef_cons_pkg.gc_err_mandatory,'Source is required.'); END IF;
    IF h.invoice_date         IS NULL THEN add_error(xxtjx_ksef_cons_pkg.gc_err_mandatory,'Invoice date is required / not a valid MMDDYYYY date.'); END IF;
    IF h.invoice_amount       IS NULL THEN add_error(xxtjx_ksef_cons_pkg.gc_err_mandatory,'Invoice amount is required.'); END IF;
    IF h.invoice_currency_code IS NULL THEN add_error(xxtjx_ksef_cons_pkg.gc_err_mandatory,'Currency is required.'); END IF;
    IF h.ksef_number          IS NULL THEN add_error(xxtjx_ksef_cons_pkg.gc_err_mandatory,'KSeF number is required.'); END IF;
    IF h.attribute_date1      IS NULL THEN add_error(xxtjx_ksef_cons_pkg.gc_err_mandatory,'Internal recording date is required / invalid.'); END IF;

    ---------------------------------------------------------------
    -- 2) INVOICE TYPE
    ---------------------------------------------------------------
    IF h.invoice_type_lookup_code NOT IN
         (xxtjx_ksef_cons_pkg.gc_inv_standard, xxtjx_ksef_cons_pkg.gc_inv_credit) THEN
      add_error(xxtjx_ksef_cons_pkg.gc_err_inv_type
        ,'Invoice type "'||h.invoice_type_lookup_code||'" is not STANDARD or CREDIT.');
    END IF;

    ---------------------------------------------------------------
    -- 3) CURRENCY (enabled + in-scope PLN)
    ---------------------------------------------------------------
    IF h.invoice_currency_code IS NOT NULL THEN
      BEGIN
        SELECT 1 INTO l_dummy FROM fnd_currencies
         WHERE currency_code = h.invoice_currency_code
           AND enabled_flag = 'Y'
           AND NVL(end_date_active, SYSDATE+1) > SYSDATE;
      EXCEPTION WHEN NO_DATA_FOUND THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_currency
          ,'Currency "'||h.invoice_currency_code||'" is not an enabled EBS currency.');
      END;
      IF h.invoice_currency_code <> xxtjx_ksef_cons_pkg.gc_currency_pln THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_currency
          ,'Currency "'||h.invoice_currency_code||'" is outside contract scope (PLN only).');
      END IF;
    END IF;

    ---------------------------------------------------------------
    -- 4) OPERATING UNIT
    ---------------------------------------------------------------
    BEGIN
      SELECT organization_id INTO l_org_id
        FROM hr_operating_units WHERE name = h.operating_unit_name;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      l_org_id := NULL;
      add_error(xxtjx_ksef_cons_pkg.gc_err_ou
        ,'Operating unit "'||h.operating_unit_name||'" does not exist in EBS.');
    END;
    IF h.operating_unit_name NOT IN
         (xxtjx_ksef_cons_pkg.gc_ou_431, xxtjx_ksef_cons_pkg.gc_ou_432) THEN
      add_error(xxtjx_ksef_cons_pkg.gc_err_ou
        ,'Operating unit "'||h.operating_unit_name||'" is not an authorised KSeF OU.');
    END IF;

    ---------------------------------------------------------------
    -- 5) SUPPLIER + SITE (primary key = vendor_site_id)
    ---------------------------------------------------------------
    IF h.vendor_site_id IS NOT NULL THEN
      BEGIN
        SELECT ass.vendor_id INTO l_vendor_id
          FROM ap_supplier_sites_all ass
         WHERE ass.vendor_site_id = h.vendor_site_id
           AND NVL(ass.inactive_date, SYSDATE+1) > SYSDATE
           AND (l_org_id IS NULL OR ass.org_id = l_org_id);
        -- confirm supplier active
        SELECT COUNT(*) INTO l_dummy
          FROM ap_suppliers s
         WHERE s.vendor_id = l_vendor_id
           AND NVL(s.enabled_flag,'Y') = 'Y'
           AND NVL(s.end_date_active, SYSDATE+1) > SYSDATE;
        IF l_dummy = 0 THEN
          add_error(xxtjx_ksef_cons_pkg.gc_err_supplier
            ,'Supplier for vendor_site_id '||h.vendor_site_id||' is inactive or end-dated.');
        END IF;
        -- confirm site is a pay site
        SELECT COUNT(*) INTO l_site_ok
          FROM ap_supplier_sites_all
         WHERE vendor_site_id = h.vendor_site_id
           AND NVL(pay_site_flag,'N') = 'Y';
        IF l_site_ok = 0 THEN
          add_error(xxtjx_ksef_cons_pkg.gc_err_site
            ,'Vendor site '||h.vendor_site_id||' is not flagged as a Pay Site.');
        END IF;
      EXCEPTION WHEN NO_DATA_FOUND THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_site
          ,'Vendor site id '||h.vendor_site_id||' not found for this operating unit.');
      END;
      -- optional cross-check of supplied vendorId
      IF h.vendor_id IS NOT NULL AND l_vendor_id IS NOT NULL
         AND h.vendor_id <> l_vendor_id THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_supplier
          ,'Payload vendorId '||h.vendor_id||' conflicts with site-derived vendor '||l_vendor_id||'.');
      END IF;
    END IF;

    ---------------------------------------------------------------
    -- 6) LEGAL ENTITY / BUSINESS UNIT consistency
    ---------------------------------------------------------------
    IF l_org_id IS NOT NULL THEN
      BEGIN
        SELECT default_legal_context_id INTO l_le_id
          FROM hr_operating_units WHERE organization_id = l_org_id;
      EXCEPTION WHEN OTHERS THEN l_le_id := NULL; END;
      IF l_le_id IS NULL THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_le
          ,'No default legal entity configured for operating unit "'||h.operating_unit_name||'".');
      END IF;
    END IF;

    ---------------------------------------------------------------
    -- 7) INVOICE SOURCE (must be a registered AP source lookup)
    ---------------------------------------------------------------
    BEGIN
      SELECT 1 INTO l_dummy
        FROM ap_lookup_codes
       WHERE lookup_type = 'SOURCE' AND lookup_code = h.source
         AND NVL(enabled_flag,'Y') = 'Y';
    EXCEPTION WHEN NO_DATA_FOUND THEN
      add_error(xxtjx_ksef_cons_pkg.gc_err_source
        ,'Invoice source "'||h.source||'" is not a registered Payables source.');
    END;

    ---------------------------------------------------------------
    -- 8) DATES  (invoice date not excessively future; GL period open)
    ---------------------------------------------------------------
    IF h.invoice_date IS NOT NULL
       AND h.invoice_date > TRUNC(SYSDATE) + xxtjx_ksef_cons_pkg.gc_future_date_days THEN
      add_error(xxtjx_ksef_cons_pkg.gc_err_inv_date
        ,'Invoice date '||TO_CHAR(h.invoice_date,'YYYY-MM-DD')||' is in the future.');
    END IF;

    IF l_org_id IS NOT NULL THEN
      SELECT COUNT(*) INTO l_period_ok
        FROM gl_period_statuses gps, hr_operating_units hou, gl_ledgers gl
       WHERE hou.organization_id = l_org_id
         AND gl.ledger_id = hou.set_of_books_id
         AND gps.ledger_id = gl.ledger_id
         AND gps.application_id = 200                          -- Payables
         AND NVL(h.gl_date, h.invoice_date)
             BETWEEN gps.start_date AND gps.end_date
         AND gps.closing_status IN ('O','F');                  -- Open / Future
      IF l_period_ok = 0 THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_gl_date
          ,'No open Payables period for accounting date '
           ||TO_CHAR(NVL(h.gl_date,h.invoice_date),'YYYY-MM-DD')||'.');
      END IF;
    END IF;

    ---------------------------------------------------------------
    -- 9) AMOUNT + SIGN CONVENTION
    ---------------------------------------------------------------
    IF h.invoice_amount IS NOT NULL THEN
      IF h.invoice_type_lookup_code = xxtjx_ksef_cons_pkg.gc_inv_credit
         AND h.invoice_amount >= 0 THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_amount
          ,'CREDIT invoice amount must be negative (got '||h.invoice_amount||').');
      ELSIF h.invoice_type_lookup_code = xxtjx_ksef_cons_pkg.gc_inv_standard
         AND h.invoice_amount < 0 THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_amount
          ,'STANDARD invoice amount must not be negative (got '||h.invoice_amount||').');
      END IF;
    END IF;

    ---------------------------------------------------------------
    -- 10) KSeF number format + uniqueness
    ---------------------------------------------------------------
    IF h.ksef_number IS NOT NULL AND LENGTH(h.ksef_number) > 50 THEN
      add_error(xxtjx_ksef_cons_pkg.gc_err_ksef,'KSeF number exceeds 50 characters.');
    END IF;

    ---------------------------------------------------------------
    -- 11) DUPLICATE INVOICE  (idempotency: staging history + live AP)
    ---------------------------------------------------------------
    -- (a) Already imported from a prior staged row?
    SELECT COUNT(*) INTO l_cnt
      FROM xxtjx.xxtjx_ksef_ap_hdr_stg
     WHERE ksef_number = h.ksef_number
       AND hdr_stg_id <> h.hdr_stg_id
       AND interface_status = xxtjx_ksef_cons_pkg.gc_if_imported;
    IF l_cnt > 0 THEN
      add_error(xxtjx_ksef_cons_pkg.gc_err_dup_invoice
        ,'KSeF number '||h.ksef_number||' was already imported (replay detected).');
    END IF;
    -- (b) Live AP invoice with same vendor + invoice number?
    IF l_vendor_id IS NOT NULL THEN
      SELECT COUNT(*) INTO l_cnt
        FROM ap_invoices_all
       WHERE vendor_id = l_vendor_id
         AND invoice_num = h.invoice_num
         AND NVL(org_id,-1) = NVL(l_org_id,-1);
      IF l_cnt > 0 THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_dup_invoice
          ,'Invoice '||h.invoice_num||' already exists in Payables for this supplier.');
      END IF;
    END IF;

    ---------------------------------------------------------------
    -- 12) PO VALIDATION (header level, when PO supplied)
    ---------------------------------------------------------------
    IF h.po_number IS NOT NULL AND l_org_id IS NOT NULL THEN
      SELECT COUNT(*) INTO l_cnt
        FROM po_headers_all
       WHERE segment1 = h.po_number
         AND org_id = l_org_id
         AND NVL(authorization_status,'INCOMPLETE') = 'APPROVED'
         AND NVL(cancel_flag,'N') = 'N'
         AND NVL(closed_code,'OPEN') NOT IN ('FINALLY CLOSED');
      IF l_cnt = 0 THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_po
          ,'PO '||h.po_number||' is not an approved/open PO in this operating unit.');
      END IF;
    END IF;

    ---------------------------------------------------------------
    -- COA id for distribution validation
    ---------------------------------------------------------------
    IF l_org_id IS NOT NULL THEN
      BEGIN
        SELECT gl.chart_of_accounts_id INTO l_coa_id
          FROM hr_operating_units hou, gl_ledgers gl
         WHERE hou.organization_id = l_org_id
           AND gl.ledger_id = hou.set_of_books_id;
      EXCEPTION WHEN OTHERS THEN l_coa_id := NULL; END;
    END IF;

    ---------------------------------------------------------------
    -- 13) LINE-LEVEL VALIDATIONS + header/line balance
    ---------------------------------------------------------------
    FOR ln IN ( SELECT * FROM xxtjx.xxtjx_ksef_ap_line_stg
                 WHERE hdr_stg_id = p_hdr_stg_id ORDER BY line_number )
    LOOP
      -- mandatory
      IF ln.line_type_lookup_code IS NULL THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_mandatory,'Line '||ln.line_number||': line type required.');
      ELSIF ln.line_type_lookup_code NOT IN
              (xxtjx_ksef_cons_pkg.gc_line_item, xxtjx_ksef_cons_pkg.gc_line_freight
              ,xxtjx_ksef_cons_pkg.gc_line_tax) THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_inv_type
          ,'Line '||ln.line_number||': invalid line type "'||ln.line_type_lookup_code||'".');
      END IF;

      IF ln.amount IS NULL THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_line_amount,'Line '||ln.line_number||': amount required.');
      ELSE
        l_line_sum := l_line_sum + ln.amount;
        -- sign convention consistency
        IF h.invoice_type_lookup_code = xxtjx_ksef_cons_pkg.gc_inv_credit AND ln.amount > 0 THEN
          add_error(xxtjx_ksef_cons_pkg.gc_err_line_amount
            ,'Line '||ln.line_number||': CREDIT line amount must be <= 0.');
        ELSIF h.invoice_type_lookup_code = xxtjx_ksef_cons_pkg.gc_inv_standard AND ln.amount < 0 THEN
          add_error(xxtjx_ksef_cons_pkg.gc_err_line_amount
            ,'Line '||ln.line_number||': STANDARD line amount must be >= 0.');
        END IF;
      END IF;

      -- distribution account (non-PO lines only; PO lines derive their account)
      IF ln.po_number IS NULL THEN
        IF ln.dist_code_concatenated IS NULL THEN
          add_error(xxtjx_ksef_cons_pkg.gc_err_dist_acct
            ,'Line '||ln.line_number||': distribution account required for non-PO line.');
        ELSIF l_coa_id IS NOT NULL THEN
          l_dummy := xxtjx_ksef_util_pkg.get_ccid(ln.dist_code_concatenated, l_coa_id
                       , NVL(ln.accounting_date, h.gl_date));
          IF l_dummy = 0 THEN
            add_error(xxtjx_ksef_cons_pkg.gc_err_dist_acct
              ,'Line '||ln.line_number||': account "'||ln.dist_code_concatenated
               ||'" is invalid / disabled / summary.');
          ELSE
            UPDATE xxtjx.xxtjx_ksef_ap_line_stg
               SET dist_code_combination_id = l_dummy
             WHERE line_stg_id = ln.line_stg_id;
          END IF;
        END IF;
      ELSE
        -- PO line validation
        IF l_org_id IS NOT NULL THEN
          SELECT COUNT(*) INTO l_cnt
            FROM po_headers_all ph, po_lines_all pl
           WHERE ph.po_header_id = pl.po_header_id
             AND ph.segment1 = ln.po_number
             AND ph.org_id = l_org_id
             AND (ln.po_line_number IS NULL OR pl.line_num = ln.po_line_number)
             AND NVL(ph.authorization_status,'INCOMPLETE') = 'APPROVED';
          IF l_cnt = 0 THEN
            add_error(xxtjx_ksef_cons_pkg.gc_err_po
              ,'Line '||ln.line_number||': PO '||ln.po_number
               ||'/line '||ln.po_line_number||' not found/approved.');
          END IF;
        END IF;
      END IF;

      -- tax classification (if supplied, must be a valid ZX classification)
      IF ln.tax_classification_code IS NOT NULL THEN
        SELECT COUNT(*) INTO l_cnt
          FROM fnd_lookup_values
         WHERE lookup_type = 'ZX_INPUT_CLASSIFICATIONS'
           AND lookup_code = ln.tax_classification_code
           AND language = USERENV('LANG')
           AND NVL(enabled_flag,'Y') = 'Y';
        IF l_cnt = 0 THEN
          add_error(xxtjx_ksef_cons_pkg.gc_err_tax
            ,'Line '||ln.line_number||': tax classification "'
             ||ln.tax_classification_code||'" is not valid.');
        END IF;
      END IF;

      -- line/header vendor site consistency
      IF ln.vendor_site_id IS NOT NULL AND h.vendor_site_id IS NOT NULL
         AND ln.vendor_site_id <> h.vendor_site_id THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_site
          ,'Line '||ln.line_number||': vendor site differs from header.');
      END IF;
    END LOOP;

    -- 14) HEADER vs LINE balance
    IF h.invoice_amount IS NOT NULL
       AND ABS(NVL(l_line_sum,0) - h.invoice_amount) > xxtjx_ksef_cons_pkg.gc_amount_tolerance THEN
      add_error(xxtjx_ksef_cons_pkg.gc_err_balance
        ,'Sum of lines ('||l_line_sum||') <> invoice amount ('||h.invoice_amount||').');
    END IF;

    ---------------------------------------------------------------
    -- 15) ATTACHMENT PRE-VALIDATION (presence / mime / base64 / signature)
    --     Heavy decode+store happens post-import; here we gate cheaply.
    ---------------------------------------------------------------
    DECLARE
      l_raw   CLOB;
      l_b64   CLOB;
      l_mime  VARCHAR2(240);
      l_fname VARCHAR2(255);
      l_prefix_blob BLOB;
    BEGIN
      SELECT file_content INTO l_raw
        FROM xxtjx.xxtjx_ksef_files WHERE file_id = h.file_id;

      SELECT COUNT(*) INTO l_cnt
        FROM JSON_TABLE(l_raw,'$.files[*]' COLUMNS(fn VARCHAR2(255) PATH '$.fileName'));
      IF l_cnt = 0 THEN
        add_error(xxtjx_ksef_cons_pkg.gc_err_att_missing,'No attachment present in payload.');
      ELSE
        -- scalar metadata via JSON_VALUE (avoids FORMAT JSON on string scalars)
        l_mime  := JSON_VALUE(l_raw,'$.files[0].mimeType');
        l_fname := JSON_VALUE(l_raw,'$.files[0].fileName');
        l_b64   := JSON_VALUE(l_raw,'$.files[0].fileContent' RETURNING CLOB);

        IF l_mime <> xxtjx_ksef_cons_pkg.gc_att_mime_pdf THEN
          add_error(xxtjx_ksef_cons_pkg.gc_err_att_mime
            ,'Attachment MIME "'||l_mime||'" is not application/pdf.');
        END IF;
        IF LOWER(REGEXP_SUBSTR(l_fname,'[^.]+$')) <> xxtjx_ksef_cons_pkg.gc_att_extension THEN
          add_error(xxtjx_ksef_cons_pkg.gc_err_att_mime
            ,'Attachment "'||l_fname||'" does not have a .pdf extension.');
        END IF;
        IF l_b64 IS NULL OR DBMS_LOB.getlength(l_b64) = 0 THEN
          add_error(xxtjx_ksef_cons_pkg.gc_err_base64,'Attachment content (base64) is empty.');
        ELSIF NOT xxtjx_ksef_util_pkg.is_base64(DBMS_LOB.substr(l_b64,200,1)) THEN
          add_error(xxtjx_ksef_cons_pkg.gc_err_base64,'Attachment content is not valid base64.');
        ELSE
          -- decode and check PDF signature + size ceiling
          BEGIN
            l_prefix_blob := xxtjx_ksef_util_pkg.base64_to_blob(l_b64);
            IF NOT xxtjx_ksef_util_pkg.is_pdf_signature(l_prefix_blob) THEN
              add_error(xxtjx_ksef_cons_pkg.gc_err_pdf_sig
                ,'Decoded attachment is not a valid PDF (missing %PDF/%%EOF).');
            END IF;
            IF DBMS_LOB.getlength(l_prefix_blob) > xxtjx_ksef_cons_pkg.gc_att_max_bytes THEN
              add_error(xxtjx_ksef_cons_pkg.gc_err_pdf_size
                ,'Attachment exceeds max size ('||xxtjx_ksef_cons_pkg.gc_att_max_bytes||' bytes).');
            ELSIF DBMS_LOB.getlength(l_prefix_blob) < xxtjx_ksef_cons_pkg.gc_att_min_bytes THEN
              add_error(xxtjx_ksef_cons_pkg.gc_err_pdf_size,'Attachment is suspiciously small.');
            END IF;
          EXCEPTION WHEN OTHERS THEN
            add_error(xxtjx_ksef_cons_pkg.gc_err_base64,'Attachment base64 failed to decode.');
          END;
        END IF;
      END IF;
    END;

    ---------------------------------------------------------------
    -- FINALISE
    ---------------------------------------------------------------
    IF g_failed THEN
      UPDATE xxtjx.xxtjx_ksef_ap_hdr_stg
         SET validation_status = xxtjx_ksef_cons_pkg.gc_val_fail
           , process_status    = xxtjx_ksef_cons_pkg.gc_st_error
           , error_code        = g_err_code
           , error_message     = g_errors
           , org_id            = NVL(l_org_id, org_id)
           , vendor_id         = NVL(l_vendor_id, vendor_id)
           , legal_entity_id   = NVL(l_le_id, legal_entity_id)
           , last_update_date  = SYSDATE
       WHERE hdr_stg_id = p_hdr_stg_id;
      p_result := xxtjx_ksef_cons_pkg.gc_val_fail;
      xxtjx_ksef_log_pkg.log_warn('validate_header'
        ,'FAIL hdr_stg_id='||p_hdr_stg_id||' : '||g_errors);
    ELSE
      UPDATE xxtjx.xxtjx_ksef_ap_hdr_stg
         SET validation_status = xxtjx_ksef_cons_pkg.gc_val_pass
           , process_status    = xxtjx_ksef_cons_pkg.gc_st_validated
           , error_code        = NULL
           , error_message     = NULL
           , org_id            = l_org_id
           , vendor_id         = l_vendor_id
           , legal_entity_id   = l_le_id
           , last_update_date  = SYSDATE
       WHERE hdr_stg_id = p_hdr_stg_id;
      UPDATE xxtjx.xxtjx_ksef_ap_line_stg
         SET validation_status = xxtjx_ksef_cons_pkg.gc_val_pass
           , org_id = l_org_id
       WHERE hdr_stg_id = p_hdr_stg_id;
      p_result := xxtjx_ksef_cons_pkg.gc_val_pass;
      xxtjx_ksef_log_pkg.log_info('validate_header','PASS hdr_stg_id='||p_hdr_stg_id);
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      xxtjx_ksef_log_pkg.log_error('validate_header','Unexpected hdr_stg_id='||p_hdr_stg_id);
      UPDATE xxtjx.xxtjx_ksef_ap_hdr_stg
         SET validation_status = xxtjx_ksef_cons_pkg.gc_val_fail
           , process_status = xxtjx_ksef_cons_pkg.gc_st_error
           , error_code = xxtjx_ksef_cons_pkg.gc_err_unexpected
           , error_message = SUBSTR('Validation exception: '||SQLERRM,1,4000)
       WHERE hdr_stg_id = p_hdr_stg_id;
      p_result := xxtjx_ksef_cons_pkg.gc_val_fail;
  END validate_header;

  ------------------------------------------------------------------
  PROCEDURE validate_pending ( p_passed OUT NUMBER, p_failed OUT NUMBER )
  IS
    l_res VARCHAR2(30);
    l_t0  NUMBER := DBMS_UTILITY.get_time;
  BEGIN
    p_passed := 0; p_failed := 0;
    xxtjx_ksef_log_pkg.init_context(fnd_global.conc_request_id, gc_pkg);

    FOR h IN ( SELECT hdr_stg_id
                 FROM xxtjx.xxtjx_ksef_ap_hdr_stg
                WHERE process_status = xxtjx_ksef_cons_pkg.gc_st_parsed
                  AND validation_status = xxtjx_ksef_cons_pkg.gc_val_pending
                ORDER BY hdr_stg_id )
    LOOP
      validate_header(h.hdr_stg_id, l_res);
      COMMIT;   -- checkpoint per invoice
      IF l_res = xxtjx_ksef_cons_pkg.gc_val_pass
        THEN p_passed := p_passed + 1;
        ELSE p_failed := p_failed + 1;
      END IF;
    END LOOP;

    xxtjx_ksef_log_pkg.log_metric('validate_pending','Validation complete'
      , DBMS_UTILITY.get_time - l_t0);
    xxtjx_ksef_log_pkg.log_info('validate_pending'
      ,'Passed='||p_passed||' Failed='||p_failed);
  END validate_pending;

END xxtjx_ksef_valid_pkg;
/
