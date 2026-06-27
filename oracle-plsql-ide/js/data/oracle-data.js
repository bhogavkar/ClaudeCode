/* =============================================================================
 * Oracle Knowledge Base
 * Central dataset powering syntax highlighting, IntelliSense, EBS awareness,
 * snippets and the offline AI assistant.
 * Exposed globally as window.OracleData
 * ============================================================================= */
(function (global) {
  'use strict';

  // ---- Reserved + PL/SQL keywords ------------------------------------------
  const KEYWORDS = [
    'ACCESS', 'ADD', 'ALL', 'ALTER', 'AND', 'ANY', 'AS', 'ASC', 'AT', 'BEGIN',
    'BETWEEN', 'BODY', 'BY', 'CASE', 'CHECK', 'CLOSE', 'CLUSTER', 'COLUMN',
    'COMMENT', 'COMMIT', 'COMPRESS', 'CONNECT', 'CONSTANT', 'CONSTRAINT',
    'CONTINUE', 'CREATE', 'CURRENT', 'CURSOR', 'DATABASE', 'DECLARE', 'DEFAULT',
    'DEFINER', 'DELETE', 'DESC', 'DISTINCT', 'DROP', 'EDITIONABLE', 'ELSE',
    'ELSIF', 'END', 'EXCEPTION', 'EXCLUSIVE', 'EXECUTE', 'EXISTS', 'EXIT',
    'FETCH', 'FOR', 'FORALL', 'FROM', 'FUNCTION', 'GOTO', 'GRANT', 'GROUP',
    'HAVING', 'IF', 'IMMEDIATE', 'IN', 'INDEX', 'INSERT', 'INTERSECT', 'INTO',
    'IS', 'JOIN', 'LEFT', 'LIKE', 'LOCK', 'LOOP', 'MERGE', 'MINUS', 'MODE',
    'NOCOPY', 'NOT', 'NULL', 'NULLS', 'OF', 'ON', 'OPEN', 'OPTION', 'OR',
    'ORDER', 'OUTER', 'PACKAGE', 'PARTITION', 'PIPELINED', 'PRAGMA', 'PRIOR',
    'PROCEDURE', 'PUBLIC', 'RAISE', 'RECORD', 'REF', 'REFERENCES', 'RENAME',
    'REPLACE', 'RETURN', 'RETURNING', 'REVOKE', 'RIGHT', 'ROLLBACK', 'ROW',
    'ROWNUM', 'ROWS', 'SAVEPOINT', 'SELECT', 'SEQUENCE', 'SET', 'SHARE',
    'START', 'SUBTYPE', 'SYNONYM', 'TABLE', 'THEN', 'TO', 'TRIGGER', 'TYPE',
    'UNION', 'UNIQUE', 'UPDATE', 'USING', 'VALUES', 'VIEW', 'WHEN', 'WHENEVER',
    'WHERE', 'WHILE', 'WITH', 'OVER', 'PARTITION', 'CROSS', 'INNER', 'FULL',
    'BULK', 'COLLECT', 'LIMIT', 'AUTHID', 'CURRENT_USER', 'DETERMINISTIC',
    'RESULT_CACHE', 'PIPE', 'CONNECT_BY_ROOT', 'PIVOT', 'UNPIVOT', 'KEEP',
    'WITHIN', 'MODEL', 'FOLLOWING', 'PRECEDING', 'UNBOUNDED', 'RANGE'
  ];

  // ---- Datatypes ------------------------------------------------------------
  const DATATYPES = [
    'NUMBER', 'VARCHAR2', 'VARCHAR', 'CHAR', 'NCHAR', 'NVARCHAR2', 'DATE',
    'TIMESTAMP', 'INTERVAL', 'CLOB', 'BLOB', 'NCLOB', 'BFILE', 'RAW', 'LONG',
    'BINARY_INTEGER', 'PLS_INTEGER', 'BOOLEAN', 'BINARY_FLOAT', 'BINARY_DOUBLE',
    'INTEGER', 'INT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'REAL',
    'ROWID', 'UROWID', 'XMLTYPE', 'SYS_REFCURSOR', 'REF CURSOR', 'SIMPLE_INTEGER',
    'NATURAL', 'NATURALN', 'POSITIVE', 'POSITIVEN', 'SIGNTYPE', 'STRING'
  ];

  // ---- Built-in SQL / PL-SQL functions -------------------------------------
  const FUNCTIONS = [
    'ABS', 'ACOS', 'ADD_MONTHS', 'ASCII', 'ASIN', 'ATAN', 'AVG', 'CAST',
    'CEIL', 'CHR', 'COALESCE', 'CONCAT', 'COS', 'COUNT', 'CURRENT_DATE',
    'CURRENT_TIMESTAMP', 'DECODE', 'DENSE_RANK', 'EMPTY_BLOB', 'EMPTY_CLOB',
    'EXP', 'EXTRACT', 'FIRST_VALUE', 'FLOOR', 'GREATEST', 'GROUP_ID',
    'INITCAP', 'INSTR', 'LAG', 'LAST_DAY', 'LAST_VALUE', 'LEAD', 'LEAST',
    'LENGTH', 'LISTAGG', 'LN', 'LOG', 'LOWER', 'LPAD', 'LTRIM', 'MAX', 'MEDIAN',
    'MIN', 'MOD', 'MONTHS_BETWEEN', 'NANVL', 'NEXT_DAY', 'NLS_INITCAP',
    'NLSSORT', 'NTILE', 'NULLIF', 'NVL', 'NVL2', 'POWER', 'RANK', 'RATIO_TO_REPORT',
    'REGEXP_COUNT', 'REGEXP_INSTR', 'REGEXP_LIKE', 'REGEXP_REPLACE',
    'REGEXP_SUBSTR', 'REPLACE', 'ROUND', 'ROW_NUMBER', 'RPAD', 'RTRIM', 'SIGN',
    'SIN', 'SOUNDEX', 'SQRT', 'STDDEV', 'SUBSTR', 'SUM', 'SYS_CONTEXT',
    'SYS_GUID', 'SYSDATE', 'SYSTIMESTAMP', 'TAN', 'TO_CHAR', 'TO_CLOB',
    'TO_DATE', 'TO_NUMBER', 'TO_TIMESTAMP', 'TRANSLATE', 'TRIM', 'TRUNC',
    'UPPER', 'USER', 'USERENV', 'VARIANCE', 'XMLAGG', 'XMLELEMENT', 'JSON_VALUE',
    'JSON_QUERY', 'JSON_TABLE', 'JSON_OBJECT', 'JSON_ARRAY'
  ];

  // ---- Built-in / supplied packages ----------------------------------------
  const BUILTIN_PACKAGES = {
    DBMS_OUTPUT: ['PUT_LINE', 'PUT', 'NEW_LINE', 'GET_LINE', 'ENABLE', 'DISABLE'],
    DBMS_SQL: ['OPEN_CURSOR', 'PARSE', 'EXECUTE', 'FETCH_ROWS', 'CLOSE_CURSOR', 'BIND_VARIABLE'],
    DBMS_LOB: ['GETLENGTH', 'READ', 'WRITE', 'APPEND', 'SUBSTR', 'INSTR', 'CREATETEMPORARY', 'FREETEMPORARY'],
    DBMS_SCHEDULER: ['CREATE_JOB', 'RUN_JOB', 'DROP_JOB', 'ENABLE', 'DISABLE'],
    DBMS_UTILITY: ['FORMAT_ERROR_STACK', 'FORMAT_ERROR_BACKTRACE', 'FORMAT_CALL_STACK', 'GET_TIME', 'COMMA_TO_TABLE'],
    DBMS_RANDOM: ['VALUE', 'STRING', 'RANDOM', 'NORMAL', 'SEED'],
    DBMS_METADATA: ['GET_DDL', 'GET_DEPENDENT_DDL', 'GET_GRANTED_DDL'],
    DBMS_STATS: ['GATHER_TABLE_STATS', 'GATHER_SCHEMA_STATS', 'GATHER_INDEX_STATS'],
    DBMS_APPLICATION_INFO: ['SET_MODULE', 'SET_ACTION', 'SET_CLIENT_INFO', 'READ_MODULE'],
    DBMS_ASSERT: ['SCHEMA_NAME', 'SIMPLE_SQL_NAME', 'SQL_OBJECT_NAME', 'ENQUOTE_LITERAL', 'ENQUOTE_NAME'],
    UTL_FILE: ['FOPEN', 'PUT_LINE', 'GET_LINE', 'FCLOSE', 'FFLUSH', 'IS_OPEN'],
    UTL_HTTP: ['BEGIN_REQUEST', 'GET_RESPONSE', 'READ_TEXT', 'END_RESPONSE'],
    UTL_SMTP: ['OPEN_CONNECTION', 'HELO', 'MAIL', 'RCPT', 'DATA', 'QUIT'],
    UTL_RAW: ['CAST_TO_RAW', 'CAST_TO_VARCHAR2', 'LENGTH', 'CONCAT'],
    APEX_UTIL: ['GET_SESSION_STATE', 'SET_SESSION_STATE', 'URL_ENCODE']
  };

  // ---- Oracle EBS modules + seeded objects ---------------------------------
  // module -> {desc, tables[], apis[]}
  const EBS = {
    FND: {
      desc: 'Application Object Library (foundation)',
      tables: ['FND_USER', 'FND_RESPONSIBILITY', 'FND_RESPONSIBILITY_TL',
        'FND_APPLICATION', 'FND_LOOKUP_VALUES', 'FND_FLEX_VALUES',
        'FND_CONCURRENT_REQUESTS', 'FND_CONCURRENT_PROGRAMS',
        'FND_REQUEST_GROUPS', 'FND_PROFILE_OPTIONS', 'FND_DOCUMENTS'],
      apis: ['FND_GLOBAL.USER_ID', 'FND_GLOBAL.RESP_ID', 'FND_GLOBAL.ORG_ID',
        'FND_GLOBAL.APPS_INITIALIZE', 'FND_PROFILE.VALUE', 'FND_PROFILE.PUT',
        'FND_REQUEST.SUBMIT_REQUEST', 'FND_FILE.PUT_LINE', 'FND_FILE.LOG',
        'FND_FILE.OUTPUT', 'FND_MESSAGE.SET_NAME', 'FND_MESSAGE.GET',
        'FND_API.G_TRUE', 'FND_API.G_FALSE', 'FND_CONC_GLOBAL.REQUEST_DATA']
    },
    AP: {
      desc: 'Accounts Payable',
      tables: ['AP_INVOICES_ALL', 'AP_INVOICE_LINES_ALL',
        'AP_INVOICE_DISTRIBUTIONS_ALL', 'AP_SUPPLIERS', 'AP_SUPPLIER_SITES_ALL',
        'AP_CHECKS_ALL', 'AP_PAYMENT_SCHEDULES_ALL', 'AP_INVOICE_PAYMENTS_ALL',
        'AP_HOLDS_ALL', 'AP_TERMS', 'AP_BANK_ACCOUNTS_ALL'],
      apis: ['AP_INVOICES_PKG.INSERT_ROW', 'AP_IMPORT_INVOICES_PKG.IMPORT_INVOICES',
        'AP_WEB_OA_MAINFLOW_PKG.GET_EXP_REPORT']
    },
    AR: {
      desc: 'Accounts Receivable',
      tables: ['RA_CUSTOMER_TRX_ALL', 'RA_CUSTOMER_TRX_LINES_ALL',
        'RA_CUST_TRX_TYPES_ALL', 'AR_CASH_RECEIPTS_ALL', 'AR_PAYMENT_SCHEDULES_ALL',
        'HZ_PARTIES', 'HZ_CUST_ACCOUNTS', 'HZ_CUST_SITE_USES_ALL', 'HZ_LOCATIONS'],
      apis: ['HZ_CUST_ACCOUNT_V2PUB.CREATE_CUST_ACCOUNT',
        'AR_RECEIPT_API_PUB.CREATE_CASH', 'HZ_PARTY_V2PUB.CREATE_ORGANIZATION']
    },
    GL: {
      desc: 'General Ledger',
      tables: ['GL_JE_HEADERS', 'GL_JE_LINES', 'GL_JE_BATCHES', 'GL_CODE_COMBINATIONS',
        'GL_BALANCES', 'GL_PERIODS', 'GL_LEDGERS', 'GL_INTERFACE'],
      apis: ['GL_JOURNAL_API_PKG.CREATE_JOURNAL', 'FND_FLEX_KEYVAL.VALIDATE_SEGS']
    },
    PO: {
      desc: 'Purchasing',
      tables: ['PO_HEADERS_ALL', 'PO_LINES_ALL', 'PO_LINE_LOCATIONS_ALL',
        'PO_DISTRIBUTIONS_ALL', 'PO_VENDORS', 'PO_REQUISITION_HEADERS_ALL',
        'PO_REQUISITION_LINES_ALL', 'RCV_TRANSACTIONS', 'RCV_SHIPMENT_HEADERS'],
      apis: ['PO_DOCUMENT_OPEN_INTERFACE.PROCESS', 'PO_REQS_CONTROL_SV.CONTROL_REQUISITION']
    },
    INV: {
      desc: 'Inventory',
      tables: ['MTL_SYSTEM_ITEMS_B', 'MTL_SYSTEM_ITEMS_TL', 'MTL_ONHAND_QUANTITIES_DETAIL',
        'MTL_MATERIAL_TRANSACTIONS', 'MTL_TRANSACTIONS_INTERFACE',
        'MTL_ITEM_CATEGORIES', 'MTL_PARAMETERS', 'MTL_SECONDARY_INVENTORIES'],
      apis: ['INV_ITEM_GRP.PROCESS_ITEM', 'INV_QUANTITY_TREE_PUB.QUERY_QUANTITIES']
    },
    HRMS: {
      desc: 'Human Resources',
      tables: ['PER_ALL_PEOPLE_F', 'PER_ALL_ASSIGNMENTS_F', 'PER_PERIODS_OF_SERVICE',
        'PAY_ELEMENT_ENTRIES_F', 'PER_JOBS', 'PER_GRADES', 'HR_ORGANIZATION_UNITS'],
      apis: ['HR_EMPLOYEE_API.CREATE_EMPLOYEE', 'HR_ASSIGNMENT_API.UPDATE_EMP_ASG']
    },
    OM: {
      desc: 'Order Management',
      tables: ['OE_ORDER_HEADERS_ALL', 'OE_ORDER_LINES_ALL', 'OE_TRANSACTION_TYPES_TL',
        'WSH_DELIVERY_DETAILS', 'WSH_NEW_DELIVERIES'],
      apis: ['OE_ORDER_PUB.PROCESS_ORDER', 'WSH_DELIVERIES_PUB.CREATE_UPDATE_DELIVERY']
    },
    WIP: { desc: 'Work In Process', tables: ['WIP_DISCRETE_JOBS', 'WIP_ENTITIES', 'WIP_OPERATIONS'], apis: ['WIP_MOVE_PUB.PROCESS_INTERFACE'] },
    BOM: { desc: 'Bills of Material', tables: ['BOM_BILL_OF_MATERIALS', 'BOM_INVENTORY_COMPONENTS', 'BOM_OPERATIONAL_ROUTINGS'], apis: ['BOM_BILL_OF_MTLS_API.PROCESS_BOM'] },
    FA: { desc: 'Fixed Assets', tables: ['FA_ADDITIONS_B', 'FA_BOOKS', 'FA_CATEGORIES_B', 'FA_DEPRN_SUMMARY'], apis: ['FA_ADDITION_PUB.DO_ADDITION'] },
    XXCUST: { desc: 'Custom (CEMLI) objects', tables: ['XXCUST_INTERFACE_STG', 'XXCUST_ERROR_LOG'], apis: ['XXCUST_UTIL_PKG.LOG_MESSAGE'] }
  };

  // Flatten all EBS table/api names for fast lookup + highlighting
  const EBS_TABLES = [];
  const EBS_APIS = [];
  Object.keys(EBS).forEach(function (m) {
    EBS[m].tables.forEach(function (t) { EBS_TABLES.push(t); });
    EBS[m].apis.forEach(function (a) { EBS_APIS.push(a); });
  });

  // ---- Common exceptions ----------------------------------------------------
  const EXCEPTIONS = [
    'NO_DATA_FOUND', 'TOO_MANY_ROWS', 'DUP_VAL_ON_INDEX', 'INVALID_CURSOR',
    'INVALID_NUMBER', 'VALUE_ERROR', 'ZERO_DIVIDE', 'CURSOR_ALREADY_OPEN',
    'STORAGE_ERROR', 'PROGRAM_ERROR', 'NOT_LOGGED_ON', 'LOGIN_DENIED',
    'TIMEOUT_ON_RESOURCE', 'ACCESS_INTO_NULL', 'COLLECTION_IS_NULL',
    'SUBSCRIPT_BEYOND_COUNT', 'SUBSCRIPT_OUTSIDE_LIMIT', 'CASE_NOT_FOUND',
    'SELF_IS_NULL', 'OTHERS'
  ];

  // ---- Pseudocolumns / session functions -----------------------------------
  const PSEUDO = ['SQL%ROWCOUNT', 'SQL%FOUND', 'SQL%NOTFOUND', 'SQL%ISOPEN',
    'SQL%BULK_ROWCOUNT', 'ROWID', 'ROWNUM', 'LEVEL', 'NEXTVAL', 'CURRVAL'];

  // ---- Code snippets (label -> {insertText with ${} tabstops, doc}) --------
  // insertText uses Monaco snippet syntax.
  const SNIPPETS = [
    {
      label: 'beginblock', detail: 'BEGIN .. EXCEPTION .. END',
      insert: 'BEGIN\n\t${1:-- code}\nEXCEPTION\n\tWHEN OTHERS THEN\n\t\t${2:NULL};\nEND;'
    },
    {
      label: 'declareblock', detail: 'Anonymous DECLARE block',
      insert: 'DECLARE\n\t${1:l_var}  ${2:VARCHAR2(100)};\nBEGIN\n\t${3:NULL};\nEXCEPTION\n\tWHEN OTHERS THEN\n\t\tDBMS_OUTPUT.PUT_LINE(SQLERRM);\nEND;'
    },
    {
      label: 'ifthen', detail: 'IF .. THEN .. END IF',
      insert: 'IF ${1:condition} THEN\n\t${2:NULL};\nEND IF;'
    },
    {
      label: 'ifelse', detail: 'IF .. ELSIF .. ELSE',
      insert: 'IF ${1:cond1} THEN\n\t${2:NULL};\nELSIF ${3:cond2} THEN\n\t${4:NULL};\nELSE\n\t${5:NULL};\nEND IF;'
    },
    {
      label: 'casewhen', detail: 'CASE .. WHEN .. END CASE',
      insert: 'CASE ${1:expr}\n\tWHEN ${2:val1} THEN ${3:NULL};\n\tWHEN ${4:val2} THEN ${5:NULL};\n\tELSE ${6:NULL};\nEND CASE;'
    },
    {
      label: 'forloop', detail: 'Numeric FOR loop',
      insert: 'FOR ${1:i} IN ${2:1} .. ${3:10} LOOP\n\t${4:NULL};\nEND LOOP;'
    },
    {
      label: 'cursorloop', detail: 'Cursor FOR loop',
      insert: 'FOR ${1:rec} IN (\n\tSELECT ${2:*}\n\t  FROM ${3:table_name}\n\t WHERE ${4:1 = 1}\n) LOOP\n\t${5:NULL};\nEND LOOP;'
    },
    {
      label: 'whileloop', detail: 'WHILE loop',
      insert: 'WHILE ${1:condition} LOOP\n\t${2:NULL};\nEND LOOP;'
    },
    {
      label: 'cursor', detail: 'Explicit cursor declaration',
      insert: 'CURSOR ${1:c_name} IS\n\tSELECT ${2:*}\n\t  FROM ${3:table_name}\n\t WHERE ${4:condition};'
    },
    {
      label: 'bulkcollect', detail: 'BULK COLLECT into collection',
      insert: 'SELECT ${1:col}\n  BULK COLLECT INTO ${2:l_tab}\n  FROM ${3:table_name}\n WHERE ${4:1 = 1};'
    },
    {
      label: 'forall', detail: 'FORALL bulk DML',
      insert: 'FORALL ${1:i} IN 1 .. ${2:l_tab}.COUNT\n\tINSERT INTO ${3:target} VALUES ${2:l_tab}(${1:i});'
    },
    {
      label: 'procedure', detail: 'Procedure definition',
      insert: 'PROCEDURE ${1:proc_name} (\n\t${2:p_param}  IN  ${3:VARCHAR2}\n) IS\nBEGIN\n\t${4:NULL};\nEXCEPTION\n\tWHEN OTHERS THEN\n\t\tRAISE;\nEND ${1:proc_name};'
    },
    {
      label: 'function', detail: 'Function definition',
      insert: 'FUNCTION ${1:fn_name} (\n\t${2:p_param}  IN  ${3:VARCHAR2}\n) RETURN ${4:VARCHAR2} IS\n\tl_result  ${4:VARCHAR2};\nBEGIN\n\t${5:RETURN l_result};\nEXCEPTION\n\tWHEN OTHERS THEN\n\t\tRAISE;\nEND ${1:fn_name};'
    },
    {
      label: 'packagespec', detail: 'Package specification (.pks)',
      insert: 'CREATE OR REPLACE PACKAGE ${1:pkg_name} AS\n\n\tPROCEDURE ${2:proc_name} (p_param IN VARCHAR2);\n\n\tFUNCTION ${3:fn_name} (p_param IN VARCHAR2) RETURN VARCHAR2;\n\nEND ${1:pkg_name};\n/'
    },
    {
      label: 'packagebody', detail: 'Package body (.pkb)',
      insert: 'CREATE OR REPLACE PACKAGE BODY ${1:pkg_name} AS\n\n\tPROCEDURE ${2:proc_name} (p_param IN VARCHAR2) IS\n\tBEGIN\n\t\tNULL;\n\tEND ${2:proc_name};\n\n\tFUNCTION ${3:fn_name} (p_param IN VARCHAR2) RETURN VARCHAR2 IS\n\tBEGIN\n\t\tRETURN NULL;\n\tEND ${3:fn_name};\n\nEND ${1:pkg_name};\n/'
    },
    {
      label: 'trigger', detail: 'Row-level trigger (.trg)',
      insert: 'CREATE OR REPLACE TRIGGER ${1:trg_name}\nBEFORE INSERT OR UPDATE ON ${2:table_name}\nFOR EACH ROW\nBEGIN\n\t${3:NULL};\nEND ${1:trg_name};\n/'
    },
    {
      label: 'ebslog', detail: 'EBS concurrent program logging',
      insert: 'FND_FILE.PUT_LINE(FND_FILE.LOG, ${1:\'message\'});\nFND_FILE.PUT_LINE(FND_FILE.OUTPUT, ${2:\'output line\'});'
    },
    {
      label: 'ebsinit', detail: 'EBS apps initialize',
      insert: 'FND_GLOBAL.APPS_INITIALIZE(\n\tuser_id      => ${1:l_user_id},\n\tresp_id      => ${2:l_resp_id},\n\tresp_appl_id => ${3:l_resp_appl_id});'
    },
    {
      label: 'submitreq', detail: 'Submit concurrent request',
      insert: 'l_request_id := FND_REQUEST.SUBMIT_REQUEST(\n\tapplication => ${1:\'XXCUST\'},\n\tprogram     => ${2:\'PROGRAM_SHORT_NAME\'},\n\tdescription => ${3:NULL},\n\tstart_time  => SYSDATE,\n\tsub_request => FALSE${4:});'
    }
  ];

  global.OracleData = {
    KEYWORDS: KEYWORDS,
    DATATYPES: DATATYPES,
    FUNCTIONS: FUNCTIONS,
    BUILTIN_PACKAGES: BUILTIN_PACKAGES,
    EBS: EBS,
    EBS_TABLES: EBS_TABLES,
    EBS_APIS: EBS_APIS,
    EXCEPTIONS: EXCEPTIONS,
    PSEUDO: PSEUDO,
    SNIPPETS: SNIPPETS
  };
})(window);
