# Member login (Phone OTP) — Firebase (configured)

Project: **aldewaniah-45158**. Phone auth, authorized domains
(`app.aldewaniah.com`, `abosallom.github.io`), Firestore `members`
collection and security rules are already set up. Billing is on the
Blaze plan, so real SMS codes are sent.

## Add / remove members ("active directory")
Firebase Console → Firestore → `members`. One document per member,
Document ID = full international phone (e.g. `+9665XXXXXXXX`):
- `name` (string)
- `status` (string) = `"pending"` or `"approved"`
- `admin` (boolean) — `true` for an admin (optional)
- `createdAt` (timestamp)

New members sign in, enter a name, and a `pending` request is created
for an admin to approve from the Admin tab. Delete a member's document
to revoke access.

> Note: a legacy `approved: true` boolean is still honored for old
> documents, but new members use the `status` field above.

## Real SMS
Codes are sent via Firebase Phone Auth (Blaze plan, a few cents per
login). There is **no test/bypass number** — every login uses a real
SMS code. Keep a billing budget cap set as a safety net.
