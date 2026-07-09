CREATE OR REPLACE PACKAGE BODY apps.xxtjx_ksef_attach_pkg
AS
  gc_pkg CONSTANT VARCHAR2(30) := 'XXTJX_KSEF_ATTACH_PKG';

  ------------------------------------------------------------------
  FUNCTION get_category_id ( p_name IN VARCHAR2 ) RETURN NUMBER
  IS
    l_id NUMBER;
  BEGIN
    SELECT category_id INTO l_id
      FROM fnd_document_categories_tl
     WHERE name = p_name AND language = USERENV('LANG') AND ROWNUM = 1;
    RETURN l_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN NULL;
  END get_category_id;

  ------------------------------------------------------------------
  --  Create the FND attachment linking a BLOB to the AP invoice header.
  --  Direct-insert method (version-stable for 12.2): FND_LOBS ->
  --  FND_DOCUMENTS(+TL) -> FND_ATTACHED_DOCUMENTS.
  ------------------------------------------------------------------
  PROCEDURE create_fnd_attachment
    ( p_invoice_id  IN  NUMBER
    , p_file_name   IN  VARCHAR2
    , p_mime_type   IN  VARCHAR2
    , p_blob        IN  BLOB
    , p_category_id IN  NUMBER
    , p_media_id    OUT NUMBER
    , p_document_id OUT NUMBER
    , p_attached_id OUT NUMBER )
  IS
    l_media_id    NUMBER;
    l_document_id NUMBER;
    l_attached_id NUMBER;
    l_user        NUMBER := NVL(fnd_global.user_id,-1);
    l_login       NUMBER := NVL(fnd_global.login_id,-1);
    l_seq         NUMBER;
  BEGIN
    -- 1) FND_LOBS (SecureFile store used by attachments UI).
    l_media_id := fnd_lobs_s.NEXTVAL;
    INSERT INTO fnd_lobs
      ( file_id, file_name, file_content_type, upload_date, expiration_date
      , program_name, program_tag, file_data, language, oracle_charset, file_format )
    VALUES
      ( l_media_id, p_file_name, p_mime_type, SYSDATE, NULL
      , 'XXTJX_KSEF', 'AP_INVOICE', p_blob, USERENV('LANG'), 'UTF8', 'binary' );

    -- 2) FND_DOCUMENTS + _TL.
    l_document_id := fnd_documents_s.NEXTVAL;
    INSERT INTO fnd_documents
      ( document_id, creation_date, created_by, last_update_date, last_updated_by
      , last_update_login, datatype_id, category_id, security_type
      , publish_flag, usage_type, start_date_active, media_id )
    VALUES
      ( l_document_id, SYSDATE, l_user, SYSDATE, l_user, l_login
      , xxtjx_ksef_cons_pkg.gc_att_datatype_file, p_category_id, 2
      , 'Y', 'O', SYSDATE, l_media_id );

    INSERT INTO fnd_documents_tl
      ( document_id, description, language, source_lang, title
      , creation_date, created_by, last_update_date, last_updated_by, last_update_login )
    SELECT l_document_id, 'KSeF invoice PDF - '||p_file_name, l.language_code
         , USERENV('LANG'), p_file_name
         , SYSDATE, l_user, SYSDATE, l_user, l_login
      FROM fnd_languages l
     WHERE l.installed_flag IN ('B','I');

    -- 3) FND_ATTACHED_DOCUMENTS -> entity AP_INVOICES, pk1 = invoice_id.
    l_attached_id := fnd_attached_documents_s.NEXTVAL;
    SELECT NVL(MAX(seq_num),0)+10 INTO l_seq
      FROM fnd_attached_documents
     WHERE entity_name = xxtjx_ksef_cons_pkg.gc_att_entity
       AND pk1_value = TO_CHAR(p_invoice_id);

    INSERT INTO fnd_attached_documents
      ( attached_document_id, document_id, creation_date, created_by
      , last_update_date, last_updated_by, last_update_login
      , seq_num, entity_name, column1, pk1_value, category_id
      , datatype_id, request_id, program_application_id, program_id )
    VALUES
      ( l_attached_id, l_document_id, SYSDATE, l_user
      , SYSDATE, l_user, l_login
      , l_seq, xxtjx_ksef_cons_pkg.gc_att_entity, NULL, TO_CHAR(p_invoice_id)
      , p_category_id, xxtjx_ksef_cons_pkg.gc_att_datatype_file
      , fnd_global.conc_request_id, NULL, NULL );

    p_media_id    := l_media_id;
    p_document_id := l_document_id;
    p_attached_id := l_attached_id;
  END create_fnd_attachment;

  ------------------------------------------------------------------
  PROCEDURE attach_one ( p_attachment_id IN NUMBER, p_status OUT VARCHAR2 )
  IS
    l_raw        CLOB;
    l_b64        CLOB;
    l_blob       BLOB;
    l_invoice_id NUMBER;
    l_file_id    NUMBER;
    l_file_name  VARCHAR2(255);
    l_mime       VARCHAR2(240);
    l_cat_id     NUMBER;
    l_size       NUMBER;
    l_media      NUMBER; l_doc NUMBER; l_att NUMBER;
    l_seq_in_file NUMBER;
  BEGIN
    SELECT a.file_id, a.invoice_id, a.file_name, a.mime_type
         , h.ap_invoice_id
      INTO l_file_id, l_invoice_id, l_file_name, l_mime, l_invoice_id
      FROM xxtjx.xxtjx_ap_attachments a, xxtjx.xxtjx_ksef_ap_hdr_stg h
     WHERE a.attachment_id = p_attachment_id
       AND h.hdr_stg_id = a.hdr_stg_id;

    IF l_invoice_id IS NULL THEN
      -- Invoice not yet imported; leave PENDING for a later run.
      p_status := xxtjx_ksef_cons_pkg.gc_att_pending;
      RETURN;
    END IF;

    -- Locate this attachment's position within files[] (match on file name).
    SELECT file_content INTO l_raw FROM xxtjx.xxtjx_ksef_files WHERE file_id = l_file_id;

    SELECT MIN(idx) INTO l_seq_in_file
      FROM ( SELECT ROWNUM-1 AS idx, fn
               FROM JSON_TABLE(l_raw,'$.files[*]'
                      COLUMNS(fn VARCHAR2(255) PATH '$.fileName')) )
     WHERE fn = l_file_name;

    l_b64 := JSON_VALUE(l_raw
              , '$.files['||NVL(l_seq_in_file,0)||'].fileContent' RETURNING CLOB);

    -- 1) DECODE
    l_blob := xxtjx_ksef_util_pkg.base64_to_blob(l_b64);
    l_size := DBMS_LOB.getlength(l_blob);

    -- 2) VALIDATE (defence in depth; validation already screened)
    IF l_mime <> xxtjx_ksef_cons_pkg.gc_att_mime_pdf THEN
      RAISE_APPLICATION_ERROR(-20001,'MIME not application/pdf');
    END IF;
    IF NOT xxtjx_ksef_util_pkg.is_pdf_signature(l_blob) THEN
      RAISE_APPLICATION_ERROR(-20002,'Invalid PDF signature');
    END IF;
    IF l_size > xxtjx_ksef_cons_pkg.gc_att_max_bytes
       OR l_size < xxtjx_ksef_cons_pkg.gc_att_min_bytes THEN
      RAISE_APPLICATION_ERROR(-20003,'PDF size out of bounds: '||l_size);
    END IF;

    -- 3) STORE decoded SecureFile BLOB + computed metadata
    UPDATE xxtjx.xxtjx_ap_attachments
       SET pdf_content   = l_blob
         , file_size     = l_size
         , checksum      = xxtjx_ksef_util_pkg.sha256_blob(l_blob)
         , invoice_id    = l_invoice_id
         , invoice_number= (SELECT invoice_num FROM xxtjx.xxtjx_ksef_ap_hdr_stg
                             WHERE ap_invoice_id = l_invoice_id AND ROWNUM=1)
         , upload_status = xxtjx_ksef_cons_pkg.gc_att_decoded
         , request_id    = fnd_global.conc_request_id
         , last_update_date = SYSDATE
     WHERE attachment_id = p_attachment_id;

    -- 4) ATTACH via FND
    l_cat_id := get_category_id(xxtjx_ksef_cons_pkg.gc_att_category);
    IF l_cat_id IS NULL THEN
      RAISE_APPLICATION_ERROR(-20004
        ,'FND category "'||xxtjx_ksef_cons_pkg.gc_att_category||'" not found');
    END IF;

    create_fnd_attachment
      ( p_invoice_id  => l_invoice_id
      , p_file_name   => l_file_name
      , p_mime_type   => l_mime
      , p_blob        => l_blob
      , p_category_id => l_cat_id
      , p_media_id    => l_media
      , p_document_id => l_doc
      , p_attached_id => l_att );

    UPDATE xxtjx.xxtjx_ap_attachments
       SET document_id          = l_doc
         , attached_document_id = l_att
         , media_id             = l_media
         , category_id          = l_cat_id
         , datatype_id          = xxtjx_ksef_cons_pkg.gc_att_datatype_file
         , upload_status        = xxtjx_ksef_cons_pkg.gc_att_attached
         , error_code = NULL, error_message = NULL
     WHERE attachment_id = p_attachment_id;

    -- Mark file COMPLETED when all its attachments are attached.
    UPDATE xxtjx.xxtjx_ksef_files f
       SET process_status = xxtjx_ksef_cons_pkg.gc_st_completed
         , process_date = SYSDATE
     WHERE f.file_id = l_file_id
       AND NOT EXISTS ( SELECT 1 FROM xxtjx.xxtjx_ap_attachments a
                         WHERE a.file_id = f.file_id
                           AND a.upload_status <> xxtjx_ksef_cons_pkg.gc_att_attached );

    p_status := xxtjx_ksef_cons_pkg.gc_att_attached;
    xxtjx_ksef_log_pkg.log_info('attach_one'
      ,'Attached PDF to invoice_id='||l_invoice_id||' doc_id='||l_doc);

  EXCEPTION
    WHEN OTHERS THEN
      -- DO NOT rollback the imported invoice. Only flag the attachment.
      xxtjx_ksef_log_pkg.log_error('attach_one'
        ,'Attachment failed attachment_id='||p_attachment_id
         ||' invoice_id='||l_invoice_id);
      UPDATE xxtjx.xxtjx_ap_attachments
         SET upload_status = xxtjx_ksef_cons_pkg.gc_att_attach_error
           , error_code    = xxtjx_ksef_cons_pkg.gc_err_attach_create
           , error_message = SUBSTR(SQLERRM,1,4000)
       WHERE attachment_id = p_attachment_id;
      p_status := xxtjx_ksef_cons_pkg.gc_att_attach_error;
  END attach_one;

  ------------------------------------------------------------------
  PROCEDURE attach_pending ( p_success OUT NUMBER, p_failure OUT NUMBER )
  IS
    l_status VARCHAR2(30);
    l_t0     NUMBER := DBMS_UTILITY.get_time;
  BEGIN
    p_success := 0; p_failure := 0;
    xxtjx_ksef_log_pkg.init_context(fnd_global.conc_request_id, gc_pkg);

    FOR a IN ( SELECT att.attachment_id, att.file_id, h.invoice_num, h.ksef_number
                 FROM xxtjx.xxtjx_ap_attachments att, xxtjx.xxtjx_ksef_ap_hdr_stg h
                WHERE att.hdr_stg_id = h.hdr_stg_id
                  AND att.upload_status IN ( xxtjx_ksef_cons_pkg.gc_att_pending
                                           , xxtjx_ksef_cons_pkg.gc_att_attach_error )
                  AND h.interface_status = xxtjx_ksef_cons_pkg.gc_if_imported
                ORDER BY att.attachment_id )
    LOOP
      xxtjx_ksef_log_pkg.set_file_context(a.file_id, NULL, a.invoice_num, a.ksef_number);
      attach_one(a.attachment_id, l_status);
      COMMIT;   -- checkpoint per attachment
      IF l_status = xxtjx_ksef_cons_pkg.gc_att_attached
        THEN p_success := p_success + 1;
        ELSIF l_status = xxtjx_ksef_cons_pkg.gc_att_attach_error
        THEN p_failure := p_failure + 1;
      END IF;
    END LOOP;

    xxtjx_ksef_log_pkg.log_metric('attach_pending','Attachment phase complete'
      , DBMS_UTILITY.get_time - l_t0);
    xxtjx_ksef_log_pkg.log_info('attach_pending'
      ,'Success='||p_success||' Failure='||p_failure);
  END attach_pending;

END xxtjx_ksef_attach_pkg;
/
