-- ***********************************************************************
-- * FILE NAME
-- *   XXTJX_WD_EXP_INV.ctl
-- *
-- * DESCRIPTION
-- *   SQL*Loader control file for the WD Expense Report -> AP Invoice
-- *   integration. Reads the pipe-delimited (.txt) file and loads :
-- *      DH records -> XXTJX_AP_INVOICES_INTERFACE  (header staging)
-- *      DL records -> XXTJX_AP_INV_LINES_INTERFACE (line   staging)
-- *   H (file header) and T (trailer) records are ignored by the WHEN
-- *   clauses; the trailer count is reconciled inside the PL/SQL package.
-- *
-- * HISTORY
-- * VERSION DATE        AUTHOR(S)       DESCRIPTION
-- * 1.0     25-JUN-2026 <Author>        Initial version.
-- ***********************************************************************
OPTIONS (ERRORS=0, ROWS=1000)
LOAD DATA
CHARACTERSET UTF8
INFILE '*'
APPEND
----------------------------------------------------------------------------
-- INVOICE HEADER  (DH)
----------------------------------------------------------------------------
INTO TABLE xxtjx_ap_invoices_interface
WHEN (1:2) = 'DH'
FIELDS TERMINATED BY '|' OPTIONALLY ENCLOSED BY '"'
TRAILING NULLCOLS
(
   rec_type                   FILLER CHAR
 , global_attribute1          CHAR "TRIM(:global_attribute1)"          -- Batch Id
 , invoice_num                CHAR "TRIM(:invoice_num)"                -- Invoice Number
 , invoice_type_lookup_code   CHAR "NVL(TRIM(:invoice_type_lookup_code),'STANDARD')"
 , vendor_num_f               FILLER CHAR                              -- not required
 , vendor_name_f              FILLER CHAR                              -- not required
 , vendor_id_f                FILLER CHAR                              -- not required
 , vendor_site_code_f         FILLER CHAR                              -- not required
 , attribute1                 CHAR "TRIM(:attribute1)"                 -- Employee Number (transient)
 , gl_date_f                  FILLER CHAR                              -- derived on EBS
 , attribute2                 CHAR "TRIM(:attribute2)"                 -- Operating Unit Name
 , legal_entity_f             FILLER CHAR                              -- not required
 , source                     CHAR "NVL(TRIM(:source),'TJXWD_EXP US')"
 , invoice_date               DATE "MMDDYYYY"
 , invoice_amount             CHAR "TO_NUMBER(:invoice_amount)"
 , total_tax_amount_f         FILLER CHAR
 , invoice_currency_code      CHAR "TRIM(:invoice_currency_code)"
 , exchange_rate_f            FILLER CHAR
 , exchange_rate_date_f       FILLER CHAR
 , exchange_rate_type_f       FILLER CHAR
 , description                CHAR "SUBSTR(TRIM(:description),1,240)"
 , invoice_terms_f            FILLER CHAR
 , terms_date_f               FILLER CHAR
 , po_number_f                FILLER CHAR
 , legacy_po_number_f         FILLER CHAR
 , legacy_po_date_f           FILLER CHAR
 , liability_account_f        FILLER CHAR
 , payment_method_f           FILLER CHAR
 , calc_tax_f                 FILLER CHAR
 , remit_vendor_num_f         FILLER CHAR
 , remit_vendor_name_f        FILLER CHAR
 , remit_vendor_id_f          FILLER CHAR
 , remit_vendor_site_code_f   FILLER CHAR
 , remit_vendor_site_id_f     FILLER CHAR
 , invoice_id                 EXPRESSION "ap_invoices_interface_s.nextval"
 , process_status_flag        CONSTANT "NEW"
 , creation_date              SYSDATE
)
----------------------------------------------------------------------------
-- INVOICE LINE  (DL)
----------------------------------------------------------------------------
INTO TABLE xxtjx_ap_inv_lines_interface
WHEN (1:2) = 'DL'
FIELDS TERMINATED BY '|' OPTIONALLY ENCLOSED BY '"'
TRAILING NULLCOLS
(
   rec_type                   FILLER CHAR
 , global_attribute1          CHAR "TRIM(:global_attribute1)"          -- Batch Id
 , invoice_num                CHAR "TRIM(:invoice_num)"                -- Invoice Number (link)
 , line_number                CHAR "TO_NUMBER(:line_number)"
 , description                CHAR "SUBSTR(TRIM(:description),1,240)"   -- Line / Item description
 , vendor_num_f               FILLER CHAR
 , vendor_name_f              FILLER CHAR
 , vendor_id_f                FILLER CHAR
 , vendor_site_code_f         FILLER CHAR
 , attribute1                 CHAR "TRIM(:attribute1)"                 -- Employee Number (transient)
 , line_type_lookup_code      CHAR "NVL(TRIM(:line_type_lookup_code),'ITEM')"
 , amount                     CHAR "TO_NUMBER(:amount)"
 , accounting_date_f          FILLER CHAR
 , set_of_books_id_f          FILLER CHAR
 , dist_code_concatenated     CHAR "TRIM(:dist_code_concatenated)"     -- 6-seg COA string
 , line_group_number_f        FILLER CHAR
 , tax_code_f                 FILLER CHAR
 , tax_regime_f               FILLER CHAR
 , tax_f                      FILLER CHAR
 , tax_status_code_f          FILLER CHAR
 , tax_classification_code    CHAR "TRIM(:tax_classification_code)"
 , prorate_across_flag_f      FILLER CHAR
 , po_number_f                FILLER CHAR
 , po_line_number_f           FILLER CHAR
 , po_shipment_number_f       FILLER CHAR
 , po_distribution_number_f   FILLER CHAR
 , trip_distance_f            FILLER CHAR
 , process_status_flag        CONSTANT "NEW"
 , creation_date              SYSDATE
)
