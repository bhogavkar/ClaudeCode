# Interface Contract — OpenText → Oracle EBS (TJX KSeF AP Invoice)

**Contract source of truth:** `ksef_ap_invoice.schema.json`
(`$id: https://tjx.example.com/schemas/ksef-ap-invoice.schema.json`, JSON Schema
draft 2020-12). This document is the human-readable projection of that schema
onto the Oracle Payables Open Interface. Where the two ever disagree, **the JSON
Schema wins** and this document + `XXTJX_KSEF_PARSER_PKG` must be corrected.

The physical JSON is touched in exactly **one** place in the code base —
`XXTJX_KSEF_PARSER_PKG` (the JSON PATH expressions). Every other package works
off the staging tables, so a schema revision is a single-file change.

---

## 1. File & envelope

Each file is **exactly one invoice**, delivered over SFTP, named:

```
TJX_E-INVOICE_AP_INV_<YYYYMMDDHH24MISS>.json      (file-name stamp)
e.g. TJX_E-INVOICE_AP_INV_20260710124530.json
```

Loader-enforced regex: `^TJX_E-INVOICE_AP_INV_[0-9]{14}\.json$`

> Note: the *file-name* stamp is `YYYYMMDDHH24MISS` (14 digits) while the
> in-payload `batchId` is `MMDDYYHHMISS` (12 digits). They are independent; do
> not cross-validate them.

Top-level object (`additionalProperties:false`, all required):

| Key            | Type / rule                                  | Use                                    |
|----------------|----------------------------------------------|----------------------------------------|
| `documentType` | const `"AP_INVOICE"`                          | routing guard                          |
| `batchId`      | `^[0-9]{12}$` (MMDDYYHHMISS), maxLen 17       | `BATCH_ID` / import `GROUP_ID` seed     |
| `header`       | object                                        | one invoice header                     |
| `lines[]`      | array, `minItems 1`                           | invoice lines                          |
| `files[]`      | array, `minItems 1`                           | attachments (normally 1 PDF)           |
| `trailer`      | object `{ lineCount }`                         | control total = `lines.length`         |

## 2. Header → `AP_INVOICES_INTERFACE` (AII)

| JSON `header.*`            | Req | Rule / enum                                             | AII column                       |
|----------------------------|-----|---------------------------------------------------------|----------------------------------|
| `invoiceNumber`            | Y   | maxLen 50                                               | `INVOICE_NUM`                    |
| `invoiceType`              | Y   | `STANDARD` \| `CREDIT` (CREDIT ⇒ amounts < 0)           | `INVOICE_TYPE_LOOKUP_CODE`       |
| `vendorSiteId`             | Y   | integer — **primary vendor key**                        | `VENDOR_SITE_ID` (+ derive `VENDOR_ID`) |
| `vendorNumber`             | N   | maxLen 30                                               | cross-check `SEGMENT1`           |
| `vendorName`               | N   | maxLen 240                                              | cross-check                      |
| `vendorId`                 | N   | integer                                                 | cross-check                      |
| `vendorSiteCode`           | N   | maxLen 30                                               | cross-check                      |
| `operatingUnitName`        | Y   | `PL (431) TJX TK MAXX POLAND OU` \| `PL (432) TJX EURO DISTRIBUTION OU` | resolve `ORG_ID`  |
| `legalEntity`              | N   | maxLen 10                                               | `LEGAL_ENTITY_ID` (resolve)      |
| `source`                   | Y   | maxLen 80, e.g. `TJX E-Invoice`                          | `SOURCE` (registered lookup)     |
| `invoiceDate`              | Y   | `MMDDYYYY`                                               | `INVOICE_DATE`                   |
| `glDate`                   | N   | `MMDDYYYY` (else derived)                                | `GL_DATE`                        |
| `invoiceAmount`            | Y   | number, incl. tax, <0 for CREDIT                        | `INVOICE_AMOUNT`                 |
| `totalTaxAmount`           | N   | number                                                  | reconciliation                   |
| `currency`                | Y   | const `PLN`                                              | `INVOICE_CURRENCY_CODE`          |
| `exchangeRate`             | N   | number                                                  | `EXCHANGE_RATE`                  |
| `exchangeRateType`         | N   | maxLen 30                                               | `EXCHANGE_RATE_TYPE`             |
| `exchangeRateDate`         | N   | `MMDDYYYY`                                               | `EXCHANGE_DATE`                  |
| `invoiceDescription`       | N   | maxLen 240                                              | `DESCRIPTION`                    |
| `invoiceTerms`             | N   | maxLen 50                                               | `TERMS_NAME`                     |
| `termsDate`                | N   | `MMDDYYYY`                                               | `TERMS_DATE`                     |
| `poNumber`                 | N   | maxLen 12 (req when PO invoice)                          | header PO context                |
| `legacyPoNumber`           | N   | maxLen 150                                              | attribute / DFF                  |
| `legacyPoDate`             | N   | `MMDDYYYY`                                               | attribute / DFF                  |
| `liabilityAccount`         | N   | maxLen 32                                               | `ACCTS_PAY_CODE_COMBINATION_ID`  |
| `paymentMethod`            | N   | maxLen 25                                               | `PAYMENT_METHOD_CODE`            |
| `calculateTaxDuringImport` | N   | 1 char (Y/N)                                             | `CALC_TAX_DURING_IMPORT_FLAG`    |
| `remitToVendorNumber/Name/Id/SiteCode/SiteId` | N | —                                          | remit-to override                |
| `ksefNumber`               | Y   | maxLen 50 (~35), **unique**                             | `ATTRIBUTE1` (KSeF) + idempotency|
| `internalRecordingDate`    | Y   | `MMDDYYYY`                                               | `ATTRIBUTE_DATE1` / audit        |

