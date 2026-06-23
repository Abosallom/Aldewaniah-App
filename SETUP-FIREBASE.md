# Member login (Phone OTP) — Firebase (configured)

Project: **aldewaniah-45158**. Phone auth, authorized domain
(abosallom.github.io), Firestore `members` collection and security
rules are already set up.

## Add / remove members ("active directory")
Firebase Console → Firestore → `members`. One document per member,
Document ID = full international phone (e.g. `+966500000000`):
- `name` (string)
- `approved` (boolean) = `true`
Delete a member's document to revoke access.

## Test login (no real SMS)
Test number **+966500000000**, code **123456**.

## Real SMS
Sending codes to other members needs Firebase's Blaze (pay-as-you-go)
plan — a few cents per login. Set a budget cap.
