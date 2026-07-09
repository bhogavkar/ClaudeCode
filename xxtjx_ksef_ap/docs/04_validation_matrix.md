# 04 — Validation Matrix

Level: **H**=header, **L**=line, **F**=file/attachment.
Severity: **HARD** = invoice rejected (validation FAIL); **SOFT** = warning only.
All checks emit a business-friendly message; the first error code becomes the
primary `error_code`, all messages are concatenated into `error_message`.

| #  | Validation                     | Lvl | Code     | Rule / source of truth                                                       | Sev  |
|----|--------------------------------|-----|----------|-------------------------------------------------------------------------------|------|
| 1  | Mandatory header fields        | H   | KSEF-010 | invoiceNumber, invoiceType, vendorSiteId, operatingUnitName, source, invoiceDate, invoiceAmount, currency, ksefNumber, internalRecordingDate all present | HARD |
| 2  | Mandatory line fields          | L   | KSEF-010 | lineNumber, lineType, amount, distributionAccount present per line            | HARD |
| 3  | Invoice type                   | H   | KSEF-023 | ∈ {STANDARD, CREDIT}                                                           | HARD |
| 4  | Line type                      | L   | KSEF-023 | ∈ {ITEM, FREIGHT, TAX} (TAX out of scope → SOFT warn if present)              | HARD |
| 5  | Currency enabled               | H   | KSEF-014 | `FND_CURRENCIES` enabled + active                                             | HARD |
| 6  | Currency in scope              | H   | KSEF-014 | = PLN (contract enum)                                                          | HARD |
| 7  | Operating unit exists          | H   | KSEF-013 | resolves in `HR_OPERATING_UNITS`                                              | HARD |
| 8  | Operating unit authorised      | H   | KSEF-013 | ∈ {PL (431)…, PL (432)…}                                                       | HARD |
| 9  | Supplier active                | H   | KSEF-011 | `AP_SUPPLIERS` enabled + not end-dated (via site)                             | HARD |
| 10 | Supplier site valid            | H   | KSEF-012 | `AP_SUPPLIER_SITES_ALL` by vendorSiteId, active, in OU                        | HARD |
| 11 | Site is Pay Site               | H   | KSEF-012 | `pay_site_flag = 'Y'`                                                          | HARD |
| 12 | vendorId cross-check           | H   | KSEF-011 | payload vendorId (if present) = site-derived vendor                           | HARD |
| 13 | Legal entity present           | H   | KSEF-027 | OU has `default_legal_context_id`                                             | HARD |
| 14 | Business unit consistency      | H   | KSEF-026 | line vendorSiteId matches header (BU/OU consistency)                          | HARD |
| 15 | Invoice source registered      | H   | KSEF-028 | `AP_LOOKUP_CODES` type SOURCE, enabled                                        | HARD |
| 16 | Invoice date valid             | H   | KSEF-015 | valid MMDDYYYY (parsed non-null) and ≤ today + tol                            | HARD |
| 17 | Accounting/GL period open      | H   | KSEF-016 | `GL_PERIOD_STATUSES` app 200 status ∈ {O,F} for gl/invoice date              | HARD |
| 18 | Invoice amount present + sign  | H   | KSEF-018 | not null; CREDIT<0, STANDARD≥0                                                 | HARD |
| 19 | Line amount present + sign     | L   | KSEF-019 | not null; CREDIT≤0, STANDARD≥0                                                 | HARD |
| 20 | Header/line balance            | H/L | KSEF-024 | Σ line amount = invoiceAmount ± 0.01                                          | HARD |
| 21 | Duplicate invoice (staging)    | H   | KSEF-017 | no prior IMPORTED HDR_STG with same ksefNumber                                | HARD |
| 22 | Duplicate invoice (live AP)    | H   | KSEF-017 | no `AP_INVOICES_ALL` with same vendor+invoice_num+org                         | HARD |
| 23 | KSeF number format             | H   | KSEF-025 | present, length ≤ 50                                                           | HARD |
| 24 | PO validation (header)         | H   | KSEF-020 | if poNumber: approved/open in `PO_HEADERS_ALL` for OU                         | HARD |
| 25 | PO validation (line)           | L   | KSEF-020 | if line poNumber: approved PO + line in `PO_LINES_ALL`                        | HARD |
| 26 | Distribution account (non-PO)  | L   | KSEF-021 | required + resolves to enabled, detail (non-summary) CCID via `FND_FLEX_EXT`  | HARD |
| 27 | Tax classification             | L   | KSEF-022 | if present, valid ZX/FND tax classification lookup                            | HARD |
| 28 | Trailer control total          | H   | KSEF-034 | `trailer.lineCount` = parsed line count (enforced in parser)                  | HARD |
| 29 | Attachment presence            | F   | KSEF-033 | `files[]` has ≥ 1 entry                                                        | HARD |
| 30 | Attachment MIME type           | F   | KSEF-032 | `mimeType = application/pdf` + `.pdf` extension                               | HARD |
| 31 | Base64 valid                   | F   | KSEF-029 | non-empty, matches `^[A-Za-z0-9+/]*={0,2}$`, decodes                          | HARD |
| 32 | PDF signature                  | F   | KSEF-030 | decoded starts `%PDF`, contains `%%EOF`                                       | HARD |
| 33 | PDF size                       | F   | KSEF-031 | between 100 B and 20 MB                                                        | HARD |
| 34 | Oracle AP interface validations| H/L | KSEF-040 | delegated to APXIIMPT; rejections captured from `AP_INTERFACE_REJECTIONS`     | HARD |

## Message style

Business-friendly, actionable, includes the offending value and (for lines)
the line number, e.g.:

```
[KSEF-012] Vendor site 55501 is not flagged as a Pay Site.
[KSEF-024] Sum of lines (12300) <> invoice amount (12100).
[KSEF-021] Line 2: account "128.1280575.3131.806502.000.0000" is invalid / disabled / summary.
```

## Sequencing

Checks 1–27 run in `XXTJX_KSEF_VALID_PKG.validate_header` **before** import so a
bad invoice never reaches the interface. Check 34 is post-submit reconciliation.
Attachment checks 29–33 are pre-screened in validation (cheap decode of the
payload) and re-verified in the attach phase (defence in depth).
