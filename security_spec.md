# Firestore Security Spec

## 1. Data Invariants
- Assistants: Read public, Write only by owner.
- Prospects: Write only via secure proxy. Public reads disabled.

## 2. Dirty Dozen Payloads
- Attempt to create prospect with arbitrary ID.
- Attempt to set userId on prospect.
- Attempt to read prospects.

## 3. Test Runner
(Placeholder for test code)
