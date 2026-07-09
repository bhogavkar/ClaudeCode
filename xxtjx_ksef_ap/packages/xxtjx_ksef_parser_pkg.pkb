CREATE OR REPLACE PACKAGE BODY apps.xxtjx_ksef_parser_pkg
AS
  gc_pkg CONSTANT VARCHAR2(30) := 'XXTJX_KSEF_PARSER_PKG';

  -- Line collection type for bulk insert.
  TYPE t_line_rec IS RECORD
    ( line_number       NUMBER
    , line_type         VARCHAR2(25)
    , amount            NUMBER
    , line_description  VARCHAR2(240)
    , vendor_site_id    NUMBER
    , accounting_date_s VARCHAR2(20)
    , set_of_books_id   NUMBER
    , dist_account      VARCHAR2(250)
    , line_group_number NUMBER
    , prorate_flag      VARCHAR2(1)
    , tax_class_code    VARCHAR2(30)
    , tax_code          VARCHAR2(30)
    , tax_regime        VARCHAR2(30)
    , tax               VARCHAR2(30)
    , tax_status        VARCHAR2(30)
    , po_number         VARCHAR2(20)
    , po_line_number    NUMBER
    , po_shipment_num   NUMBER
    , po_dist_num       NUMBER );
  TYPE t_line_tab IS TABLE OF t_line_rec;

  ------------------------------------------------------------------
  PROCEDURE parse_file ( p_file_id IN NUMBER, p_status OUT VARCHAR2 )
  IS
    l_clob        CLOB;
    l_hdr_stg_id  NUMBER;
    l_lines       t_line_tab;
    l_line_cnt    NUMBER;
    l_trailer_cnt NUMBER;
    l_org_id      NUMBER;
    l_coa_id      NUMBER;

    -- Header scalar holders
    l_doctype     VARCHAR2(30);
    l_batch       VARCHAR2(17);
    l_invnum      VARCHAR2(50);
    l_invtype     VARCHAR2(25);
    l_vsite_id    NUMBER;
    l_vnum        VARCHAR2(30);
    l_vname       VARCHAR2(240);
    l_vid         NUMBER;
    l_vsitecode   VARCHAR2(30);
    l_ou_name     VARCHAR2(240);
    l_le          VARCHAR2(10);
    l_source      VARCHAR2(80);
    l_invdate_s   VARCHAR2(20);
    l_gldate_s    VARCHAR2(20);
    l_invamt      NUMBER;
    l_taxamt      NUMBER;
    l_curr        VARCHAR2(15);
    l_xrate       NUMBER;
    l_xrate_type  VARCHAR2(30);
    l_xrate_dt_s  VARCHAR2(20);
    l_desc        VARCHAR2(240);
    l_terms       VARCHAR2(50);
    l_terms_dt_s  VARCHAR2(20);
    l_po          VARCHAR2(20);
    l_legacy_po   VARCHAR2(150);
    l_liab_acct   VARCHAR2(32);
    l_pay_method  VARCHAR2(25);
    l_calc_tax    VARCHAR2(1);
    l_ksef        VARCHAR2(50);
    l_intrec_s    VARCHAR2(20);
  BEGIN
    UPDATE xxtjx.xxtjx_ksef_files
       SET process_status = xxtjx_ksef_cons_pkg.gc_st_parsing
         , process_date = SYSDATE, last_update_date = SYSDATE
     WHERE file_id = p_file_id
    RETURNING file_content INTO l_clob;

    -- ---------- HEADER (single row) ----------
    SELECT documenttype, batchid, invoicenumber, invoicetype, vendorsiteid
         , vendornumber, vendorname, vendorid, vendorsitecode, ouname
         , legalentity, src, invdate, gldate, invamt, taxamt, curr
         , xrate, xratetype, xratedate, descr, terms, termsdate, po
         , legacypo, liabacct, paymethod, calctax, ksef, intrecdate
      INTO l_doctype, l_batch, l_invnum, l_invtype, l_vsite_id
         , l_vnum, l_vname, l_vid, l_vsitecode, l_ou_name
         , l_le, l_source, l_invdate_s, l_gldate_s, l_invamt, l_taxamt, l_curr
         , l_xrate, l_xrate_type, l_xrate_dt_s, l_desc, l_terms, l_terms_dt_s, l_po
         , l_legacy_po, l_liab_acct, l_pay_method, l_calc_tax, l_ksef, l_intrec_s
      FROM JSON_TABLE( l_clob, '$'
             COLUMNS ( documenttype  VARCHAR2(30)  PATH '$.documentType'
                     , batchid       VARCHAR2(17)  PATH '$.batchId'
                     , invoicenumber VARCHAR2(50)  PATH '$.header.invoiceNumber'
                     , invoicetype   VARCHAR2(25)  PATH '$.header.invoiceType'
                     , vendorsiteid  NUMBER        PATH '$.header.vendorSiteId'
                     , vendornumber  VARCHAR2(30)  PATH '$.header.vendorNumber'
                     , vendorname    VARCHAR2(240) PATH '$.header.vendorName'
                     , vendorid      NUMBER        PATH '$.header.vendorId'
                     , vendorsitecode VARCHAR2(30) PATH '$.header.vendorSiteCode'
                     , ouname        VARCHAR2(240) PATH '$.header.operatingUnitName'
                     , legalentity   VARCHAR2(10)  PATH '$.header.legalEntity'
                     , src           VARCHAR2(80)  PATH '$.header.source'
                     , invdate       VARCHAR2(20)  PATH '$.header.invoiceDate'
                     , gldate        VARCHAR2(20)  PATH '$.header.glDate'
                     , invamt        NUMBER        PATH '$.header.invoiceAmount'
                     , taxamt        NUMBER        PATH '$.header.totalTaxAmount'
                     , curr          VARCHAR2(15)  PATH '$.header.currency'
                     , xrate         NUMBER        PATH '$.header.exchangeRate'
                     , xratetype     VARCHAR2(30)  PATH '$.header.exchangeRateType'
                     , xratedate     VARCHAR2(20)  PATH '$.header.exchangeRateDate'
                     , descr         VARCHAR2(240) PATH '$.header.invoiceDescription'
                     , terms         VARCHAR2(50)  PATH '$.header.invoiceTerms'
                     , termsdate     VARCHAR2(20)  PATH '$.header.termsDate'
                     , po            VARCHAR2(20)  PATH '$.header.poNumber'
                     , legacypo      VARCHAR2(150) PATH '$.header.legacyPoNumber'
                     , liabacct      VARCHAR2(32)  PATH '$.header.liabilityAccount'
                     , paymethod     VARCHAR2(25)  PATH '$.header.paymentMethod'
                     , calctax       VARCHAR2(1)   PATH '$.header.calculateTaxDuringImport'
                     , ksef          VARCHAR2(50)  PATH '$.header.ksefNumber'
                     , intrecdate    VARCHAR2(20)  PATH '$.header.internalRecordingDate'
                     ) );

    -- Resolve OU (best-effort here; validation is authoritative).
    BEGIN
      SELECT organization_id INTO l_org_id
        FROM hr_operating_units WHERE name = l_ou_name AND ROWNUM = 1;
    EXCEPTION WHEN NO_DATA_FOUND THEN l_org_id := NULL; END;

    -- ---------- LINES (array -> bulk) ----------
    SELECT t_line_rec( jt.line_number, jt.line_type, jt.amount, jt.line_desc
                     , jt.vendor_site_id, jt.acct_date, jt.set_of_books_id
                     , jt.dist_account, jt.line_group_number, jt.prorate_flag
                     , jt.tax_class_code, jt.tax_code, jt.tax_regime, jt.tax
                     , jt.tax_status, jt.po_number, jt.po_line_number
                     , jt.po_shipment_num, jt.po_dist_num )
      BULK COLLECT INTO l_lines
      FROM JSON_TABLE( l_clob, '$.lines[*]'
             COLUMNS ( line_number       NUMBER        PATH '$.lineNumber'
                     , line_type         VARCHAR2(25)  PATH '$.lineType'
                     , amount            NUMBER        PATH '$.amount'
                     , line_desc         VARCHAR2(240) PATH '$.lineDescription'
                     , vendor_site_id    NUMBER        PATH '$.vendorSiteId'
                     , acct_date         VARCHAR2(20)  PATH '$.accountingDate'
                     , set_of_books_id   NUMBER        PATH '$.setOfBookId'
                     , dist_account      VARCHAR2(250) PATH '$.distributionAccount'
                     , line_group_number NUMBER        PATH '$.lineGroupNumber'
                     , prorate_flag      VARCHAR2(1)   PATH '$.prorateAcrossFlag'
                     , tax_class_code    VARCHAR2(30)  PATH '$.taxClassificationCode'
                     , tax_code          VARCHAR2(30)  PATH '$.taxCode'
                     , tax_regime        VARCHAR2(30)  PATH '$.taxRegime'
                     , tax               VARCHAR2(30)  PATH '$.tax'
                     , tax_status        VARCHAR2(30)  PATH '$.taxStatusCode'
                     , po_number         VARCHAR2(20)  PATH '$.poNumber'
                     , po_line_number    NUMBER        PATH '$.poLineNumber'
                     , po_shipment_num   NUMBER        PATH '$.poShipmentNumber'
                     , po_dist_num       NUMBER        PATH '$.poDistributionNumber'
                     ) ) jt;

    -- ---------- Trailer control-total integrity ----------
    l_trailer_cnt := JSON_VALUE(l_clob, '$.trailer.lineCount' RETURNING NUMBER);
    l_line_cnt    := l_lines.COUNT;
    IF NVL(l_trailer_cnt,-1) <> l_line_cnt THEN
      UPDATE xxtjx.xxtjx_ksef_files
         SET process_status = xxtjx_ksef_cons_pkg.gc_st_error
           , error_code = xxtjx_ksef_cons_pkg.gc_err_trailer
           , error_message = 'Trailer lineCount='||l_trailer_cnt
                             ||' does not match lines parsed='||l_line_cnt
       WHERE file_id = p_file_id;
      p_status := xxtjx_ksef_cons_pkg.gc_st_error;
      RETURN;
    END IF;

    -- COA id for the OU's ledger (for later CCID resolution).
    BEGIN
      SELECT gl.chart_of_accounts_id INTO l_coa_id
        FROM hr_operating_units hou, gl_ledgers gl
       WHERE hou.organization_id = l_org_id
         AND gl.ledger_id = hou.set_of_books_id;
    EXCEPTION WHEN OTHERS THEN l_coa_id := NULL; END;

    -- ---------- Insert HEADER staging ----------
    l_hdr_stg_id := xxtjx.xxtjx_ksef_hdr_s.NEXTVAL;
    INSERT INTO xxtjx.xxtjx_ksef_ap_hdr_stg
      ( hdr_stg_id, file_id, original_json_id, request_id, batch_id
      , ksef_number, source_system, invoice_source, process_status
      , validation_status, interface_status
      , invoice_num, invoice_type_lookup_code, invoice_date, gl_date
      , vendor_id, vendor_num, vendor_name, vendor_site_id, vendor_site_code
      , invoice_amount, invoice_currency_code, exchange_rate, exchange_rate_type
      , exchange_date, terms_name, terms_date, description, source
      , org_id, operating_unit_name, payment_method_code
      , calc_tax_during_import_flag, po_number, total_tax_amount
      , invoice_date_str, gl_date_str
      , attribute_category, attribute1, attribute2, attribute_date1 )
    VALUES
      ( l_hdr_stg_id, p_file_id, p_file_id, fnd_global.conc_request_id, l_batch
      , l_ksef, xxtjx_ksef_cons_pkg.gc_source_system, l_source
      , xxtjx_ksef_cons_pkg.gc_st_parsed
      , xxtjx_ksef_cons_pkg.gc_val_pending, xxtjx_ksef_cons_pkg.gc_if_pending
      , l_invnum, l_invtype, xxtjx_ksef_util_pkg.to_date_mmddyyyy(l_invdate_s)
      , xxtjx_ksef_util_pkg.to_date_mmddyyyy(l_gldate_s)
      , l_vid, l_vnum, l_vname, l_vsite_id, l_vsitecode
      , l_invamt, l_curr, l_xrate, l_xrate_type
      , xxtjx_ksef_util_pkg.to_date_mmddyyyy(l_xrate_dt_s), l_terms
      , xxtjx_ksef_util_pkg.to_date_mmddyyyy(l_terms_dt_s), l_desc, l_source
      , l_org_id, l_ou_name, l_pay_method
      , l_calc_tax, l_po, l_taxamt
      , l_invdate_s, l_gldate_s
      , 'KSEF', l_ksef, l_legacy_po
      , xxtjx_ksef_util_pkg.to_date_mmddyyyy(l_intrec_s) );

    -- ---------- Insert LINES staging (FORALL bulk) ----------
    FORALL i IN 1 .. l_lines.COUNT
      INSERT INTO xxtjx.xxtjx_ksef_ap_line_stg
        ( line_stg_id, hdr_stg_id, file_id, request_id, json_line_number
        , process_status, validation_status
        , line_number, line_type_lookup_code, amount, description
        , vendor_site_id, accounting_date, set_of_books_id
        , dist_code_concatenated, line_group_number, prorate_across_flag
        , tax_classification_code, tax_code, tax_regime_code, tax, tax_status_code
        , po_number, po_line_number, po_shipment_num, po_distribution_num
        , org_id, accounting_date_str )
      VALUES
        ( xxtjx.xxtjx_ksef_line_s.NEXTVAL, l_hdr_stg_id, p_file_id
        , fnd_global.conc_request_id, l_lines(i).line_number
        , xxtjx_ksef_cons_pkg.gc_st_parsed, xxtjx_ksef_cons_pkg.gc_val_pending
        , l_lines(i).line_number, l_lines(i).line_type, l_lines(i).amount
        , l_lines(i).line_description, l_lines(i).vendor_site_id
        , xxtjx_ksef_util_pkg.to_date_mmddyyyy(l_lines(i).accounting_date_s)
        , l_lines(i).set_of_books_id
        , CASE WHEN l_coa_id IS NULL THEN l_lines(i).dist_account
               ELSE xxtjx_ksef_util_pkg.normalize_ccid_string(l_lines(i).dist_account,l_coa_id)
          END
        , l_lines(i).line_group_number, l_lines(i).prorate_flag
        , l_lines(i).tax_class_code, l_lines(i).tax_code, l_lines(i).tax_regime
        , l_lines(i).tax, l_lines(i).tax_status
        , l_lines(i).po_number, l_lines(i).po_line_number
        , l_lines(i).po_shipment_num, l_lines(i).po_dist_num
        , l_org_id
        , l_lines(i).accounting_date_s );

    -- ---------- Attachment stubs (metadata only; base64 stays in raw JSON) ----------
    INSERT INTO xxtjx.xxtjx_ap_attachments
      ( attachment_id, file_id, hdr_stg_id, invoice_number
      , file_name, mime_type, file_extension
      , upload_status, request_id, pdf_content )
    SELECT xxtjx.xxtjx_ap_attach_s.NEXTVAL, p_file_id, l_hdr_stg_id, l_invnum
         , jt.file_name, jt.mime_type
         , LOWER(REGEXP_SUBSTR(jt.file_name,'[^.]+$'))
         , xxtjx_ksef_cons_pkg.gc_att_pending, fnd_global.conc_request_id
         , EMPTY_BLOB()
      FROM JSON_TABLE( l_clob, '$.files[*]'
             COLUMNS ( file_name VARCHAR2(255) PATH '$.fileName'
                     , mime_type VARCHAR2(240) PATH '$.mimeType' ) ) jt;

    UPDATE xxtjx.xxtjx_ksef_files
       SET process_status = xxtjx_ksef_cons_pkg.gc_st_parsed
     WHERE file_id = p_file_id;

    xxtjx_ksef_log_pkg.log_info('parse_file'
      ,'Parsed file_id='||p_file_id||' hdr_stg_id='||l_hdr_stg_id
       ||' lines='||l_line_cnt);
    p_status := xxtjx_ksef_cons_pkg.gc_st_parsed;

  EXCEPTION
    WHEN OTHERS THEN
      xxtjx_ksef_log_pkg.log_error('parse_file','Parse failed file_id='||p_file_id);
      UPDATE xxtjx.xxtjx_ksef_files
         SET process_status = xxtjx_ksef_cons_pkg.gc_st_error
           , error_code = xxtjx_ksef_cons_pkg.gc_err_invalid_json
           , error_message = SUBSTR('Parse error: '||SQLERRM,1,4000)
       WHERE file_id = p_file_id;
      p_status := xxtjx_ksef_cons_pkg.gc_st_error;
  END parse_file;

  ------------------------------------------------------------------
  PROCEDURE parse_pending ( p_parsed OUT NUMBER, p_failed OUT NUMBER )
  IS
    l_status VARCHAR2(30);
  BEGIN
    p_parsed := 0; p_failed := 0;
    xxtjx_ksef_log_pkg.init_context(fnd_global.conc_request_id, gc_pkg);

    FOR f IN ( SELECT file_id, file_name, invoice_number, ksef_number
                 FROM xxtjx.xxtjx_ksef_files
                WHERE process_status = xxtjx_ksef_cons_pkg.gc_st_loaded
                ORDER BY received_date, file_id )
    LOOP
      xxtjx_ksef_log_pkg.set_file_context(f.file_id, f.file_name
                                         , f.invoice_number, f.ksef_number);
      parse_file(f.file_id, l_status);
      COMMIT;   -- checkpoint per file
      IF l_status = xxtjx_ksef_cons_pkg.gc_st_parsed
        THEN p_parsed := p_parsed + 1;
        ELSE p_failed := p_failed + 1;
      END IF;
    END LOOP;
    xxtjx_ksef_log_pkg.log_info('parse_pending'
      ,'Parsed='||p_parsed||' Failed='||p_failed);
  END parse_pending;

END xxtjx_ksef_parser_pkg;
/
