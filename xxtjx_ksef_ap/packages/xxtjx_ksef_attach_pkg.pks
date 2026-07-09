CREATE OR REPLACE PACKAGE apps.xxtjx_ksef_attach_pkg
AS
  -- ===================================================================
  --  XXTJX_KSEF_ATTACH_PKG : PDF attachment framework.
  --  For IMPORTED invoices: decode base64 from the raw JSON, validate
  --  (signature/mime/size), persist decoded SecureFile BLOB in
  --  XXTJX_AP_ATTACHMENTS, then attach it to the AP invoice header via
  --  Oracle FND Attachments (entity AP_INVOICES, category Supplier).
  --  Attachment failure NEVER rolls back the imported invoice.
  -- ===================================================================

  PROCEDURE attach_pending ( p_success OUT NUMBER, p_failure OUT NUMBER );

  PROCEDURE attach_one ( p_attachment_id IN NUMBER, p_status OUT VARCHAR2 );

END xxtjx_ksef_attach_pkg;
/
