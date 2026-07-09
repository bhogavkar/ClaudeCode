CREATE OR REPLACE PACKAGE BODY apps.xxtjx_ksef_import_pkg
AS
  gc_pkg CONSTANT VARCHAR2(30) := 'XXTJX_KSEF_IMPORT_PKG';

  ------------------------------------------------------------------
  --  Populate AP interface tables for one operating unit / group.
  ------------------------------------------------------------------
  PROCEDURE build_interface ( p_group_id IN VARCHAR2, p_org_id IN NUMBER )
  IS
  BEGIN
    -- HEADERS ------------------------------------------------------
    INSERT INTO ap.ap_invoices_interface
      ( invoice_id, invoice_num, invoice_type_lookup_code, invoice_date
      , vendor_id, vendor_site_id, invoice_amount, invoice_currency_code
      , exchange_rate, exchange_rate_type, exchange_date
      , description, source, group_id, org_id, gl_date
      , payment_method_code, terms_name, terms_date
      , attribute_category, attribute1, attribute2
      , calc_tax_during_import_flag, workflow_flag
      , created_by, creation_date, last_updated_by, last_update_date )
    SELECT ap.ap_invoices_interface_s.NEXTVAL, h.invoice_num
         , h.invoice_type_lookup_code, h.invoice_date
         , h.vendor_id, h.vendor_site_id, h.invoice_amount, h.invoice_currency_code
         , h.exchange_rate, h.exchange_rate_type, h.exchange_date
         , h.description, h.source, p_group_id, h.org_id, h.gl_date
         , h.payment_method_code, h.terms_name, h.terms_date
         , 'KSEF', h.attribute1, h.attribute2
         , NVL(h.calc_tax_during_import_flag,'N'), 'N'
         , fnd_global.user_id, SYSDATE, fnd_global.user_id, SYSDATE
      FROM xxtjx.xxtjx_ksef_ap_hdr_stg h
     WHERE h.group_id = p_group_id
       AND h.org_id = p_org_id
       AND h.validation_status = xxtjx_ksef_cons_pkg.gc_val_pass
       AND h.interface_status = xxtjx_ksef_cons_pkg.gc_if_pending;

    -- Stamp the generated AII.invoice_id back onto staging (join by business key).
    UPDATE xxtjx.xxtjx_ksef_ap_hdr_stg h
       SET h.invoice_id =
             ( SELECT aii.invoice_id FROM ap.ap_invoices_interface aii
                WHERE aii.group_id = h.group_id
                  AND aii.invoice_num = h.invoice_num
                  AND aii.vendor_site_id = h.vendor_site_id )
         , h.interface_status = xxtjx_ksef_cons_pkg.gc_if_loaded
     WHERE h.group_id = p_group_id
       AND h.org_id = p_org_id
       AND h.validation_status = xxtjx_ksef_cons_pkg.gc_val_pass
       AND h.interface_status = xxtjx_ksef_cons_pkg.gc_if_pending;

    -- LINES --------------------------------------------------------
    INSERT INTO ap.ap_invoice_lines_interface
      ( invoice_id, invoice_line_id, line_number, line_type_lookup_code
      , amount, description, accounting_date, dist_code_concatenated
      , dist_code_combination_id, org_id, prorate_across_flag
      , tax_classification_code, po_number, po_line_number
      , po_shipment_num, po_distribution_num, line_group_number
      , created_by, creation_date, last_updated_by, last_update_date )
    SELECT h.invoice_id, ap.ap_invoice_lines_interface_s.NEXTVAL
         , l.line_number, l.line_type_lookup_code
         , l.amount, l.description, NVL(l.accounting_date, h.gl_date)
         , l.dist_code_concatenated, l.dist_code_combination_id, h.org_id
         , l.prorate_across_flag, l.tax_classification_code
         , l.po_number, l.po_line_number, l.po_shipment_num, l.po_distribution_num
         , l.line_group_number
         , fnd_global.user_id, SYSDATE, fnd_global.user_id, SYSDATE
      FROM xxtjx.xxtjx_ksef_ap_hdr_stg h, xxtjx.xxtjx_ksef_ap_line_stg l
     WHERE l.hdr_stg_id = h.hdr_stg_id
       AND h.group_id = p_group_id
       AND h.org_id = p_org_id
       AND h.validation_status = xxtjx_ksef_cons_pkg.gc_val_pass
       AND h.interface_status = xxtjx_ksef_cons_pkg.gc_if_loaded;

    xxtjx_ksef_log_pkg.log_info('build_interface'
      ,'Interface built group='||p_group_id||' org='||p_org_id
       ||' headers='||SQL%ROWCOUNT);
  END build_interface;

  ------------------------------------------------------------------
  --  Submit APXIIMPT for one org/group and wait.
  ------------------------------------------------------------------
  FUNCTION submit_import ( p_group_id IN VARCHAR2, p_org_id IN NUMBER )
    RETURN NUMBER
  IS
    l_req    NUMBER;
    l_phase  VARCHAR2(80); l_status VARCHAR2(80);
    l_dphase VARCHAR2(80); l_dstat  VARCHAR2(80); l_msg VARCHAR2(240);
    l_done   BOOLEAN;
  BEGIN
    -- Run in the correct OU context.
    mo_global.set_policy_context('S', p_org_id);
    fnd_request.set_org_id(p_org_id);

    l_req := fnd_request.submit_request
      ( application => 'SQLAP'
      , program     => 'APXIIMPT'
      , description => 'KSeF AP Open Interface Import'
      , start_time  => NULL
      , sub_request => FALSE
      , argument1   => xxtjx_ksef_cons_pkg.gc_ap_source   -- Source
      , argument2   => NULL                               -- Credit card code
      , argument3   => p_group_id                         -- Group
      , argument4   => NULL                               -- Batch name
      , argument5   => NULL                               -- Hold name
      , argument6   => NULL                               -- Hold reason
      , argument7   => NULL                               -- GL date
      , argument8   => 'N'                                -- Purge
      , argument9   => 'N'                                -- Trace switch
      , argument10  => 'N'                                -- Debug switch
      , argument11  => 'N'                                -- Summarize report
      , argument12  => '1000'                             -- Commit batch size
      , argument13  => fnd_global.user_id                 -- User id
      , argument14  => fnd_global.login_id                -- Login id
      );
    COMMIT;  -- release the request to the concurrent manager

    IF l_req = 0 THEN
      xxtjx_ksef_log_pkg.log_error('submit_import'
        ,'fnd_request.submit_request returned 0: '||fnd_message.get);
      RETURN 0;
    END IF;

    xxtjx_ksef_log_pkg.log_info('submit_import'
      ,'Submitted APXIIMPT request_id='||l_req||' group='||p_group_id);

    l_done := fnd_concurrent.wait_for_request
                ( request_id => l_req, interval => 15, max_wait => 0
                , phase => l_phase, status => l_status
                , dev_phase => l_dphase, dev_status => l_dstat, message => l_msg );

    xxtjx_ksef_log_pkg.log_info('submit_import'
      ,'APXIIMPT '||l_req||' finished phase='||l_dphase||' status='||l_dstat);
    RETURN l_req;
  END submit_import;

  ------------------------------------------------------------------
  --  Reconcile: created invoices + rejections back into staging.
  ------------------------------------------------------------------
  PROCEDURE reconcile ( p_group_id IN VARCHAR2, p_imported OUT NUMBER, p_rejected OUT NUMBER )
  IS
  BEGIN
    -- Successful invoices (interface row consumed => AP_INVOICES_ALL row exists).
    UPDATE xxtjx.xxtjx_ksef_ap_hdr_stg h
       SET h.ap_invoice_id =
             ( SELECT ai.invoice_id FROM ap.ap_invoices_all ai
                WHERE ai.invoice_num = h.invoice_num
                  AND ai.vendor_id = h.vendor_id
                  AND NVL(ai.org_id,-1) = NVL(h.org_id,-1)
                  AND ROWNUM = 1 )
     WHERE h.group_id = p_group_id
       AND h.interface_status = xxtjx_ksef_cons_pkg.gc_if_loaded;

    UPDATE xxtjx.xxtjx_ksef_ap_hdr_stg h
       SET h.interface_status = xxtjx_ksef_cons_pkg.gc_if_imported
         , h.process_status   = xxtjx_ksef_cons_pkg.gc_st_imported
         , h.last_update_date = SYSDATE
     WHERE h.group_id = p_group_id
       AND h.interface_status = xxtjx_ksef_cons_pkg.gc_if_loaded
       AND h.ap_invoice_id IS NOT NULL;

    -- Rejected invoices: pull consolidated reason from AP_INTERFACE_REJECTIONS.
    UPDATE xxtjx.xxtjx_ksef_ap_hdr_stg h
       SET h.interface_status = xxtjx_ksef_cons_pkg.gc_if_rejected
         , h.process_status   = xxtjx_ksef_cons_pkg.gc_st_error
         , h.error_code       = xxtjx_ksef_cons_pkg.gc_err_ap_interface
         , h.error_message    =
             SUBSTR( ( SELECT LISTAGG(air.reject_lookup_code,'; ')
                              WITHIN GROUP (ORDER BY air.reject_lookup_code)
                         FROM ap.ap_interface_rejections air
                        WHERE air.parent_table = 'AP_INVOICES_INTERFACE'
                          AND air.parent_id = h.invoice_id ), 1, 4000)
         , h.last_update_date = SYSDATE
     WHERE h.group_id = p_group_id
       AND h.interface_status = xxtjx_ksef_cons_pkg.gc_if_loaded
       AND h.ap_invoice_id IS NULL;

    SELECT COUNT(*) INTO p_imported FROM xxtjx.xxtjx_ksef_ap_hdr_stg
     WHERE group_id = p_group_id AND interface_status = xxtjx_ksef_cons_pkg.gc_if_imported;
    SELECT COUNT(*) INTO p_rejected FROM xxtjx.xxtjx_ksef_ap_hdr_stg
     WHERE group_id = p_group_id AND interface_status = xxtjx_ksef_cons_pkg.gc_if_rejected;

    xxtjx_ksef_log_pkg.log_info('reconcile'
      ,'group='||p_group_id||' imported='||p_imported||' rejected='||p_rejected);
  END reconcile;

  ------------------------------------------------------------------
  PROCEDURE import_validated ( p_imported  OUT NUMBER
                             , p_rejected  OUT NUMBER
                             , p_group_id  OUT VARCHAR2
                             , p_child_req OUT NUMBER )
  IS
    l_group   VARCHAR2(80);
    l_req     NUMBER;
    l_imp     NUMBER; l_rej NUMBER;
    l_t0      NUMBER := DBMS_UTILITY.get_time;
  BEGIN
    p_imported := 0; p_rejected := 0; p_child_req := 0;
    xxtjx_ksef_log_pkg.init_context(fnd_global.conc_request_id, gc_pkg);

    -- One group_id per run (KSEF + timestamp). Assign to unstamped PASS rows.
    l_group := 'KSEF-'||xxtjx.xxtjx_ksef_batch_s.NEXTVAL;
    p_group_id := l_group;

    UPDATE xxtjx.xxtjx_ksef_ap_hdr_stg
       SET group_id = l_group
     WHERE validation_status = xxtjx_ksef_cons_pkg.gc_val_pass
       AND interface_status  = xxtjx_ksef_cons_pkg.gc_if_pending
       AND group_id IS NULL;
    COMMIT;

    -- Process per operating unit (import runs in one OU context at a time).
    FOR ou IN ( SELECT DISTINCT org_id FROM xxtjx.xxtjx_ksef_ap_hdr_stg
                 WHERE group_id = l_group AND org_id IS NOT NULL )
    LOOP
      build_interface(l_group, ou.org_id);
      COMMIT;

      l_req := submit_import(l_group, ou.org_id);
      p_child_req := l_req;

      reconcile(l_group, l_imp, l_rej);
      COMMIT;
      p_imported := p_imported + l_imp;
      p_rejected := p_rejected + l_rej;
    END LOOP;

    xxtjx_ksef_log_pkg.log_metric('import_validated','Import complete'
      , DBMS_UTILITY.get_time - l_t0);
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      xxtjx_ksef_log_pkg.log_error('import_validated','Import failed');
      RAISE;
  END import_validated;

END xxtjx_ksef_import_pkg;
/
