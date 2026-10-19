-- Polly's auto-find puts everything it finds in the bank as a draft for the admin to approve or reject.
UPDATE polly_meta SET value = '0' WHERE key = 'auto_approve';
