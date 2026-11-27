-- Apply after the schema-only D1 snapshot, to the isolated rehearsal database.
CREATE TABLE _billing_authority(id INTEGER PRIMARY KEY, mode TEXT NOT NULL);
INSERT INTO _billing_authority VALUES (1, 'd1-authoritative-v1');

CREATE TABLE _billing_rehearsal(id INTEGER PRIMARY KEY, mode TEXT NOT NULL);
INSERT INTO _billing_rehearsal VALUES (1, 'stripe-fixtures-only');

INSERT INTO _auth_users VALUES ('5da718a5-f971-4944-a61b-8734c0767d29');
INSERT INTO users_profile(id, email, primary_role)
VALUES ('5da718a5-f971-4944-a61b-8734c0767d29', 'billing@example.invalid', 'trade');
INSERT INTO organizations(id, name, slug)
VALUES ('0edfcabe-6f55-43d2-aab7-f9ab454c90f4', 'Billing rehearsal', 'billing-rehearsal');
INSERT INTO organization_members(id, organization_id, user_id, role)
VALUES ('billing-rehearsal-owner', '0edfcabe-6f55-43d2-aab7-f9ab454c90f4', '5da718a5-f971-4944-a61b-8734c0767d29', 'owner');
