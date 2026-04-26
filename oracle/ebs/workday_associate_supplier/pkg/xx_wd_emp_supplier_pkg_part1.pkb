-- ============================================================================
-- PART 1 OF 5 - START
-- File   : xx_wd_emp_supplier_pkg_part1.pkb
-- Content: Package body opener, private state, logging utility,
--          init_run, finalize_run.
-- Concat : Append parts 2..5 (in order) below the END marker of this file
--          to form the complete xx_wd_emp_supplier_pkg.pkb.
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY XX_WD_EMP_SUPPLIER_PKG AS

    -- ---------------------------------------------------------- private state
    g_request_id   NUMBER       := NVL(FND_GLOBAL.CONC_REQUEST_ID, -1);
    g_user_id      NUMBER       := NVL(FND_GLOBAL.USER_ID, -1);
    g_login_id     NUMBER       := NVL(FND_GLOBAL.LOGIN_ID, -1);
    g_resp_id      NUMBER       := FND_GLOBAL.RESP_ID;
    g_resp_appl_id NUMBER       := FND_GLOBAL.RESP_APPL_ID;
    g_batch_id     VARCHAR2(60);
    g_run_mode     VARCHAR2(10) := G_MODE_BOTH;
    g_bg_id        NUMBER;
    g_debug        BOOLEAN      := FALSE;
    g_summary_id   NUMBER;
    g_group_id     VARCHAR2(80);   -- AP_INVOICES_INTERFACE.GROUP_ID for this run

    -- Counters (drive the run-summary row)
    g_emp_total       NUMBER := 0;
    g_emp_created     NUMBER := 0;
    g_emp_existing    NUMBER := 0;
    g_emp_failed      NUMBER := 0;
    g_sup_created     NUMBER := 0;
    g_sup_failed      NUMBER := 0;
    g_exp_total       NUMBER := 0;
    g_exp_loaded      NUMBER := 0;
    g_exp_failed      NUMBER := 0;
    g_exp_val_err     NUMBER := 0;

    -- =========================================================================
    -- log_message
    --   Autonomous logger: writes a row to XX_WD_INTEGRATION_LOG and (when the
    --   level is INFO/WARN/ERROR) also echoes to the concurrent log so support
    --   doesn't have to query the table for the common path.
    -- =========================================================================
    PROCEDURE log_message
    (
        p_level       IN VARCHAR2,
        p_source      IN VARCHAR2,
        p_message     IN VARCHAR2,
        p_entity_type IN VARCHAR2 DEFAULT NULL,
        p_entity_key  IN VARCHAR2 DEFAULT NULL,
        p_oracle_err  IN VARCHAR2 DEFAULT NULL
    )
    IS
        PRAGMA AUTONOMOUS_TRANSACTION;
        l_emit_console BOOLEAN := (p_level <> G_LVL_DEBUG) OR g_debug;
    BEGIN
        IF p_level = G_LVL_DEBUG AND NOT g_debug THEN
            RETURN;                       -- suppress debug rows when not requested
        END IF;

        INSERT INTO XX_WD_INTEGRATION_LOG
        (
            LOG_ID, REQUEST_ID, BATCH_ID, LOG_LEVEL, LOG_SOURCE,
            ENTITY_TYPE, ENTITY_KEY, MESSAGE, ORACLE_ERROR,
            LOGGED_DATE, CREATED_BY
        )
        VALUES
        (
            XX_WD_INTEGRATION_LOG_S.NEXTVAL, g_request_id, g_batch_id, p_level, p_source,
            p_entity_type, p_entity_key, SUBSTR(p_message,1,4000), SUBSTR(p_oracle_err,1,4000),
            SYSTIMESTAMP, g_user_id
        );
        COMMIT;

        IF l_emit_console AND g_request_id > 0 THEN
            FND_FILE.PUT_LINE(
                FND_FILE.LOG,
                TO_CHAR(SYSTIMESTAMP,'HH24:MI:SS.FF3')||' ['||p_level||'] '||
                p_source||' '||
                CASE WHEN p_entity_type IS NOT NULL
                     THEN '<'||p_entity_type||':'||p_entity_key||'> '
                     ELSE NULL END||
                p_message
            );
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            -- Logging must never bring down the main run.
            ROLLBACK;
    END log_message;

    -- =========================================================================
    -- init_run - create the XX_WD_RUN_SUMMARY row and seed package state.
    -- =========================================================================
    PROCEDURE init_run
    (
        p_request_id IN NUMBER,
        p_batch_id   IN VARCHAR2,
        p_run_mode   IN VARCHAR2,
        p_bg_id      IN NUMBER,
        p_debug      IN VARCHAR2
    )
    IS
        l_bg_name VARCHAR2(60);
    BEGIN
        g_request_id := NVL(p_request_id, NVL(FND_GLOBAL.CONC_REQUEST_ID,-1));
        g_batch_id   := p_batch_id;
        g_run_mode   := UPPER(NVL(p_run_mode, G_MODE_BOTH));
        g_bg_id      := p_bg_id;
        g_debug      := (UPPER(NVL(p_debug,'N')) = 'Y');
        g_group_id   := 'WD_'||TO_CHAR(SYSDATE,'YYYYMMDDHH24MISS')||'_'||g_request_id;

        BEGIN
            SELECT name INTO l_bg_name
              FROM per_business_groups
             WHERE business_group_id = g_bg_id;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN l_bg_name := NULL;
        END;

        INSERT INTO XX_WD_RUN_SUMMARY
        (
            SUMMARY_ID, REQUEST_ID, BATCH_ID, RUN_MODE,
            BUSINESS_GROUP_ID, BUSINESS_GROUP_NAME,
            START_TIME, OVERALL_STATUS,
            CREATED_BY, CREATION_DATE
        )
        VALUES
        (
            XX_WD_RUN_SUMMARY_S.NEXTVAL, g_request_id, g_batch_id, g_run_mode,
            g_bg_id, l_bg_name,
            SYSTIMESTAMP, 'RUNNING',
            g_user_id, SYSDATE
        )
        RETURNING SUMMARY_ID INTO g_summary_id;
        COMMIT;

        log_message(G_LVL_INFO, 'init_run',
            'Started Workday integration. mode='||g_run_mode||
            ' batch='||NVL(g_batch_id,'<ALL_NEW>')||
            ' bg_id='||NVL(TO_CHAR(g_bg_id),'<per-row>')||
            ' debug='||NVL(p_debug,'N')||
            ' group_id='||g_group_id);
    END init_run;

    -- =========================================================================
    -- finalize_run - close out the run-summary row with totals + status.
    -- =========================================================================
    PROCEDURE finalize_run(p_request_id IN NUMBER)
    IS
        l_overall VARCHAR2(20);
    BEGIN
        IF (g_emp_failed + g_sup_failed + g_exp_failed + g_exp_val_err) = 0
           AND (g_emp_total + g_exp_total) > 0
        THEN
            l_overall := 'SUCCESS';
        ELSIF (g_emp_created + g_exp_loaded) > 0 THEN
            l_overall := 'PARTIAL';
        ELSIF (g_emp_total + g_exp_total) = 0 THEN
            l_overall := 'NO_DATA';
        ELSE
            l_overall := 'FAILED';
        END IF;

        UPDATE XX_WD_RUN_SUMMARY
           SET END_TIME           = SYSTIMESTAMP,
               EMP_TOTAL          = g_emp_total,
               EMP_CREATED        = g_emp_created,
               EMP_EXISTING       = g_emp_existing,
               EMP_FAILED         = g_emp_failed,
               SUP_CREATED        = g_sup_created,
               SUP_FAILED         = g_sup_failed,
               EXP_TOTAL          = g_exp_total,
               EXP_LOADED         = g_exp_loaded,
               EXP_FAILED         = g_exp_failed,
               EXP_VALIDATION_ERR = g_exp_val_err,
               OVERALL_STATUS     = l_overall
         WHERE SUMMARY_ID = g_summary_id;
        COMMIT;

        log_message(G_LVL_INFO, 'finalize_run',
            'Completed. status='||l_overall||
            ' emp_total='||g_emp_total||' emp_created='||g_emp_created||
            ' emp_existing='||g_emp_existing||' emp_failed='||g_emp_failed||
            ' sup_created='||g_sup_created||' sup_failed='||g_sup_failed||
            ' exp_total='||g_exp_total||' exp_loaded='||g_exp_loaded||
            ' exp_failed='||g_exp_failed||' exp_val_err='||g_exp_val_err);
    END finalize_run;

-- ============================================================================
-- PART 1 OF 5 - END
-- (do NOT add END package or trailing slash here - parts 2..5 continue)
-- ============================================================================