## 3. Line → `AP_INVOICE_LINES_INTERFACE` (AILI)

Required per line: `lineNumber`, `vendorSiteId`, `lineType`, `amount`,
`distributionAccount`.

| JSON `lines[*].*`        | Req | Rule / enum                             | AILI column                          |
|--------------------------|-----|-----------------------------------------|--------------------------------------|
| `lineNumber`             | Y   | integer ≥ 1, sequential                 | `LINE_NUMBER`                        |
| `lineType`               | Y   | `ITEM` \| `FREIGHT` \| `TAX`(out of scope)| `LINE_TYPE_LOOKUP_CODE`             |
| `amount`                 | Y   | number, <0 for CREDIT                   | `AMOUNT`                             |
| `distributionAccount`    | Y   | maxLen 250, TJX 6-seg COA (see §5)      | `DIST_CODE_CONCATENATED`             |
| `lineDescription`        | N   | maxLen 240                              | `DESCRIPTION`                        |
| `vendorSiteId`           | Y   | integer (must equal header)             | consistency check                    |
| `accountingDate`         | N   | `MMDDYYYY`                               | `ACCOUNTING_DATE`                    |
| `setOfBookId`            | N   | integer                                 | `SET_OF_BOOKS_ID`                    |
| `lineGroupNumber`        | N   | integer                                 | `LINE_GROUP_NUMBER` (proration)      |
| `taxCode`                | N   | maxLen 30                               | legacy tax code                      |
| `taxRegime`              | N   | maxLen 30                               | `TAX_REGIME_CODE`                    |
| `tax`                    | N   | maxLen 30                               | `TAX`                                |
| `taxStatusCode`          | N   | maxLen 30                               | `TAX_STATUS_CODE`                    |
| `taxClassificationCode`  | N   | maxLen 30                               | `TAX_CLASSIFICATION_CODE`            |
| `prorateAcrossFlag`      | N   | 1 char                                  | `PRORATE_ACROSS_FLAG`                |
| `poNumber`               | N   | maxLen 20 (req for PO lines)            | `PO_NUMBER`                          |
| `poLineNumber`           | N   | integer                                 | `PO_LINE_NUMBER`                     |
| `poShipmentNumber`       | N   | integer                                 | `PO_SHIPMENT_NUM`                    |
| `poDistributionNumber`   | N   | integer                                 | `PO_DISTRIBUTION_NUM`                |

## 4. Files → `XXTJX_AP_ATTACHMENTS`

Required per file: `fileName`, `mimeType`, `fileContent`.

| JSON `files[*].*` | Req | Rule                                                    | Stored as                     |
|-------------------|-----|---------------------------------------------------------|-------------------------------|
| `fileName`        | Y   | maxLen 255                                              | `FILE_NAME`                   |
| `mimeType`        | Y   | const `application/pdf`                                  | `MIME_TYPE`                   |
| `fileContent`     | Y   | Base64 single line `^[A-Za-z0-9+/]*={0,2}$`             | decoded → `PDF_CONTENT` BLOB  |

The schema carries **no** `fileSize`, `checksum`, `fileExtension`, or `encoding`
field. Therefore:
- `FILE_SIZE`      = `DBMS_LOB.GETLENGTH(decoded_blob)` (computed post-decode).
- `CHECKSUM`       = SHA-256 of the decoded BLOB (`DBMS_CRYPTO`, computed).
- `FILE_EXTENSION` = derived from `fileName` (must resolve to `pdf`).
- Base64 is **decoded then discarded**; only the BLOB is persisted.

## 5. TJX Chart of Accounts (`distributionAccount`)

Six segments, `.`-separated, order:

```
Chain . Location . CostCenter . Account . Interchain . Future
128   . 1280575  . 3131       . 806502  . 000        . 0000
```

The `.` in the payload is normalised to the live GL flexfield separator via
`FND_FLEX_EXT`/profile before populating `DIST_CODE_CONCATENATED` (see
`XXTJX_KSEF_UTIL_PKG.normalize_ccid_string`). Validation resolves the string to a
`CODE_COMBINATION_ID` and confirms it is enabled and not summary.

## 6. Sign convention (CREDIT memos)

`invoiceType = CREDIT` ⇒ `invoiceAmount < 0` and **every** `lines[*].amount < 0`.
Validation rejects sign mismatches. `INVOICE_TYPE_LOOKUP_CODE` is set to
`CREDIT`; Payables handles the rest.

## 7. Control total

`trailer.lineCount` must equal `lines.length`; enforced by the loader/parser
before staging (integrity guard against truncated transfers).

## 8. Idempotency key

A logical invoice is uniquely identified by:

```
vendorSiteId  +  vendorId(derived)  +  invoiceNumber  +  ksefNumber
```

`ksefNumber` alone is globally unique per the schema and is the primary replay
guard; the 4-part key is the defence-in-depth business key checked against both
staging history and live `AP_INVOICES_ALL`.
