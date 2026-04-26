--------------------------------------------------------------------------------
-- File         : xx_wd_concurrent_program.sql
-- Purpose      : Register the executable, parameter value-sets, concurrent
--                program, and request-group for the Workday Associate /
--                Supplier / Expense Report integration.
-- Run as       : APPS
-- EBS Release  : 12.2.12
-- Notes        : Adjust SHORT_NAMEs if your customization standard differs.
--                Re-runnable - drops existing definitions before re-creating.
--------------------------------------------------------------------------------
WHENEVER SQLERROR EXIT FAILURE ROLLBACK;
SET DEFINE OFF;
SET SERVEROUTPUT ON SIZE UNLIMITED;

DECLARE
    PROCEDURE drop_program(p_short VARCHAR2) IS
    BEGIN
        FND_PROGRAM.delete_program(program_short_name => p_short,
                                   application        => 'XXCUST');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PROCEDURE drop_executable(p_short VARCHAR2) IS
    BEGIN
        FND_PROGRAM.delete_executable(executable_short_name => p_short,
                                      application           => 'XXCUST');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
BEGIN
    drop_program('XX_WD_EMP_SUP_IMPORT');
    drop_executable('XX_WD_EMP_SUP_IMPORT');
END;
/

-- 1) Executable ---------------------------------------------------------------
BEGIN
    FND_PROGRAM.executable
    (
        executable        => 'Workday Employee/Supplier/Expense Import',
        application       => 'XXCUST',
        short_name        => 'XX_WD_EMP_SUP_IMPORT',
        description       => 'PL/SQL stored procedure XX_WD_EMP_SUPPLIER_PKG.MAIN',
        execution_method  => 'PL/SQL Stored Procedure',
        execution_file_name => 'XX_WD_EMP_SUPPLIER_PKG.MAIN'
    );
    COMMIT;
END;
/

-- 2) Concurrent program -------------------------------------------------------
BEGIN
    FND_PROGRAM.register
    (
        program_short_name      => 'XX_WD_EMP_SUP_IMPORT',
        application             => 'XXCUST',
        enabled                 => 'Y',
        short_name              => 'XX_WD_EMP_SUP_IMPORT',
        program_name            => 'Workday Employee/Supplier/Expense Import',
        description             => 'Validates Workday staging data, creates '||
                                   'missing HR employees and matching '||
                                   'employee-suppliers, loads expense reports '||
                                   'into AP_INVOICES_INTERFACE, and submits '||
                                   'Payables Open Interface Import.',
        executable_short_name   => 'XX_WD_EMP_SUP_IMPORT',
        executable_application  => 'XXCUST',
        execution_options       => NULL,
        priority                => 50,
        save_output             => 'Y',
        print                   => 'N',
        cols                    => 132,
        rows                    => 60,
        style                   => 'A4',
        style_required          => 'N',
        run_alone               => 'N',
        output_type             => 'TEXT',
        enable_trace            => 'N',
        restart                 => 'Y',
        nls_compliant           => 'Y',
        icon_name               => NULL,
        language_code           => 'US',
        mls_function_short_name => NULL,
        use_in_srs              => 'Y',
        allow_disabled_values   => 'N',
        srw_driver              => NULL,
        request_type            => NULL,
        request_type_application=> NULL
    );
    COMMIT;
END;
/

-- 3) Parameters ---------------------------------------------------------------
BEGIN
    FND_PROGRAM.parameter
    (
        program_short_name => 'XX_WD_EMP_SUP_IMPORT',
        application        => 'XXCUST',
        sequence           => 10,
        parameter          => 'P_BUSINESS_GROUP_ID',
        description        => 'Optional. Business Group ID. NULL = derive per row from staging.',
        enabled            => 'Y',
        value_set          => 'XX_PER_BUSINESS_GROUPS_VS',  -- create or substitute
        default_type       => NULL,
        default_value      => NULL,
        required           => 'N',
        security_enabled   => 'N',
        range              => NULL,
        display            => 'Y',
        display_size       => 10,
        description_size   => 60,
        concatenated_description_size => 25,
        prompt             => 'Business Group',
        token              => 'P_BUSINESS_GROUP_ID'
    );

    FND_PROGRAM.parameter
    (
        program_short_name => 'XX_WD_EMP_SUP_IMPORT',
        application        => 'XXCUST',
        sequence           => 20,
        parameter          => 'P_RUN_MODE',
        description        => 'INS=create employees only. UPD=expense import only. BOTH=full.',
        enabled            => 'Y',
        value_set          => 'XX_WD_RUN_MODE_VS',           -- list of values: INS/UPD/BOTH
        default_type       => 'Constant',
        default_value      => 'BOTH',
        required           => 'Y',
        display            => 'Y',
        display_size       => 5,
        description_size   => 40,
        concatenated_description_size => 5,
        prompt             => 'Run Mode',
        token              => 'P_RUN_MODE'
    );

    FND_PROGRAM.parameter
    (
        program_short_name => 'XX_WD_EMP_SUP_IMPORT',
        application        => 'XXCUST',
        sequence           => 30,
        parameter          => 'P_BATCH_ID',
        description        => 'Optional. Loader batch ID. NULL = process all NEW rows.',
        enabled            => 'Y',
        value_set          => '60 Characters',
        default_type       => NULL,
        default_value      => NULL,
        required           => 'N',
        display            => 'Y',
        display_size       => 60,
        description_size   => 60,
        concatenated_description_size => 25,
        prompt             => 'Batch ID',
        token              => 'P_BATCH_ID'
    );

    FND_PROGRAM.parameter
    (
        program_short_name => 'XX_WD_EMP_SUP_IMPORT',
        application        => 'XXCUST',
        sequence           => 40,
        parameter          => 'P_DEBUG',
        description        => 'Y emits DEBUG-level rows to XX_WD_INTEGRATION_LOG.',
        enabled            => 'Y',
        value_set          => 'YES_NO',
        default_type       => 'Constant',
        default_value      => 'N',
        required           => 'Y',
        display            => 'Y',
        display_size       => 1,
        description_size   => 30,
        concatenated_description_size => 1,
        prompt             => 'Debug',
        token              => 'P_DEBUG'
    );

    COMMIT;
END;
/

-- 4) Request group attachment -------------------------------------------------
-- Attach to the standard "Payables Manager" request group; adjust as needed.
BEGIN
    FND_PROGRAM.add_to_group
    (
        program_short_name        => 'XX_WD_EMP_SUP_IMPORT',
        program_application       => 'XXCUST',
        request_group             => 'Payables Manager Request Group',
        group_application         => 'Payables'
    );
    COMMIT;
EXCEPTION WHEN OTHERS THEN
    DBMS_OUTPUT.put_line('add_to_group warning: '||SQLERRM);
END;
/

PROMPT Concurrent program XX_WD_EMP_SUP_IMPORT registered.
EXIT;
