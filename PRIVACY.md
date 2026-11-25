# BuildThread privacy policy (draft)

This is a draft for the owner to review, host, and link from the app before store submission. The in-app link is a placeholder (`https://buildthread.app/privacy`, or `EXPO_PUBLIC_PRIVACY_POLICY_URL`) until that page exists. It is not legal advice.

**Who we are.** BuildThread is operated by the company named in the app’s company profile. Contact details for privacy requests will be the company email published with the hosted policy.

**Who the app is for.** BuildThread is for UK tradespeople recording evidence of their own jobs. It is not directed at children.

## Data the app collects

| Data | Why it is collected | Where it lives |
| --- | --- | --- |
| Account email and password | Sign-in. The password is handled by Firebase Authentication and is not stored in Firestore. | Firebase Authentication |
| Operative name, company name, phone, email, address, website, registration number, logo | Printed on job reports and, for the operative name, burned onto evidence photos. | Firestore `settings/{user id}`, logo in Cloud Storage |
| Project details | Client or agent name, site address, job reference, dates, and scope notes, so a report can be given to the client, a managing agent, or building control. | Firestore `projects` |
| Item or location name, item id, product, and batch | Identify the piece of work the photos belong to. | Firestore location documents |
| Photos | Before, during, and after evidence of the work. Photos can show the inside of a home and, incidentally, residents. | Cloud Storage, under the signed-in user’s folder. A stamped copy and the original are both kept. |
| Date and time | Device time at capture, and a server time written when the record is saved. A large difference between the two is flagged. | On the evidence record, and drawn on the stamped image |
| Precise location | Latitude and longitude (and accuracy when the device provides it) of compliance photos, so the evidence is geotagged. | On the evidence record, and drawn on the stamped image |
| SHA-256 hash of the original photo | To show whether the original file later changes. | On the evidence record |
| Audit log | Who created or corrected a record, and when, including a reason if a job is completed with a photo missing. | Firestore `projects/{id}/audit` |
| Offline queue | Photos waiting to upload, stored on the phone until the network returns. | The phone’s app storage |
| Reminder times | Optional alarms for the next photo stage. | The phone, and the notification is scheduled locally |

Gallery import is only offered on Quick Log. Those photos are labelled imported and unverified. Their time and GPS come from the file’s EXIF data. If EXIF has no time or GPS, the record says so. The app does not substitute the current time or the phone’s current position for an imported photo.

Compliance jobs only accept photos taken in the camera.

## Why this is allowed

The lawful basis for account, job, and evidence data is the contract with the tradesperson using the app, and the legitimate need to produce an accurate record of regulated work. Photos and precise location of a home are personal data. Where a photo shows a resident, the tradesperson needs their own lawful basis (typically the contract with the householder, or a legal duty to keep a work record) before taking it.

## Sharing

Reports are shared when the signed-in user exports a PDF and sends it themselves (for example to a client, managing agent, or building control). BuildThread does not sell personal data. Firebase (Google) processes the data as the hosting provider. The Firebase project should be in the UK or the EU. If it is not, transferring the data needs a UK GDPR transfer mechanism. That region is chosen in the Firebase console and is not set by this repository.

## How long it is kept

Evidence is kept so the job record can be shown later. The tradesperson can archive a project. Archiving keeps the photos and the audit log. Deleting the account removes the Authentication user and, after a deletion flag is set, deletes that user’s Firestore documents and Storage files from the app. Until the security rules are deployed, that deletion cannot be enforced on the server.

## Account and data deletion

The company profile screen includes **Delete account**. It asks for the password again, then deletes the user’s projects, evidence, audit log, settings, stored files, and Authentication account. This is required by Apple because the app lets people create an account, and it is how a user exercises the right to erasure.

## Rights

People whose homes or images are in a job record can ask the tradesperson for access, correction, or deletion. The signed-in user can export a PDF and can delete their account in the app. Correction of a submitted photo is a new evidence record. Submitted photos are not edited or deleted in normal use.

## Security

Access is limited to the signed-in user who owns the job. Evidence records are append-only in the security rules: they can be created, and they cannot be edited. Deletes of evidence are allowed only while an account-deletion flag is set, so the account-deletion flow can remove them. The phone can be lost or the Firebase rules can be deployed incorrectly. The owner needs to deploy `firestore.rules` and `storage.rules` and confirm the database region before the pilot.

## Changes

Replace this draft with the hosted policy and keep the in-app URL pointed at that page.
