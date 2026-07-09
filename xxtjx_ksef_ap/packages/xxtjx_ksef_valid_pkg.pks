CREATE OR REPLACE PACKAGE apps.xxtjx_ksef_valid_pkg
AS
  -- ===================================================================
  --  XXTJX_KSEF_VALID_PKG : Validation framework.
  --  Validates PARSED headers+lines against EBS master data and business
  --  rules, produces business-friendly error messages, and sets
  --  validation_status (PASS/FAIL). Only PASS rows proceed to import.
  -- ===================================================================

  -- Validate all headers in status PARSED / validation PENDING.
  PROCEDURE validate_pending ( p_passed OUT NUMBER, p_failed OUT NUMBER );

  -- Validate a single header (+ its lines). Reusable / unit-testable.
  PROCEDURE validate_header ( p_hdr_stg_id IN NUMBER, p_result OUT VARCHAR2 );

END xxtjx_ksef_valid_pkg;
/
