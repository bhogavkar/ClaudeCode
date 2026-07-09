-- =====================================================================
--  XXTJX KSeF AP Invoice Integration  |  Sequences
--  Run as:  XXTJX  (custom schema)     Then grant/synonym to APPS.
-- =====================================================================
SET DEFINE OFF;

CREATE SEQUENCE xxtjx.xxtjx_ksef_file_s
  MINVALUE 1 START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 50 NOORDER;

CREATE SEQUENCE xxtjx.xxtjx_ksef_hdr_s
  MINVALUE 1 START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 50 NOORDER;

CREATE SEQUENCE xxtjx.xxtjx_ksef_line_s
  MINVALUE 1 START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 100 NOORDER;

CREATE SEQUENCE xxtjx.xxtjx_ap_attach_s
  MINVALUE 1 START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 50 NOORDER;

CREATE SEQUENCE xxtjx.xxtjx_ksef_log_s
  MINVALUE 1 START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 1000 NOORDER;

-- Import batch id (GROUP_ID seed for AP Open Interface)
CREATE SEQUENCE xxtjx.xxtjx_ksef_batch_s
  MINVALUE 1 START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 20 NOORDER;

-- Grants + APPS synonyms
BEGIN
  FOR s IN (SELECT sequence_name FROM all_sequences
             WHERE sequence_owner = 'XXTJX'
               AND sequence_name LIKE 'XXTJX_KSEF%'
                OR  sequence_name LIKE 'XXTJX_AP_ATTACH%')
  LOOP
    EXECUTE IMMEDIATE 'GRANT SELECT ON xxtjx.'||s.sequence_name||' TO apps';
    EXECUTE IMMEDIATE 'CREATE OR REPLACE SYNONYM apps.'||s.sequence_name||
                      ' FOR xxtjx.'||s.sequence_name;
  END LOOP;
END;
/
