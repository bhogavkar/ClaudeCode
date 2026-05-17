PROCEDURE create_supplier
AS
   CURSOR lcu_supplier
   IS
      SELECT s.vendor_name             AS supplier_name,
             s.vendor_name_alt         AS supplier_alternate_name,
             s.segment1                AS supplier_number,
             s.vendor_type_lookup_code AS supplier_classification,
             s.employee_id,
             s.federal_reportable_flag AS wht,
             s.terms_id,
             s.set_of_books_id,
             s.payment_currency_code,
             s.invoice_currency_code,
             ss.vendor_site_code       AS supplier_site,
             ss.org_id,
             ss.country,
             ss.address_line1,
             ss.address_line2,
             ss.address_line3,
             ss.city,
             ss.state,
             ss.province,
             ss.county,
             ss.zip,
             ss.phone,
             ss.fax,
             ss.email_address
        FROM ap_suppliers           s,
             ap_supplier_sites_all  ss
       WHERE s.vendor_id = ss.vendor_id
         AND s.vendor_type_lookup_code = 'EMPLOYEE'
         AND s.employee_id IS NOT NULL;

   lr_supplier_rec        ap_vendor_pub_pkg.r_vendor_rec_type;
   lr_supplier_site_rec   ap_vendor_pub_pkg.r_vendor_site_rec_type;
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
         lc_error_flag := 'N';
      ELSE
         lc_error_flag := 'Y';
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

      --call api for vendor site
      IF lc_error_flag = 'N'
      THEN
         ln_msg_count := 0;
         lc_api_return_status := NULL;
         lc_msg_data := NULL;
         lr_supplier_site_rec.vendor_id := ln_vendor_id;
         lr_supplier_site_rec.vendor_site_code := lcsr_supp.supplier_site;
         lr_supplier_site_rec.org_id := lcsr_supp.org_id;
         lr_supplier_site_rec.address_line1 := lcsr_supp.address_line1;
         lr_supplier_site_rec.address_line2 := lcsr_supp.address_line2;
         lr_supplier_site_rec.address_line3 := lcsr_supp.address_line3;
         lr_supplier_site_rec.city := lcsr_supp.city;
         lr_supplier_site_rec.state := lcsr_supp.state;
         lr_supplier_site_rec.province := lcsr_supp.province;
         lr_supplier_site_rec.county := lcsr_supp.county;
         lr_supplier_site_rec.zip := lcsr_supp.zip;
         lr_supplier_site_rec.country := lcsr_supp.country;
         lr_supplier_site_rec.phone := lcsr_supp.phone;
         lr_supplier_site_rec.fax := lcsr_supp.fax;
         lr_supplier_site_rec.email_address := lcsr_supp.email_address;
         lr_supplier_site_rec.terms_id := lcsr_supp.terms_id;
         lr_supplier_site_rec.default_terms_id := lcsr_supp.terms_id;
         v_n_msg_index_out := NULL;

         ap_vendor_pub_pkg.create_vendor_site
                           (p_api_version           => 1.0,
                            p_init_msg_list         => fnd_api.g_false,
                            p_commit                => fnd_api.g_false,
                            p_validation_level      => fnd_api.g_valid_level_full,
                            x_return_status         => lc_api_return_status,
                            x_msg_count             => ln_msg_count,
                            x_msg_data              => lc_msg_data,
                            p_vendor_site_rec       => lr_supplier_site_rec,
                            x_vendor_site_id        => ln_vendor_site_id,
                            x_party_site_id         => ln_party_site_id,
                            x_location_id           => ln_location_id
                           );

         IF (    lc_api_return_status = fnd_api.g_ret_sts_success
             AND lc_msg_data IS NULL
            )
         THEN
            DBMS_OUTPUT.put_line
                 ('Successful creation Of Employee Supplier Site: ' || lcsr_supp.supplier_site
                  || ' (vendor_site_id: ' || ln_vendor_site_id || ')');
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
      END IF;
   END LOOP;
EXCEPTION
   WHEN OTHERS
   THEN
      NULL;
--display message you want
END create_supplier;
