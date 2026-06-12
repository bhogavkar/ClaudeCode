-- =============================================================================
-- File        : 04_pkg_body.sql
-- Description : Package body for AP PDF Import utility.
-- Module      : Oracle Payables (AP) - R12
-- Dependencies: XXCUST_AP_PDF_STAGING, XXCUST_AP_PDF_STG_S, AP_PDF_DIR (Directory)
--               FND_LOBS, FND_DOCUMENTS, FND_DOCUMENTS_TL, FND_ATTACHED_DOCUMENTS
-- =============================================================================

CREATE OR REPLACE PACKAGE BODY XXCUST_AP_PDF_PKG
AS

    -- =========================================================================
    -- Private: structured console logger
    --   Writes to DBMS_OUTPUT (interactive / test use) and to FND_FILE.LOG
    --   (Concurrent Program log file).  The FND_FILE write is wrapped in its
    --   own exception block so the call is silently skipped when the procedure
    --   is invoked outside a CP context (e.g. from SQL*Plus directly).
    -- =========================================================================
    PROCEDURE log_msg(p_proc IN VARCHAR2, p_msg IN VARCHAR2) IS
        l_line VARCHAR2(4200);
    BEGIN
        l_line := TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS')
                  || ' [' || RPAD(p_proc, 26) || '] '
                  || p_msg;

        DBMS_OUTPUT.PUT_LINE(l_line);

        BEGIN
            FND_FILE.PUT_LINE(FND_FILE.LOG, l_line);
        EXCEPTION
            WHEN OTHERS THEN NULL;   -- not running inside a CP — harmless
        END;
    END log_msg;

    -- =========================================================================
    -- Private: persist status change as an autonomous transaction so that
    -- a caller ROLLBACK does not erase the audit trail.
    -- =========================================================================
    PROCEDURE set_staging_status(
        p_staging_id      IN NUMBER,
        p_status          IN VARCHAR2,
        p_message         IN VARCHAR2   DEFAULT NULL,
        p_invoice_id      IN NUMBER     DEFAULT NULL,
        p_invoice_num     IN VARCHAR2   DEFAULT NULL,
        p_media_id        IN NUMBER     DEFAULT NULL,
        p_document_id     IN NUMBER     DEFAULT NULL,
        p_attached_doc_id IN NUMBER     DEFAULT NULL
    ) IS
        PRAGMA AUTONOMOUS_TRANSACTION;
    BEGIN
        UPDATE XXCUST_AP_PDF_STAGING
        SET    status              = p_status,
               error_message      = SUBSTR(p_message, 1, 4000),
               invoice_id         = NVL(p_invoice_id,      invoice_id),
               invoice_num        = NVL(p_invoice_num,     invoice_num),
               fnd_media_id       = NVL(p_media_id,        fnd_media_id),
               fnd_document_id    = NVL(p_document_id,     fnd_document_id),
               fnd_attached_doc_id= NVL(p_attached_doc_id, fnd_attached_doc_id),
               process_date       = SYSDATE,
               last_update_date   = SYSDATE,
               last_updated_by    = NVL(FND_GLOBAL.USER_ID, -1),
               last_update_login  = NVL(FND_GLOBAL.LOGIN_ID, -1)
        WHERE  staging_id = p_staging_id;
        COMMIT;
    END set_staging_status;

    -- =========================================================================
    -- Private: retrieve AP invoice header details needed for attachment
    -- =========================================================================
    PROCEDURE get_invoice_details(
        p_invoice_num IN  VARCHAR2,
        x_invoice_id  OUT NUMBER,
        x_vendor_id   OUT NUMBER,
        x_org_id      OUT NUMBER,
        x_found       OUT BOOLEAN
    ) IS
    BEGIN
        SELECT invoice_id, vendor_id, org_id
        INTO   x_invoice_id, x_vendor_id, x_org_id
        FROM   ap_invoices_all
        WHERE  invoice_num = p_invoice_num
        AND    ROWNUM = 1;  -- guard: invoice_num should be unique per org; take first match

        x_found := TRUE;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            x_found      := FALSE;
            x_invoice_id := NULL;
            x_vendor_id  := NULL;
            x_org_id     := NULL;
    END get_invoice_details;

    -- =========================================================================
    -- Private: look up the FND document category ID by name
    -- =========================================================================
    FUNCTION get_category_id(p_category_name IN VARCHAR2) RETURN NUMBER IS
        l_category_id NUMBER;
    BEGIN
        SELECT category_id
        INTO   l_category_id
        FROM   fnd_document_categories_vl
        WHERE  UPPER(name) = UPPER(p_category_name)
        AND    ROWNUM = 1;

        RETURN l_category_id;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN RETURN NULL;
    END get_category_id;

    -- =========================================================================
    -- Private: compute the next attachment sequence number for an entity/PK
    --          so we never collide with existing attachments on the same invoice.
    -- =========================================================================
    FUNCTION get_next_seq_num(p_entity_name IN VARCHAR2,
                              p_pk1_value   IN VARCHAR2) RETURN NUMBER IS
        l_seq NUMBER;
    BEGIN
        SELECT NVL(MAX(seq_num), 0) + 10
        INTO   l_seq
        FROM   fnd_attached_documents
        WHERE  entity_name = p_entity_name
        AND    pk1_value   = p_pk1_value;

        RETURN l_seq;
    END get_next_seq_num;

    -- =========================================================================
    -- PROCEDURE: load_pdf_to_staging
    -- =========================================================================
    PROCEDURE load_pdf_to_staging(
        p_file_name     IN  VARCHAR2,
        p_invoice_num   IN  VARCHAR2 DEFAULT NULL,
        x_staging_id    OUT NUMBER,
        x_status        OUT VARCHAR2,
        x_message       OUT VARCHAR2
    ) IS
        c_proc       CONSTANT VARCHAR2(30) := 'load_pdf_to_staging';
        l_bfile      BFILE;
        l_blob       BLOB;
        l_file_size  NUMBER;
        l_staging_id NUMBER;
        l_ksef_num   VARCHAR2(50);
        l_dest_off   INTEGER := 1;
        l_src_off    INTEGER := 1;
        l_exist_id   NUMBER;
    BEGIN
        log_msg(c_proc, 'START | file=' || p_file_name || ' | invoice=' || NVL(p_invoice_num, 'N/A'));

        -- ------------------------------------------------------------------
        -- 1. Input validation
        -- ------------------------------------------------------------------
        IF p_file_name IS NULL THEN
            x_status  := G_STS_ERROR;
            x_message := 'p_file_name is required.';
            log_msg(c_proc, x_message);
            RETURN;
        END IF;

        -- Derive K-Sef number: strip .pdf extension (case-insensitive)
        l_ksef_num := REGEXP_REPLACE(p_file_name, '\.pdf$', '', 1, 1, 'i');

        -- Enforce 35-digit numeric format
        IF NOT REGEXP_LIKE(l_ksef_num, '^\d{' || G_KSEF_DIGITS || '}$') THEN
            x_status  := G_STS_ERROR;
            x_message := 'K-Sef number must be exactly ' || G_KSEF_DIGITS ||
                         ' digits. Derived value: [' || l_ksef_num || ']';
            log_msg(c_proc, x_message);
            RETURN;
        END IF;

        -- ------------------------------------------------------------------
        -- 2. Duplicate guard: if a non-error record already exists for this
        --    K-Sef, return the existing staging ID without reloading.
        -- ------------------------------------------------------------------
        BEGIN
            SELECT staging_id
            INTO   l_exist_id
            FROM   XXCUST_AP_PDF_STAGING
            WHERE  ksef_number = l_ksef_num
            AND    status NOT IN (G_STS_ERROR)
            AND    ROWNUM = 1;

            x_staging_id := l_exist_id;
            x_status     := G_STS_PROCESSED;
            x_message    := 'K-Sef already staged (staging_id=' || l_exist_id ||
                            '). Skipping duplicate load.';
            log_msg(c_proc, x_message);
            RETURN;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN NULL;   -- OK: proceed with fresh load
        END;

        -- ------------------------------------------------------------------
        -- 3. Validate file existence and size via BFILE
        -- ------------------------------------------------------------------
        l_bfile := BFILENAME(G_PDF_DIR, p_file_name);

        IF DBMS_LOB.FILEEXISTS(l_bfile) = 0 THEN
            x_status  := G_STS_ERROR;
            x_message := 'File not found in directory [' || G_PDF_DIR || ']: ' || p_file_name;
            log_msg(c_proc, x_message);
            RETURN;
        END IF;

        DBMS_LOB.FILEOPEN(l_bfile, DBMS_LOB.FILE_READONLY);
        l_file_size := DBMS_LOB.GETLENGTH(l_bfile);

        log_msg(c_proc, 'File size = ' || l_file_size || ' bytes (' ||
                ROUND(l_file_size / 1048576, 2) || ' MB)');

        IF l_file_size = 0 THEN
            DBMS_LOB.FILECLOSE(l_bfile);
            x_status  := G_STS_ERROR;
            x_message := 'File is empty: ' || p_file_name;
            log_msg(c_proc, x_message);
            RETURN;
        END IF;

        IF l_file_size > G_MAX_FILE_BYTES THEN
            DBMS_LOB.FILECLOSE(l_bfile);
            x_status  := G_STS_ERROR;
            x_message := 'File size (' || ROUND(l_file_size / 1048576, 2) ||
                         ' MB) exceeds the 50 MB limit: ' || p_file_name;
            log_msg(c_proc, x_message);
            RETURN;
        END IF;

        -- ------------------------------------------------------------------
        -- 4. Insert staging row with an empty BLOB placeholder
        -- ------------------------------------------------------------------
        SELECT XXCUST_AP_PDF_STG_S.NEXTVAL INTO l_staging_id FROM DUAL;

        INSERT INTO XXCUST_AP_PDF_STAGING (
            staging_id, ksef_number, pdf_file_name, pdf_content,
            file_size_bytes, status, invoice_num,
            created_by, creation_date, last_updated_by,
            last_update_date, last_update_login
        ) VALUES (
            l_staging_id, l_ksef_num, p_file_name, EMPTY_BLOB(),
            l_file_size, G_STS_LOADING, p_invoice_num,
            NVL(FND_GLOBAL.USER_ID, -1), SYSDATE, NVL(FND_GLOBAL.USER_ID, -1),
            SYSDATE, NVL(FND_GLOBAL.LOGIN_ID, -1)
        );

        -- Obtain a FOR UPDATE BLOB locator so we can write into it
        SELECT pdf_content
        INTO   l_blob
        FROM   XXCUST_AP_PDF_STAGING
        WHERE  staging_id = l_staging_id
        FOR UPDATE;

        -- ------------------------------------------------------------------
        -- 5. Stream file content into the BLOB.
        --    LOADBLOBFROMFILE handles very large files efficiently and avoids
        --    the 32 KB chunk limit of older APIs.
        -- ------------------------------------------------------------------
        DBMS_LOB.LOADBLOBFROMFILE(
            dest_lob    => l_blob,
            src_bfile   => l_bfile,
            amount      => DBMS_LOB.LOBMAXSIZE,
            dest_offset => l_dest_off,
            src_offset  => l_src_off
        );

        DBMS_LOB.FILECLOSE(l_bfile);
        log_msg(c_proc, 'BLOB written. Bytes transferred = ' || (l_dest_off - 1));

        -- ------------------------------------------------------------------
        -- 6. Mark row as PROCESSED and commit
        -- ------------------------------------------------------------------
        UPDATE XXCUST_AP_PDF_STAGING
        SET    status           = G_STS_PROCESSED,
               last_update_date = SYSDATE
        WHERE  staging_id = l_staging_id;

        COMMIT;

        x_staging_id := l_staging_id;
        x_status     := G_STS_PROCESSED;
        x_message    := 'PDF loaded successfully. staging_id=' || l_staging_id ||
                        ' | size=' || ROUND(l_file_size / 1048576, 2) || ' MB';
        log_msg(c_proc, 'END | ' || x_message);

    EXCEPTION
        WHEN OTHERS THEN
            -- Safe close of BFILE handle
            BEGIN
                IF DBMS_LOB.ISOPEN(l_bfile) = 1 THEN
                    DBMS_LOB.FILECLOSE(l_bfile);
                END IF;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;

            ROLLBACK;

            x_status  := G_STS_ERROR;
            x_message := 'Unhandled exception in ' || c_proc || ': ' || SQLERRM;
            log_msg(c_proc, x_message);

            IF l_staging_id IS NOT NULL THEN
                set_staging_status(l_staging_id, G_STS_ERROR, x_message);
                x_staging_id := l_staging_id;
            END IF;
    END load_pdf_to_staging;

    -- =========================================================================
    -- PROCEDURE: attach_pdf_to_invoice
    -- =========================================================================
    PROCEDURE attach_pdf_to_invoice(
        p_staging_id    IN  NUMBER,
        p_invoice_num   IN  VARCHAR2,
        x_status        OUT VARCHAR2,
        x_message       OUT VARCHAR2
    ) IS
        c_proc          CONSTANT VARCHAR2(30) := 'attach_pdf_to_invoice';
        l_rec           XXCUST_AP_PDF_STAGING%ROWTYPE;
        l_invoice_id    NUMBER;
        l_vendor_id     NUMBER;
        l_org_id        NUMBER;
        l_found         BOOLEAN;
        l_category_id   NUMBER;
        l_document_id   NUMBER;
        l_attached_id   NUMBER;
        l_media_id      NUMBER;
        l_seq_num       NUMBER;
        l_desc          VARCHAR2(255);
        l_dup_count     NUMBER;
    BEGIN
        log_msg(c_proc, 'START | staging_id=' || p_staging_id || ' | invoice=' || p_invoice_num);

        -- ------------------------------------------------------------------
        -- 1. Fetch and validate staging record
        -- ------------------------------------------------------------------
        BEGIN
            SELECT * INTO l_rec
            FROM   XXCUST_AP_PDF_STAGING
            WHERE  staging_id = p_staging_id;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                x_status  := G_STS_ATTACH_ERR;
                x_message := 'Staging record not found: staging_id=' || p_staging_id;
                log_msg(c_proc, x_message);
                RETURN;
        END;

        IF l_rec.status != G_STS_PROCESSED THEN
            x_status  := G_STS_ATTACH_ERR;
            x_message := 'Staging record is not in PROCESSED status. ' ||
                         'Current status=' || l_rec.status;
            log_msg(c_proc, x_message);
            RETURN;
        END IF;

        IF l_rec.pdf_content IS NULL
           OR DBMS_LOB.GETLENGTH(l_rec.pdf_content) = 0 THEN
            x_status  := G_STS_ATTACH_ERR;
            x_message := 'BLOB content is empty for staging_id=' || p_staging_id;
            log_msg(c_proc, x_message);
            RETURN;
        END IF;

        -- ------------------------------------------------------------------
        -- 2. Locate the AP invoice
        -- ------------------------------------------------------------------
        get_invoice_details(
            p_invoice_num => p_invoice_num,
            x_invoice_id  => l_invoice_id,
            x_vendor_id   => l_vendor_id,
            x_org_id      => l_org_id,
            x_found       => l_found
        );

        IF NOT l_found THEN
            x_status  := G_STS_ATTACH_ERR;
            x_message := 'Invoice not found in AP_INVOICES_ALL: ' || p_invoice_num;
            log_msg(c_proc, x_message);
            set_staging_status(p_staging_id, G_STS_ATTACH_ERR, x_message);
            RETURN;
        END IF;

        log_msg(c_proc, 'Invoice resolved: invoice_id=' || l_invoice_id ||
                        ' | vendor_id=' || l_vendor_id || ' | org_id=' || l_org_id);

        -- ------------------------------------------------------------------
        -- 3. Resolve document category
        --    Try "From Supplier" first; fall back to "Miscellaneous".
        -- ------------------------------------------------------------------
        l_category_id := get_category_id(G_CATEGORY_NAME);

        IF l_category_id IS NULL THEN
            log_msg(c_proc, 'WARNING: Category "' || G_CATEGORY_NAME ||
                            '" not found; trying "Miscellaneous".');
            l_category_id := get_category_id('Miscellaneous');
        END IF;

        IF l_category_id IS NULL THEN
            x_status  := G_STS_ATTACH_ERR;
            x_message := 'No usable FND document category found (tried "' ||
                         G_CATEGORY_NAME || '" and "Miscellaneous").';
            log_msg(c_proc, x_message);
            set_staging_status(p_staging_id, G_STS_ATTACH_ERR, x_message);
            RETURN;
        END IF;

        log_msg(c_proc, 'Category resolved: category_id=' || l_category_id);

        -- ------------------------------------------------------------------
        -- 4. Idempotency guard: skip if this K-Sef is already attached to
        --    this invoice (prevents duplicate attachments on re-run).
        -- ------------------------------------------------------------------
        SELECT COUNT(*)
        INTO   l_dup_count
        FROM   fnd_attached_documents fad
        JOIN   fnd_documents          fd  ON fd.document_id = fad.document_id
        JOIN   fnd_documents_tl       tl  ON tl.document_id = fd.document_id
                                          AND tl.language = USERENV('LANG')
        WHERE  fad.entity_name = G_ENTITY_NAME
        AND    fad.pk1_value   = TO_CHAR(l_invoice_id)
        AND    tl.description LIKE '%' || l_rec.ksef_number || '%';

        IF l_dup_count > 0 THEN
            x_status  := G_STS_ATTACHED;
            x_message := 'Attachment already exists for invoice=' || p_invoice_num ||
                         ' K-Sef=' || l_rec.ksef_number || '. Marking as ATTACHED.';
            log_msg(c_proc, x_message);
            set_staging_status(p_staging_id, G_STS_ATTACHED, x_message,
                               l_invoice_id, p_invoice_num);
            RETURN;
        END IF;

        -- ------------------------------------------------------------------
        -- 5. Generate FND object IDs
        -- ------------------------------------------------------------------
        SELECT FND_DOCUMENTS_S.NEXTVAL         INTO l_document_id FROM DUAL;
        SELECT FND_ATTACHED_DOCUMENTS_S.NEXTVAL INTO l_attached_id FROM DUAL;
        SELECT FND_LOBS_S.NEXTVAL               INTO l_media_id    FROM DUAL;
        l_seq_num    := get_next_seq_num(G_ENTITY_NAME, TO_CHAR(l_invoice_id));
        l_desc       := 'KSeF:' || l_rec.ksef_number || ' | Inv:' || p_invoice_num;

        log_msg(c_proc, 'IDs allocated: document_id=' || l_document_id ||
                        ' attached_id=' || l_attached_id ||
                        ' media_id=' || l_media_id ||
                        ' seq_num=' || l_seq_num);

        -- ------------------------------------------------------------------
        -- 6. FND_LOBS — binary content store
        -- ------------------------------------------------------------------
        INSERT INTO fnd_lobs (
            file_id,
            file_name,
            file_content_type,
            upload_date,
            expiration_date,
            program_name,
            program_tag,
            file_data,
            language,
            oracle_charset,
            file_format
        ) VALUES (
            l_media_id,
            l_rec.pdf_file_name,
            'application/pdf',
            SYSDATE,
            NULL,               -- no expiry
            G_PKG_NAME,
            'AP_KSEF_PDF',
            l_rec.pdf_content,  -- copy BLOB reference
            'US',
            'WE8ISO8859P1',
            'binary'
        );

        log_msg(c_proc, 'FND_LOBS inserted');

        -- ------------------------------------------------------------------
        -- 7. FND_DOCUMENTS — document metadata
        -- ------------------------------------------------------------------
        INSERT INTO fnd_documents (
            document_id,
            creation_date,
            created_by,
            last_update_date,
            last_updated_by,
            last_update_login,
            datatype_id,
            category_id,
            security_type,
            security_id,
            publish_flag,
            status_type,
            start_date_active,
            end_date_active,
            usage_type,
            storage_type,
            media_id,
            description,
            url,
            language
        ) VALUES (
            l_document_id,
            SYSDATE,
            NVL(FND_GLOBAL.USER_ID, -1),
            SYSDATE,
            NVL(FND_GLOBAL.USER_ID, -1),
            NVL(FND_GLOBAL.LOGIN_ID, -1),
            G_DATATYPE_FILE,   -- 6 = binary/file
            l_category_id,
            4,                 -- security_type 4 = Org
            l_org_id,          -- security_id = org of invoice
            'Y',               -- publish_flag = Yes
            'A',               -- status_type  = Active
            SYSDATE,
            NULL,
            'O',               -- usage_type O = One-time (tied to this single entity)
            G_STORAGE_LOB,     -- storage_type 1 = LOB/DB
            l_media_id,
            l_desc,
            NULL,              -- url: N/A for binary file
            USERENV('LANG')
        );

        log_msg(c_proc, 'FND_DOCUMENTS inserted');

        -- ------------------------------------------------------------------
        -- 8. FND_DOCUMENTS_TL — translated description for each installed language
        -- ------------------------------------------------------------------
        INSERT INTO fnd_documents_tl (
            document_id,
            language,
            source_lang,
            description,
            file_name,
            creation_date,
            created_by,
            last_update_date,
            last_updated_by,
            last_update_login
        )
        SELECT
            l_document_id,
            fl.language_code,
            USERENV('LANG'),
            l_desc,
            l_rec.pdf_file_name,
            SYSDATE,
            NVL(FND_GLOBAL.USER_ID, -1),
            SYSDATE,
            NVL(FND_GLOBAL.USER_ID, -1),
            NVL(FND_GLOBAL.LOGIN_ID, -1)
        FROM fnd_languages fl
        WHERE fl.installed_flag IN ('I', 'B');   -- Installed + Base language rows

        log_msg(c_proc, 'FND_DOCUMENTS_TL inserted for ' || SQL%ROWCOUNT || ' language(s)');

        -- ------------------------------------------------------------------
        -- 9. FND_ATTACHED_DOCUMENTS — link document to AP invoice header
        -- ------------------------------------------------------------------
        INSERT INTO fnd_attached_documents (
            attached_document_id,
            document_id,
            creation_date,
            created_by,
            last_update_date,
            last_updated_by,
            last_update_login,
            seq_num,
            entity_name,
            pk1_value,   -- invoice_id (AP_INVOICES entity uses PK1 only)
            pk2_value,
            pk3_value,
            pk4_value,
            pk5_value,
            automatically_added_flag,
            column1
        ) VALUES (
            l_attached_id,
            l_document_id,
            SYSDATE,
            NVL(FND_GLOBAL.USER_ID, -1),
            SYSDATE,
            NVL(FND_GLOBAL.USER_ID, -1),
            NVL(FND_GLOBAL.LOGIN_ID, -1),
            l_seq_num,
            G_ENTITY_NAME,          -- 'AP_INVOICES'
            TO_CHAR(l_invoice_id),  -- PK1
            NULL,                   -- PK2 not used by AP_INVOICES entity
            NULL,
            NULL,
            NULL,
            'N',                    -- not system-generated
            NULL
        );

        log_msg(c_proc, 'FND_ATTACHED_DOCUMENTS inserted');

        -- ------------------------------------------------------------------
        -- 10. Update staging with all FND IDs and final status
        -- ------------------------------------------------------------------
        UPDATE XXCUST_AP_PDF_STAGING
        SET    status              = G_STS_ATTACHED,
               error_message      = NULL,
               invoice_id         = l_invoice_id,
               invoice_num        = p_invoice_num,
               vendor_id          = l_vendor_id,
               fnd_media_id       = l_media_id,
               fnd_document_id    = l_document_id,
               fnd_attached_doc_id= l_attached_id,
               process_date       = SYSDATE,
               last_update_date   = SYSDATE,
               last_updated_by    = NVL(FND_GLOBAL.USER_ID, -1),
               last_update_login  = NVL(FND_GLOBAL.LOGIN_ID, -1)
        WHERE  staging_id = p_staging_id;

        COMMIT;

        x_status  := G_STS_ATTACHED;
        x_message := 'Attachment created successfully.'
                     || ' invoice=' || p_invoice_num
                     || ' | document_id=' || l_document_id
                     || ' | attached_document_id=' || l_attached_id
                     || ' | media_id=' || l_media_id;
        log_msg(c_proc, 'END | ' || x_message);

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            x_status  := G_STS_ATTACH_ERR;
            x_message := 'Unhandled exception in ' || c_proc || ': ' || SQLERRM;
            log_msg(c_proc, x_message);
            set_staging_status(p_staging_id, G_STS_ATTACH_ERR, x_message,
                               l_invoice_id, p_invoice_num);
    END attach_pdf_to_invoice;

    -- =========================================================================
    -- PROCEDURE: process_pdf   (main entry point)
    -- =========================================================================
    PROCEDURE process_pdf(
        p_file_name     IN  VARCHAR2,
        p_invoice_num   IN  VARCHAR2,
        x_status        OUT VARCHAR2,
        x_message       OUT VARCHAR2
    ) IS
        c_proc        CONSTANT VARCHAR2(30) := 'process_pdf';
        l_staging_id  NUMBER;
        l_load_status VARCHAR2(30);
        l_load_msg    VARCHAR2(4000);
        l_att_status  VARCHAR2(30);
        l_att_msg     VARCHAR2(4000);
    BEGIN
        log_msg(c_proc, '==============================');
        log_msg(c_proc, 'START');
        log_msg(c_proc, 'file_name   = ' || NVL(p_file_name,   '[NULL]'));
        log_msg(c_proc, 'invoice_num = ' || NVL(p_invoice_num, '[NULL]'));
        log_msg(c_proc, '==============================');

        -- Guard: both inputs mandatory
        IF p_file_name IS NULL OR p_invoice_num IS NULL THEN
            x_status  := G_STS_ERROR;
            x_message := 'p_file_name and p_invoice_num are both required.';
            log_msg(c_proc, x_message);
            RETURN;
        END IF;

        -- -------------------------
        -- Phase 1: Load to staging
        -- -------------------------
        log_msg(c_proc, '--- Phase 1: Load PDF to staging ---');

        load_pdf_to_staging(
            p_file_name   => p_file_name,
            p_invoice_num => p_invoice_num,
            x_staging_id  => l_staging_id,
            x_status      => l_load_status,
            x_message     => l_load_msg
        );

        log_msg(c_proc, 'Load result: status=' || l_load_status ||
                        ' | staging_id=' || NVL(TO_CHAR(l_staging_id), 'N/A'));

        IF l_load_status = G_STS_ERROR THEN
            x_status  := G_STS_ERROR;
            x_message := 'Load phase failed: ' || l_load_msg;
            RETURN;
        END IF;

        -- ------------------------------------
        -- Phase 2: Attach from staging to EBS
        -- ------------------------------------
        log_msg(c_proc, '--- Phase 2: Attach PDF to invoice ---');

        attach_pdf_to_invoice(
            p_staging_id  => l_staging_id,
            p_invoice_num => p_invoice_num,
            x_status      => l_att_status,
            x_message     => l_att_msg
        );

        log_msg(c_proc, 'Attach result: status=' || l_att_status);

        x_status  := l_att_status;
        x_message := l_att_msg;

        log_msg(c_proc, '==============================');
        log_msg(c_proc, 'END | final_status=' || x_status);
        log_msg(c_proc, '==============================');

    EXCEPTION
        WHEN OTHERS THEN
            x_status  := G_STS_ERROR;
            x_message := 'Unhandled exception in ' || c_proc || ': ' || SQLERRM;
            log_msg(c_proc, x_message);
    END process_pdf;

    -- =========================================================================
    -- PROCEDURE: process_pdf_cp   (Concurrent Program entry point)
    -- =========================================================================
    PROCEDURE process_pdf_cp(
        errbuf        OUT VARCHAR2,
        retcode       OUT VARCHAR2,
        p_file_name   IN  VARCHAR2,
        p_invoice_num IN  VARCHAR2
    ) IS
        c_proc    CONSTANT VARCHAR2(30) := 'process_pdf_cp';
        l_status  VARCHAR2(30);
        l_message VARCHAR2(4000);
    BEGIN
        -- CP log header
        FND_FILE.PUT_LINE(FND_FILE.LOG,
            '============================================================');
        FND_FILE.PUT_LINE(FND_FILE.LOG,
            ' XX AP PDF Import - KSeF OpenText');
        FND_FILE.PUT_LINE(FND_FILE.LOG,
            ' Package  : XXCUST_AP_PDF_PKG');
        FND_FILE.PUT_LINE(FND_FILE.LOG,
            ' Procedure: PROCESS_PDF_CP');
        FND_FILE.PUT_LINE(FND_FILE.LOG,
            ' Run Date : ' || TO_CHAR(SYSDATE, 'DD-MON-YYYY HH24:MI:SS'));
        FND_FILE.PUT_LINE(FND_FILE.LOG,
            '============================================================');
        FND_FILE.PUT_LINE(FND_FILE.LOG, '');
        FND_FILE.PUT_LINE(FND_FILE.LOG,
            'PARAMETERS');
        FND_FILE.PUT_LINE(FND_FILE.LOG,
            '  PDF File Name   : ' || NVL(p_file_name,   '[NULL]'));
        FND_FILE.PUT_LINE(FND_FILE.LOG,
            '  AP Invoice Num  : ' || NVL(p_invoice_num, '[NULL]'));
        FND_FILE.PUT_LINE(FND_FILE.LOG, '');

        -- Delegate to the core orchestrator
        process_pdf(
            p_file_name   => p_file_name,
            p_invoice_num => p_invoice_num,
            x_status      => l_status,
            x_message     => l_message
        );

        -- CP log footer
        FND_FILE.PUT_LINE(FND_FILE.LOG, '');
        FND_FILE.PUT_LINE(FND_FILE.LOG,
            '------------------------------------------------------------');
        FND_FILE.PUT_LINE(FND_FILE.LOG,
            'RESULT STATUS  : ' || l_status);
        FND_FILE.PUT_LINE(FND_FILE.LOG,
            'RESULT MESSAGE : ' || l_message);
        FND_FILE.PUT_LINE(FND_FILE.LOG,
            '------------------------------------------------------------');

        -- Map internal status to Oracle CP return codes
        --   '0' = Normal completion (green in SRS)
        --   '1' = Warning           (yellow in SRS)
        --   '2' = Error             (red in SRS)
        IF l_status = G_STS_ATTACHED THEN
            retcode := '0';
            errbuf  := l_message;
        ELSIF l_status = G_STS_ATTACH_ERR THEN
            -- BLOB was loaded but FND attachment failed — operator can retry
            retcode := '1';
            errbuf  := 'WARNING - PDF staged but FND attachment failed: ' || l_message;
        ELSE
            retcode := '2';
            errbuf  := 'ERROR: ' || l_message;
        END IF;

    EXCEPTION
        WHEN OTHERS THEN
            retcode := '2';
            errbuf  := 'Unhandled exception in ' || c_proc || ': ' || SQLERRM;
            BEGIN
                FND_FILE.PUT_LINE(FND_FILE.LOG, errbuf);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
    END process_pdf_cp;

END XXCUST_AP_PDF_PKG;
/

SHOW ERRORS PACKAGE BODY XXCUST_AP_PDF_PKG;

PROMPT Package body XXCUST_AP_PDF_PKG compiled. Run 05_test_sample.sql to verify.
