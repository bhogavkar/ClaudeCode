PROCEDURE create_supplier
AS
   CURSOR lcu_supplier
   IS
      SELECT vendor_name             AS supplier_name,
             vendor_name_alt         AS supplier_alternate_name,
             segment1                AS supplier_number,
             vendor_type_lookup_code AS supplier_classification,
             employee_id,
             federal_reportable_flag AS wht,
             terms_id,
             set_of_books_id,
             payment_currency_code,
             invoice_currency_code
        FROM ap_suppliers
       WHERE vendor_type_lookup_code = 'EMPLOYEE'
         AND employee_id IS NOT NULL;

   lr_supplier_rec        ap_vendor_pub_pkg.r_vendor_rec_type;
BEGIN
   FOR lcsr_supp IN lcu_supplier
   LOOP
    --Validate according to the above validation
      ln_msg_count := 0;   --for error message count
      lr_supplier_rec.segment1 := lcsr_supp.supplier_number;
      lr_supplier_rec.vendor_name := lcsr_supp.supplier_name;
      lr_supplier_rec.vendor_name_alt := lcsr_supp.supplier_alternate_name;
      lr_supplier_rec.vendor_type_lookup_code := 'EMPLOYEE'; --employee supplier type
      lr_supplier_rec.employee_id := lcsr_supp.employee_id;
      lr_supplier_rec.terms_id := lcsr_supp.terms_id;
      lr_supplier_rec.set_of_books_id := lcsr_supp.set_of_books_id;
      lr_supplier_rec.payment_currency_code := lcsr_supp.payment_currency_code;
      lr_supplier_rec.invoice_currency_code := lcsr_supp.invoice_currency_code;

      ap_vendor_pub_pkg.create_vendor
                           (p_api_version           => 1.0,
                            p_init_msg_list         => fnd_api.g_false,
                            p_commit                => fnd_api.g_false,
                            p_validation_level      => fnd_api.g_valid_level_full,
                            x_return_status         => lc_api_return_status,
                            x_msg_count             => ln_msg_count, --error message count
                            x_msg_data              => lc_msg_data, --error message
                            p_vendor_rec            => lr_supplier_rec,
                            x_vendor_id             => ln_vendor_id, --vendor id created
                            x_party_id              => ln_party_id --party id created
                           );

      IF (    lc_api_return_status = fnd_api.g_ret_sts_success
          AND lc_msg_data IS NULL
         )
      THEN
         DBMS_OUTPUT.put_line ('Successful creation Of Employee Supplier: ' || lcsr_supp.supplier_name);
      ELSE
         IF ln_msg_count >= 1
         THEN
            FOR v_n_i IN 1 .. ln_msg_count
            LOOP
               pa_interface_utils_pub.get_messages
                                        (p_msg_data           => lc_msg_data,
                                         p_encoded            => 'F',
                                         p_msg_index          => ln_msg_count,
                                         p_data               => lc_msg_data,
                                         p_msg_count          => ln_msg_count,
                                         p_msg_index_out      => v_n_msg_index_out
                                        );
               DBMS_OUTPUT.put_line (   'ln_msg_count '
                                     || ln_msg_count
                                     || '.  lc_msg_data '
                                     || lc_msg_data
                                    );
            END LOOP;
         END IF;
      END IF;
   END LOOP;
EXCEPTION
   WHEN OTHERS
   THEN
      NULL;
--display message you want
END create_supplier;
