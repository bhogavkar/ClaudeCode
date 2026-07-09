# 02 — Processing Flow & Sequence Diagrams

## 1. End-to-end processing flow

```mermaid
flowchart TD
    A[KSeF Portal] --> B[OpenText]
    B --> C[One JSON file per invoice]
    C --> D[[SFTP]]
    D --> E[/TMP folder/]
    E -->|existing TJX framework: archive copy| F[/PROCESS folder/]

    F --> G{Loader CP}
    G -->|name regex OK| H{JSON valid?}
    G -->|bad name| Q1[/ERROR folder/]:::err
    H -->|no| Q1
    H -->|yes| I{Duplicate hash?}
    I -->|yes| DUP[Mark DUPLICATE + archive .dup]:::warn
    I -->|no| J[Store raw JSON in XXTJX_KSEF_FILES<br/>status=LOADED + archive source]

    J --> K[Parser: JSON_TABLE → HDR_STG / LINE_STG<br/>+ attachment stub; trailer check]
    K --> L{Validation framework}
    L -->|FAIL| LF[HDR_STG validation_status=FAIL<br/>business-friendly error]:::err
    L -->|PASS| M[Populate AP_INVOICES_INTERFACE / LINES<br/>assign GROUP_ID]

    M --> N[[Submit APXIIMPT per OU + wait]]
    N --> O{Import result}
    O -->|rejected| OR[interface_status=REJECTED<br/>AP_INTERFACE_REJECTIONS reasons]:::err
    O -->|imported| P[ap_invoice_id captured<br/>interface_status=IMPORTED]

    P --> R[Attach: decode base64 → BLOB<br/>validate PDF → XXTJX_AP_ATTACHMENTS]
    R --> S{FND attach OK?}
    S -->|no| SE[upload_status=ATTACH_ERROR<br/>invoice kept, retried next run]:::warn
    S -->|yes| T[FND_ATTACHED_DOCUMENTS → AP_INVOICES<br/>file COMPLETED]

    T --> U[Post Processor summary report]
    LF --> U
    OR --> U
    SE --> U
    DUP --> U

    classDef err fill:#ffe0e0,stroke:#c00;
    classDef warn fill:#fff4d6,stroke:#c90;
```

## 2. Sequence diagram — happy path (single file)

```mermaid
sequenceDiagram
    autonumber
    participant CM as Concurrent Mgr
    participant MN as MAIN_PKG.run
    participant LD as LOADER_PKG
    participant PR as PARSER_PKG
    participant VL as VALID_PKG
    participant IM as IMPORT_PKG
    participant AP as APXIIMPT
    participant AT as ATTACH_PKG
    participant FND as FND Attachments
    participant LOG as LOG_PKG (autonomous)

    CM->>MN: run(P_PHASE=ALL)
    MN->>LD: main()
    LD->>LD: name regex, load CLOB, SHA-256, dedup
    LD->>LOG: INFO loaded file_id
    LD-->>MN: LOADED
    MN->>PR: parse_pending()
    PR->>PR: JSON_TABLE header + lines[*] + files[*]
    PR->>PR: trailer.lineCount == lines.count
    PR-->>MN: PARSED (bulk insert staging)
    MN->>VL: validate_pending()
    VL->>VL: 26 checks (supplier/site/OU/dates/dup/PO/COA/PDF...)
    VL-->>MN: PASS
    MN->>IM: import_validated()
    IM->>IM: insert AII / AILI, assign GROUP_ID
    IM->>AP: fnd_request.submit_request(APXIIMPT)
    AP-->>IM: request_id
    IM->>AP: fnd_concurrent.wait_for_request
    AP-->>IM: COMPLETE / NORMAL
    IM->>IM: reconcile → ap_invoice_id, IMPORTED
    IM-->>MN: imported=1
    MN->>AT: attach_pending()
    AT->>AT: base64→BLOB, %PDF sig, size, SHA-256
    AT->>FND: FND_LOBS + FND_DOCUMENTS + FND_ATTACHED_DOCUMENTS(AP_INVOICES)
    FND-->>AT: attached_document_id
    AT-->>MN: attached=1, file COMPLETED
    MN->>MN: post_process() → summary report
    MN-->>CM: retcode 0 (or 1 with exceptions)
```

## 3. Sequence diagram — replay / idempotency

```mermaid
sequenceDiagram
    autonumber
    participant LD as LOADER_PKG
    participant VL as VALID_PKG
    participant DB as XXTJX/AP tables

    Note over LD: Same file arrives again
    LD->>DB: SELECT file_id WHERE file_hash = :h
    DB-->>LD: existing file_id (hash UK)
    LD->>LD: mark DUPLICATE, archive .dup, DO NOT reload
    Note over VL: Even if a byte-changed variant slips past hash
    VL->>DB: COUNT AP_INVOICES_ALL by vendor+invoice_num
    VL->>DB: COUNT HDR_STG imported by ksef_number
    DB-->>VL: >0
    VL->>VL: FAIL [KSEF-017] duplicate → no second invoice
```

## 4. Error/exception routing (state)

```mermaid
stateDiagram-v2
    [*] --> NEW
    NEW --> LOADED : loader OK
    NEW --> REJECTED : bad file name
    NEW --> ERROR : invalid JSON
    NEW --> DUPLICATE : hash match
    LOADED --> PARSED : parser OK
    LOADED --> ERROR : parse/trailer fail
    PARSED --> VALIDATED : all hdr PASS
    PARSED --> ERROR : validation FAIL
    VALIDATED --> IMPORTED : APXIIMPT OK
    VALIDATED --> ERROR : AP rejection
    IMPORTED --> COMPLETED : PDF attached
    IMPORTED --> IMPORTED : attach ret/pending
    ERROR --> LOADED : operator re-drives after fix
    COMPLETED --> [*]
```
