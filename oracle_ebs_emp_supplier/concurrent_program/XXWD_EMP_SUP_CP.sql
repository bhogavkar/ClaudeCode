-- +=====================================================================+
-- |  File Name   : XXWD_EMP_SUP_CP.sql                                  |
-- |  Description : FNDLOAD-friendly registrations for the                |
-- |                Workday Employee Supplier Inbound concurrent program  |
-- |                using FND_PROGRAM API (alternative to LDT upload).    |
-- |  Module      : Oracle EBS R12.2.12 - Accounts Payable               |
-- +=====================================================================+

-- Run as APPS schema.
SET SERVEROUTPUT ON SIZE UNLIMITED

BEGIN
   --------------------------------------------------
   -- 1. Executable
   --------------------------------------------------
   FND_PROGRAM.executable
      ( executable      => 'XXWD_EMP_SUP_EXEC'
      , application     => 'Payables'
      , short_name      => 'XXWD_EMP_SUP_EXEC'
      , description     => 'Workday Employee Supplier Inbound Executable'
      , execution_method=> 'PL/SQL Stored Procedure'
      , execution_file_name => 'XXWD_EMP_SUPPLIER_PKG.main'
      );

   --------------------------------------------------
   -- 2. Concurrent program
   --------------------------------------------------
   FND_PROGRAM.register
      ( program        => 'Workday Employee Supplier Inbound'
      , application    => 'Payables'
      , enabled        => 'Y'
      , short_name     => 'XXWD_EMP_SUP_PRG'
      , description    => 'Creates EBS Employee Suppliers/Sites/Banks from Workday staging'
      , executable_short_name => 'XXWD_EMP_SUP_EXEC'
      , executable_application=> 'Payables'
      , output_type    => 'TEXT'
      , use_in_srs     => 'Y'
      );

   --------------------------------------------------
   -- 3. Parameters
   --------------------------------------------------
   FND_PROGRAM.parameter
      ( program_short_name => 'XXWD_EMP_SUP_PRG'
      , application        => 'Payables'
      , sequence           => 10
      , parameter          => 'P_ORG_ID'
      , description        => 'Operating Unit'
      , enabled            => 'Y'
      , value_set          => 'XX_OPERATING_UNITS'
      , default_type       => NULL
      , default_value      => NULL
      , prompt             => 'Operating Unit'
      , token              => 'P_ORG_ID'
      , required           => 'Y'
      , display            => 'Y'
      , display_size       => 15
      , description_size   => 60
      , concatenated_description_size => 25
      , prompt_size        => 25
      );

   FND_PROGRAM.parameter
      ( program_short_name => 'XXWD_EMP_SUP_PRG'
      , application        => 'Payables'
      , sequence           => 20
      , parameter          => 'P_BATCH_ID'
      , description        => 'Batch Id'
      , enabled            => 'Y'
      , value_set          => 'FND_NUMBER'
      , prompt             => 'Batch Id'
      , token              => 'P_BATCH_ID'
      , required           => 'N'
      , display            => 'Y'
      );

   FND_PROGRAM.parameter
      ( program_short_name => 'XXWD_EMP_SUP_PRG'
      , application        => 'Payables'
      , sequence           => 30
      , parameter          => 'P_EMPLOYEE_NUMBER'
      , description        => 'Employee Number filter'
      , enabled            => 'Y'
      , value_set          => 'FND_CHAR30'
      , prompt             => 'Employee Number'
      , token              => 'P_EMPLOYEE_NUMBER'
      , required           => 'N'
      , display            => 'Y'
      );

   FND_PROGRAM.parameter
      ( program_short_name => 'XXWD_EMP_SUP_PRG'
      , application        => 'Payables'
      , sequence           => 40
      , parameter          => 'P_DEBUG_FLAG'
      , description        => 'Debug Flag'
      , enabled            => 'Y'
      , value_set          => 'XX_YES_NO'
      , default_type       => 'Constant'
      , default_value      => 'N'
      , prompt             => 'Debug Flag'
      , token              => 'P_DEBUG_FLAG'
      , required           => 'Y'
      , display            => 'Y'
      );

   FND_PROGRAM.parameter
      ( program_short_name => 'XXWD_EMP_SUP_PRG'
      , application        => 'Payables'
      , sequence           => 50
      , parameter          => 'P_REPROCESS_ERRORS'
      , description        => 'Re-process ERROR records'
      , enabled            => 'Y'
      , value_set          => 'XX_YES_NO'
      , default_type       => 'Constant'
      , default_value      => 'N'
      , prompt             => 'Reprocess Errors?'
      , token              => 'P_REPROCESS_ERRORS'
      , required           => 'Y'
      , display            => 'Y'
      );

   --------------------------------------------------
   -- 4. Incompatibility - prevent overlapping runs
   --------------------------------------------------
   FND_PROGRAM.incompatibility
      ( program_short_name      => 'XXWD_EMP_SUP_PRG'
      , application             => 'Payables'
      , inc_prog_short_name     => 'XXWD_EMP_SUP_PRG'
      , inc_prog_application    => 'Payables'
      , running_type            => 'G'
      );

   --------------------------------------------------
   -- 5. Request group assignment
   --------------------------------------------------
   FND_PROGRAM.add_to_group
      ( program_short_name      => 'XXWD_EMP_SUP_PRG'
      , program_application     => 'Payables'
      , request_group           => 'Payables Inbound Interfaces'
      , group_application       => 'Payables'
      );

   COMMIT;
   DBMS_OUTPUT.put_line('Concurrent Program XXWD_EMP_SUP_PRG registered successfully.');
EXCEPTION
   WHEN OTHERS THEN
      ROLLBACK;
      DBMS_OUTPUT.put_line('Registration failed: '||SQLERRM);
      RAISE;
END;
/
