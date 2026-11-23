# DMARC monitoring handoff

The DNS check on 2026-11-19 returned this record for
`_dmarc.coimbatorejobs.in`:

```text
v=DMARC1; p=none;
```

There is no aggregate-report destination (`rua`) in that record. Backend code
cannot change this DNS record. Do not mark monitoring complete until reports
are actually received and reviewed.

## Domain/email administrator actions

1. Confirm which domains are used in production mail's From header. The mailer
   defaults to `hr@coimbatorejobs.in` in production.
2. Choose and provision a monitored aggregate-report mailbox or reporting
   service. Confirm its exact address before editing DNS.
3. Update the existing TXT record, rather than creating a second DMARC record:

   ```text
   v=DMARC1; p=none; rua=mailto:<confirmed-report-address>;
   ```

   Replace the placeholder with the confirmed address. A reporting service on
   another domain may also require external-reporting DNS authorization.
4. Verify the published TXT record after propagation. Check that real reports
   arrive and someone is assigned to review them. Reports can take days to
   appear and depend on recipients' reporting support and actual mail volume.
5. Check SPF/DKIM alignment on legitimate registration, password-reset,
   notification and receipt emails. Review reports before moving to
   `p=quarantine` or `p=reject`, so legitimate mail is not rejected.

Reference: https://support.google.com/a/answer/10032473

## Current completion criteria

- Backend: allowed origins work; disallowed origins receive controlled 403;
  no-Origin private requests without a valid token receive 401.
- DNS: report destination provisioned and published; actual aggregate reports
  received and reviewed. This requires the domain/email administrator.
