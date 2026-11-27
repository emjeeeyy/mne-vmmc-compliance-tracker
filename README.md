# VMMC TB DOTS & Pulmonary Compliance Registry

**Veterans Memorial Medical Center · occupational-health surveillance for hospital personnel**

This README has four parts: an **overview** of the system, a **user's manual** for each kind of user, a **guide for User Acceptance Testing (UAT)** so you can try the system yourselves, and the **working test accounts**.

*Last updated: 27 November 2026.*

> **Live site:** `[ ADD THE LIVE SITE ADDRESS HERE ]`
> Use **Google Chrome or Microsoft Edge** (latest version). The site also works on a phone.

---

## Contents

1. [Overview of the system](#1-overview-of-the-system)
2. [Getting started: signing in and the test accounts](#2-getting-started-signing-in-and-the-test-accounts)
3. [User's manual](#3-users-manual)
4. [UAT guide: try it yourself](#4-uat-guide-try-it-yourself)
5. [Glossary](#5-glossary)
6. [For the project team](#6-for-the-project-team)

---

## 1. Overview of the system

### 1.1 What it is

Hospital personnel who work around patients must be screened for tuberculosis (TB) and related health risks. VMMC needs to know, at any moment, **who is cleared, who is due, who is overdue, and who needs urgent clinical attention**. This system does that job.

It tracks four things for every employee:

| Module | What is tracked |
|---|---|
| **1. Annual Physical Exam (APE)** | The yearly chest X-ray and/or GeneXpert (sputum) result, tied to each employee's **birth month** |
| **2. Pre-Employment Clearance** | The baseline skin or blood test recorded before the person starts work |
| **3. Exposure (PEP) Logs** | Airborne exposures and the follow-up of post-exposure prophylaxis |
| **4. Quarterly Immunizations** | Vaccine doses and when the next dose is due |

On top of the records there is a **monitoring engine** that checks every employee's timeline, sends reminders on its own, raises an alert the moment a result is positive, and escalates problems to the right person. People do not have to remember to chase anyone; the system does it and keeps a record of everything it did.

### 1.2 Who uses it

| Role | Who they are | What they can do |
|---|---|---|
| **Staff** | Any hospital employee | See their own clearance status and deadlines, upload their health documents, read their notifications, manage their own account |
| **Unit Head** | A department supervisor | Everything staff can do, plus see the clearance status of **their own department's** staff and act on escalations for their department |
| **Administrator** (TB DOTS Program Administrator) | The person who runs the TB program | See **everyone**, verify and approve or reject documents (with a saved digital signature), maintain the four health modules, run reminders and scans, review change requests, and read the system-wide audit trail |

Only the Administrator can approve or reject a document. A unit head can see and follow up, but cannot clear their own staff.

### 1.3 A year in the life of one employee

The annual exam follows the employee's **birth month**. This is the schedule the system enforces:

```
 14 days before the birthday   Window opens. First reminder (in-app, text message and email).
 On the birthday               "Your exam is due" reminder if nothing has been submitted.
 Every 7 days after that       Weekly reminders until the person is cleared.
 Last day of the birth month   DEADLINE. If still not cleared the person becomes OVERDUE
                               and the case is escalated to the unit head and administrator.
 90+ days past the birthday    A final notice is sent and the case is escalated again.

 Whenever a document is approved:
   negative result (X-ray "Cleared" / GeneXpert "Not detected")  ->  the person is COMPLIANT
   positive result (X-ray "Infiltrate" / GeneXpert "Detected")   ->  CRITICAL clinical alert
                                                                      sent immediately and escalated
```

How a typical cycle goes:

1. The employee uploads their exam document (PDF, PNG or JPEG).
2. The administrator opens it, reads it, **records the result** (the employee does not enter results), adds findings, and approves it with their digital signature, or sends it back with a reason.
3. The system updates the employee's status, notifies them, and (if the result is positive) raises the alert and escalates.
4. A printable **Clearance Certificate** is available for anyone who is cleared.

The system also checks every night at midnight (Philippine time) and the administrator can run the same check on demand with **Run Compliance Scan**. Running it twice never sends duplicate messages.

### 1.4 Notifications and escalations

Every message belongs to one of three levels:

| Level | Meaning | Example | Where it is sent |
|---|---|---|---|
| **Informational** | Good news or a record update | "Your clearance was recorded" | In-app |
| **Warning** | Action is coming up | First reminder, birthday reminder, weekly reminder | In-app, text message, email |
| **Exception** | Something is wrong | Overdue, three-month notice, positive result | In-app, text message, email **and an escalation** to the unit head and administrator |

Escalations appear on the unit head's dashboard and on the administrator's Notifications page, where they can be **Acknowledged** and later **Marked Resolved**.

### 1.5 Security and privacy

- Signing in needs the **password and a 6-digit code emailed to the account** (two-factor authentication). It is on for every account.
- The sign-in is held in a secure, protected cookie. A session lasts up to **60 minutes**.
- **Access is enforced by the server**, not just by hiding buttons: a staff member cannot read another person's records even by typing an address by hand.
- Uploaded documents are stored privately and opened only through short-lived links (about 5 minutes).
- **Every action is recorded** in an append-only audit log that nobody can edit or delete. Staff can see their own activity; the administrator can see the whole system's.
- The system follows the principles of the Data Privacy Act (RA 10173). A **Privacy Notice** page is available from the sign-up screen. Its wording describes what the system does today; the official controller details, retention period and privacy-office contact must still be confirmed by VMMC's Data Protection Officer before it is treated as final policy.

### 1.6 Technology (for reference)

| Part | Technology |
|---|---|
| Web application | Next.js (React) with Tailwind CSS, responsive for desktop, tablet and phone |
| Server (API) | NestJS (REST API) |
| Database, sign-in and file storage | Supabase (PostgreSQL) |
| Email | Brevo (HTTPS API) |
| Text messages | Semaphore (when switched on; see [Known limitations](#45-known-limitations)) |
| Hosting | Vercel (web app) and Railway (server) |
| Automated tests | 223 server unit tests, 109 web unit tests, 20 end-to-end tests |

---

## 2. Getting started: signing in and the test accounts

### 2.1 Signing in

1. Open the live site. You see the sign-in page with two tabs: **Staff Login** and **Admin Login**.
2. Choose the correct tab. **Staff and Unit Head accounts use the Staff tab. Only the Administrator uses the Admin tab.** Using the wrong tab is refused.
3. Type the **Employee ID** (letters can be typed in lower case; the field shows capitals) and the **password**, then press **Log in as Staff** (or **Log in as Admin**).
4. The system emails a **6-digit code** to the address registered to that account. Type or paste it into the six boxes (a space in the middle is fine, for example `482 913`), then press **Verify & Log In**.
   - The code works **once** and is valid for **10 minutes**.
   - Five wrong tries lock that code. Press **Back to login** and start again.
   - **Resend code** becomes available 30 seconds after a code is sent. A new code cancels the older one.
5. You land on your dashboard. Use **Log out** to leave. After 60 minutes you will need to sign in again.

> **Important for UAT: where the code goes.** The test accounts below use inboxes held by the project team. Have a team member on call to read the code to you, or ask the team to register your own email address so the code reaches you. Only the **newest** code works, so two people must not sign in to the **same** account at the same time.

### 2.2 Test accounts

**Test environment only.** All six accounts use the password **`asd123`**. Change nothing about these accounts' passwords or two-factor setting (see the UAT ground rules).

| Role | Sign in on tab | Employee ID | Password | Department and job title | Code is emailed to |
|---|---|---|---|---|---|
| **Staff** | Staff | `VMMC-25-0024` | `asd123` | OPD Nursing · Staff Nurse | capstone.stafftest@gmail.com |
| **Unit Head** | Staff | `VMMC-25-0025` | `asd123` | OPD Nursing · Nursing Unit Supervisor | capstone.unitheadtest@gmail.com |
| **Administrator** | **Admin** | `VMMC-25-0026` | `asd123` | Administration · TB Program Administrator | capstone.admintest@gmail.com |
| **Administrator** | **Admin** | `VMMC-25-0022` | `asd123` | Administration · TB Program Administrator | markjoseph.arambulo.cics@ust.edu.ph |
| Staff | Staff | `VMMC-25-0021` | `asd123` | Radiology · Radiologist | mjlor1126@gmail.com |
| Unit Head | Staff | `VMMC-25-0023` | `asd123` | Dietary · Dietary Unit Supervisor | emjeeyy.arambulo@gmail.com |

Notes on the accounts:

- **Best set for UAT:** the first three. The test staff member and test unit head are in the **same department (OPD Nursing)**, so the unit head sees that staff member, which is what you need to test escalations.
- **Approving documents needs a saved digital signature.** Administrator `VMMC-25-0022` already has one. Administrator `VMMC-25-0026` does **not** yet: sign in, open **Profile → Digital Signature**, and draw or upload one before approving.
- The names shown on screen for the test accounts are placeholders and may have been edited. Go by the Employee ID.
- The registry also contains about 20 **fictional demo employees** (26 active in total across Radiology, Dietary, Administration, TB DOTS Program and OPD Nursing). They exist so that the dashboards, charts and registry have realistic content. You cannot sign in as them, and email sent to them goes to made-up addresses.

### 2.3 Forgot your password / creating an account

- **Forgot Password** (on the sign-in page): enter your email address (or mobile number), type the code you receive, then choose a new password.
- **Create one here** (new staff): enter your official VMMC email, choose **Permanent** or **COS**, and tick that you have read the **Privacy Notice**. The system assigns your Employee ID and emails it to you with a temporary password, and asks you to set your own password the first time you sign in. This sends a real email, so for UAT use an address the team has agreed.

---

## 3. User's manual

### 3.1 Finding your way around

- **On a computer**, the pages are in the bar across the top. A **bell** shows how many unread notifications you have. Your name opens the account menu and Log out.
- **On a phone**, the same pages are in a bar along the bottom of the screen.
- Everyone has the same five-or-so pages; **what you see on each depends on your role**.

| | Staff and Unit Head | Administrator |
|---|---|---|
| Page 1 | **My Health Profile** (dashboard) | **Health Overview** (dashboard) |
| Page 2 | **Submit Health Documents** | **Document Verification** |
| Page 3 | **My Clearance & Logs** (unit head: the department registry) | **Modules Registry** |
| Page 4 | **Profile** | **Notifications** |
| Page 5 | (Notifications from the bell) | **Profile** |

### 3.2 Staff

#### My Health Profile (your dashboard)

Shows your **annual exam deadline**, whether your account is active, how many days remain, and **My Screening Progress**: a ring and checklist for the three requirements (Annual Physical Exam, Hepatitis B Titer, Immunization) showing which are verified, due or missing. **Submit File** takes you straight to the upload page.

#### Submit Health Documents

1. Choose a **category**: **1. Annual Physical Exam (APE)** or **2. Hepatitis B Titer**.
2. Enter a **Document Title**, the **Clinic / Facility Name**, and optional **Notes** for the reviewer.
3. Attach the file: **PDF, PNG or JPEG, up to 5 MB**. On a phone you can take a photo directly.
4. Press **Submit**.

You do **not** enter any test result. The TB DOTS administrator reads the document and records the result.

#### My Clearance & Logs

A table of everything you have submitted, with its status and who verified it:

| Status | Meaning |
|---|---|
| **Pending Verification** | Waiting for the administrator |
| **Verified & Cleared** | Approved. Your status is updated |
| **Rejected** | Sent back. The reason is shown. Submit a corrected file |

#### Notifications

The bell shows unread messages. Opening it (or the Notifications page) marks them as read. You can filter by **Alerts**, **Reminders** and **Updates**.

### 3.3 Unit Head

You have everything in the Staff section for your own health records, plus:

- **Escalations Requiring Attention** on your dashboard: cases in your department that are overdue, past three months, or clinically critical. Press **Acknowledge** to show you have seen one.
- **The department registry** (the clearance page): every staff member in **your department only**, with their chest X-ray and GeneXpert result, status and due date. Search by **name or Employee ID** and open a person for their record. On a phone the page is called **Tracker**.
- You **cannot approve or reject documents**. That is the administrator's job.

### 3.4 Administrator

#### Health Overview (dashboard)

- Headline numbers: **staff registered**, **clearance rate** against the previous cycle, **upcoming due (15 days)**, **action required (overdue)**.
- **Department Health Clearance Status**: one bar per department split into cleared, due soon and overdue. Hover (or tap) for the exact counts.
- **Screening Compliance Ratio**: a ring of the hospital-wide picture, with the **clearance target** (95%) beside the real rate.
- **Personnel Requiring Immediate Follow-up**: people who are overdue. **Send Reminder** emails and texts the person (once per person per 24 hours).
- **More Overview**: critical cases, annual progress by month with **View Detailed Analytics**, and **Reports** you can download as CSV: *Departmental Delinquency Log*, *Institutional Clearance Summary* and *Biological Exposure & Prophylaxis Matrix*.

#### Document Verification

1. The queue lists pending documents (staff, department, category, title, due date).
2. Press **View and verify** on a row. A window opens with the **actual file** on one side and your controls on the other.
3. Under **Your reading of the result**, record what you see:
   - Annual Physical Exam: **Chest X-ray** (*Cleared* or *Infiltrate*) and/or **GeneXpert** (*Not detected* or *Detected*)
   - Hepatitis B Titer: **Reactive** or **Non-reactive**
4. Add **findings notes**, then choose the decision:
   - **Approved and Mark Up to Date**: needs the result and your saved **digital signature**
   - **Request Re-upload**: needs a reason, which is shown to the staff member
5. Press save. The staff member is notified. A positive result raises the clinical alert and escalation straight away.

#### Modules Registry

Four tabs: **1. Annual Physical Exam**, **2. Pre-Employment Clearances**, **3. Exposure (PEP) Logs**, **4. Quarterly Immunizations**.

- **Search** by name, Employee ID or department, and **filter by status**: *Up to Date / Cleared*, *Upcoming / Due Soon*, *Action Required / Overdue*, *No Record*.
- **Add Health Record** adds a pre-employment record, an exposure log, or an immunization dose. Annual physical exams are **not** added here; they come from verified uploads.
- Row buttons: **CERT** (clearance certificate, for cleared people), **PRINT** (pre-employment record), **Record / Update**, **PEP Details**, **Update Log**.
- **Personnel Digital Health Passport Cards** at the bottom show each person at a glance and open their certificate.
- **Run Compliance Scan** makes the monitoring engine check everyone now and reports how many records it checked and how many new events it produced.
- On a **phone**, the Clearance page opens on the simple **Staff Directory**; switch to **Health Modules** for the full registry.

#### Notifications

The **Notification & Screening Reminder Engine**: what the system sends and when, a **Notification Dispatch Log** (every message sent and what happened on each channel, so a failed email or an unsent text is visible), **Escalations Requiring Attention** (Acknowledge, Mark Resolved), and the administrator's own notifications.

#### Profile

- **Digital Signature**: draw or upload a PNG. It is applied to every document you approve.
- **Change Requests**: review requests from staff to change a job title, birth date, employment status or department. **Approve** or **Reject**.
- **Review Performance**: how many documents you reviewed and approved.
- **System Activity & Audit Trail**: the recorded actions of everyone in the system, newest first, with **Load more**.
- **Login History** and the account settings listed in the next section.

### 3.5 Account and security (everyone)

Found under **Profile** (on a phone: **Account Security** and **Privacy & Security**).

| Feature | What it does |
|---|---|
| **Edit contact details** | Change your display name, email and mobile number. Type only the 10 digits after the fixed `+63` (for example `917 123 4567`) |
| **Request a Change** | Ask the administrator to change something you cannot edit yourself (job title, birth date, employment status, department). You can follow the request's status under **Your Requests** |
| **Change Password** | At least 8 characters |
| **Two-Factor Authentication** | Email code at sign-in. It is on by default |
| **Change PIN / Signed-in Devices** | Set a PIN. See and remove devices that signed in to your account |
| **Activity Logs** | Your own recorded actions. **Download Data Log** saves them as a CSV file |
| **Sync Profile** | Re-reads your profile and activity from the server |

### 3.6 Using it on a phone

Every role can do everything on a phone that they can do on a computer. The layout changes: a bottom bar replaces the top bar, tables become cards, and the administrator's Clearance page has a **Staff Directory / Health Modules** switch. On a phone, **Submit Health Documents** can take a photo with the camera.

---

## 4. UAT guide: try it yourself

### 4.1 Purpose and ground rules

The purpose of UAT is for **you**, the people who will use the system, to confirm that it does what the hospital needs. You are not testing the code; you are checking that each real task works and the result is what you expect.

**Please read these rules first.**

1. **It is a shared, real environment.** What you do is saved. Approving, rejecting, sending a reminder and running a scan are real actions, and **every action is permanently recorded in the audit log**.
2. **Emails are real.** Approving a document, a positive result, Send Reminder and the scan send real emails. Only act on the **test accounts** (the OPD Nursing pair is ideal) so no real colleague is contacted. Demo employees have made-up email addresses, so a message to them simply shows as failed in the dispatch log.
3. **Never upload real patient or employee medical documents.** Use any small dummy PDF, PNG or JPEG (under 5 MB), for example a blank page named "UAT sample chest X-ray".
4. **Do not change the shared test passwords or switch two-factor off.** If you want to try *Change Password*, change it and then change it back to `asd123` straight away. The team's automated tests rely on these accounts.
5. **One person per account at a time**, because the newest sign-in code cancels older ones.
6. **Time cannot be moved.** Reminders depend on real calendar dates and each person's birth month, so you cannot make a reminder fire "tomorrow". For a particular situation, ask the team to prepare a test case. **Run Compliance Scan** shows the current picture on demand.
7. Test on **at least one phone-sized screen** as well as a computer.

### 4.2 Before you start

- [ ] You have the live site address and the test accounts in section 2.2.
- [ ] A team member is available to read you sign-in codes (or your own email is registered).
- [ ] You have two or three dummy files ready: a small PDF, a small image, and one file that is **not** allowed (for example a `.docx`) plus one **over 5 MB**.
- [ ] You are using Chrome or Edge. Keep a note of the date and time of anything odd.

### 4.3 Test scenarios

Do them in order; later ones use what earlier ones created. Mark each **Pass** or **Fail** and write a note for anything unexpected.

---

**UAT-01 · Sign in with the emailed code** *(Staff `VMMC-25-0024`)*

1. Open the site, stay on **Staff Login**, enter the Employee ID in lower case and the password, press **Log in as Staff**.
2. Wait for the code, type it into the six boxes, press **Verify & Log In**.

*Expected:* the ID shows in capitals; the code screen appears with six empty boxes (no sample digits); the correct code opens **My Health Profile**.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-02 · Sign-in is protected**

1. On the sign-in page enter a **wrong password**. 2. Enter the Staff account's ID and password on the **Admin Login** tab. 3. On the code screen type a **wrong code**, then **Resend code** (after the countdown) and use the new code.

*Expected:* a clear error for the wrong password; the Staff account is **refused** on the Admin tab; a wrong code is refused and the boxes clear; only the newest code works.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-03 · Staff dashboard** *(Staff)*

Open **My Health Profile**.

*Expected:* your deadline and days remaining, **My Screening Progress** (three requirements), and your status are shown, and the numbers make sense for the account.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-04 · Submit a document and the file rules** *(Staff)*

1. **Submit Health Documents** → category **Annual Physical Exam (APE)**, give a title and clinic, attach the dummy PDF, **Submit**.
2. Try the **.docx** file, then the **over-5 MB** file.
3. Open **My Clearance & Logs**.

*Expected:* the PDF is accepted and appears as **Pending Verification**; the other two are refused with a clear message ("Only PDF, PNG, or JPEG files are accepted." / "File exceeds the 5MB limit."). There are **no** result fields on the form.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-05 · Approve a document** *(Administrator `VMMC-25-0022`, on the **Admin** tab)*

1. **Document Verification** → find the staff member's document → **View and verify**.
2. Confirm the **file preview** shows. Record **Chest X-ray: Cleared** and **GeneXpert: Not detected**. Add a finding note.
3. Choose **Approved and Mark Up to Date** and save. *(With `VMMC-25-0026`, first save a signature in Profile; try approving without one and confirm you are told to set one up.)*
4. Switch back to the staff account.

*Expected:* the document leaves the queue; the staff member's entry becomes **Verified & Cleared**, their dashboard shows the exam verified, they have a new notification, and in **Modules Registry** they appear as *Up to Date / Cleared* with a **CERT** button that opens a printable **Annual TB Health Clearance Certificate** showing the signature.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-06 · Request a re-upload** *(Staff, then Administrator)*

1. Staff submits another document. 2. Administrator opens it, chooses **Request Re-upload** and **tries to save without a reason**, then enters a reason ("The scan is blurry, please upload a clearer copy") and saves.

*Expected:* saving without a reason is refused; with a reason the staff member sees **Rejected** with that reason, and is notified.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-07 · Hepatitis B Titer** *(Staff, then Administrator)*

Submit with category **Hepatitis B Titer**; as administrator record **Reactive** or **Non-reactive** and approve.

*Expected:* the form asks for the titer result only at review; after approval **My Screening Progress** shows Hepatitis B Titer as verified.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-08 · A positive result raises an alert** *(Staff `0024`, Administrator, Unit Head `0025`)*

*This sends real alert emails to the test inboxes.*

1. Staff submits an APE document. 2. Administrator approves it with **Chest X-ray: Infiltrate** (or **GeneXpert: Detected**).
3. Sign in as the **Unit Head** (Staff tab) and open the dashboard. 4. Sign in as the **Administrator** and open **Notifications**.

*Expected:* the staff member is marked **Critical** and receives a clinical alert; the unit head sees the case under **Escalations Requiring Attention** and can **Acknowledge** it; the administrator sees it too and can **Acknowledge** then **Mark Resolved**; the **Notification Dispatch Log** shows the messages and what happened on each channel.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-09 · Unit head sees only their department** *(Unit Head `0025`)*

Open the department registry (on a phone: **Tracker**). Search by a name, then by an Employee ID. Open a person.

*Expected:* only **OPD Nursing** staff appear; search narrows the list; a person's record opens; there is **no** way to approve or reject a document.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-10 · Administrator dashboard and reminders** *(Administrator)*

1. Open **Health Overview**. Compare the **Action Required** number with the **Overdue** count in the registry. 2. Hover over a department bar and the ring. 3. In **Personnel Requiring Immediate Follow-up**, press **Send Reminder** for a **test account only**. 4. Download each of the three **Reports**.

*Expected:* the numbers agree between the dashboard and the registry; the button changes to **Reminder Sent** and cannot be pressed again for 24 hours; the three CSV files download with rows.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-11 · Modules Registry** *(Administrator)*

1. Open each of the **four tabs**. 2. Search a name; filter to **Action Required / Overdue**; page through the list. 3. **Add Health Record** for each of Pre-Employment, Exposure (PEP) and Immunization using a test account. 4. Try **PRINT** on a passed pre-employment record. 5. Open a **Health Passport** card.

*Expected:* each tab lists the people; search and filter work; the new records appear in the right tab; the printable pages show the right person and details; the APE tab explains that exams come from verified uploads.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-12 · Run Compliance Scan** *(Administrator)*

Press **Run Compliance Scan** in the registry header, then press it again. Open **Notifications → Notification Dispatch Log**.

*Expected:* a message such as "Scanned 26 records — N new events."; the second run produces **no new** events (nothing is sent twice); the log lists what was sent and the outcome of each channel.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-13 · Edit your details and request a change** *(Staff, then Administrator)*

1. Staff: **Profile → Edit Contact Details** and save a mobile number (only the 10 digits after `+63`). 2. **Request a Change** for **Job Title** with a reason. 3. Administrator: **Profile → Change Requests**, **Approve** it. 4. Staff: check **Your Requests**.

*Expected:* the number is saved and shown with `+63`; the request shows as pending, then **Approved** after the administrator acts; the job title changes. A request the administrator rejects shows as **Rejected**.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-14 · Account security** *(any account)*

1. Open **Two-Factor Authentication** and look at its state (**leave it on**). 2. **Change Password**: first with a wrong current password, then a too-short new one. (Do not complete a change; if you do, change it back to `asd123`.) 3. Open **Signed-in Devices** and **Login History** (administrator).

*Expected:* the wrong or short password is refused with a message; devices and sign-ins are listed.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-15 · Activity record and audit trail**

1. Staff: on **Profile**, open the activity log (**View all** on a computer, **Activity Logs** on a phone), then **Download Data Log**. 2. Administrator: on **Profile**, open **System Activity & Audit Trail** (**System Audit Trail** on a phone).

*Expected:* the staff member sees only **their own** recorded actions (the ones you just did) and the CSV downloads; the administrator sees actions by **everyone**, with the person's ID and role, and **Load more** shows older ones.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-16 · Notifications**

Check the **bell badge** on each account that received something. Open it, then open the **Notifications** page and use the **Alerts / Reminders / Updates** filters.

*Expected:* the badge counts unread items, clears after you open them, and the filters narrow the list correctly.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-17 · On a phone** *(all three roles)*

On a real phone or by making the browser window narrow (about 390 px wide), repeat the heart of UAT-03, UAT-04 (including taking a photo), UAT-05 and UAT-11 (use the **Health Modules** switch).

*Expected:* every task is possible; nothing is cut off or needs sideways scrolling; buttons are easy to tap.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

**UAT-18 · Role boundaries and signing out**

1. As **Staff**, look for another person's record or any administrator page. 2. Log out, then press the browser's **Back** button.

*Expected:* staff only ever see their own information; after logging out you are returned to the sign-in page and cannot reach a page by going back.
Result: ☐ Pass ☐ Fail  Notes: ____________________

---

### 4.4 Reporting an issue

Please send one report per problem with:

| | |
|---|---|
| **Scenario number** | e.g. UAT-05, step 3 |
| **Account used** | Employee ID and role |
| **Device and browser** | e.g. Chrome on Windows laptop; Android phone, 390 px wide |
| **What you did** | The steps, in order |
| **What you expected** | |
| **What happened instead** | Include the exact message if there is one |
| **Date and time** | With the time zone: the team can find the exact entry in the audit log |
| **Screenshot** | If possible |

Also mark how serious it is: **Blocker** (cannot do the task), **Major** (task works but wrongly), **Minor** (cosmetic or wording), **Suggestion** (a new idea, not a fault).

### 4.5 Known limitations

These are known and being tracked. Please do not log them as new faults, but do tell the team if they matter to you.

1. **"Remember me" on the sign-in page does nothing.** Everyone stays signed in for up to 60 minutes regardless.
2. **Data Privacy Settings** (Profile) switches are saved but do not yet change how the system behaves. They should not be read as active protection. The decision to reword, wire up or remove them is open. (They are not on the administrator's phone screen for this reason.)
3. **Sessions end after 60 minutes** without a warning. You may only notice when a button stops working; sign in again.
4. **Approving a birth-date change** updates the person's profile, but **this year's already-calculated deadline dates do not move**.
5. **Text messages (SMS):** the system builds and records every text, but a real SMS leaves the system only when the SMS provider is switched on. Check the **Notification Dispatch Log**: a text shown as "logged only" was recorded, not delivered. Email is delivered for real.
6. **Annual physical exams cannot be added by hand** in the registry. They come from verified uploads.
7. **The Hepatitis B Titer is one-time**: it has no deadline and no reminders. Immunization reminders follow each dose's own due date.
8. **Download Data Log** reads the history in batches and can take a while for a very long history (a test account with about 2,000 entries took roughly 40 seconds).
9. A unit head **cannot approve documents** by design. If the hospital wants department heads to clear their own staff, that is a separate piece of work.
10. The system was tested in Chrome and Edge, including phone-sized screens in those browsers. Safari and physical-device testing is limited.

### 4.6 Sign-off

| | |
|---|---|
| Tester name and position | |
| Date | |
| Scenarios passed / failed / not run | ____ / ____ / ____ |
| Open issues attached | ☐ Yes (count: ____) ☐ No |

Decision: ☐ **Accepted** ☐ **Accepted with the changes listed** ☐ **Not accepted**

Signature: ______________________________

---

## 5. Glossary

| Term | Meaning |
|---|---|
| **TB DOTS** | Directly Observed Treatment, Short-course: the national TB control approach this program supports |
| **APE** | Annual Physical Exam, the yearly screening for hospital personnel |
| **CXR** | Chest X-ray (chest radiograph) |
| **GeneXpert** | A rapid sputum test for TB. The result is *Detected* or *Not detected* |
| **Infiltrate** | An X-ray finding that may indicate disease. It counts as a **positive** result and raises a clinical alert |
| **Hepatitis B Titer** | A blood test showing immunity to hepatitis B. *Reactive* or *Non-reactive* |
| **PEP** | Post-Exposure Prophylaxis: preventive treatment after an airborne exposure, followed up on a schedule |
| **COS** | Contract of Service: a non-permanent employment type |
| **Compliant / Cleared** | The person has an approved, negative result for the cycle |
| **Overdue** | The deadline (end of the birth month) has passed without a clearance |
| **Critical** | A positive result has been approved; needs clinical follow-up |
| **Escalation** | A case sent to the unit head and administrator to act on; can be Acknowledged and Resolved |
| **Monitoring and Event Management (M&E)** | The part of the system that watches every timeline and sends the reminders and alerts (from the ITIL 4 framework) |
| **Audit trail** | The permanent, uneditable record of who did what and when |
| **Two-factor authentication (2FA)** | A second proof of identity: the emailed 6-digit code at sign-in |

---

## 6. For the project team

### Repository layout

```
vmmc-backend/    NestJS + Supabase API                (its own package.json and tests)
vmmc-frontend/   Next.js web app                      (its own package.json and tests)
e2e/             Playwright end-to-end tests (both repos together)
docs/            HANDOFF.md, SYSTEM_ARCHITECTURE.md, BACKEND_ARCHITECTURE.md, FRONTEND_ARCHITECTURE.md
```

The two repos are independent; the only contract between them is the REST API. **Start with [`docs/HANDOFF.md`](docs/HANDOFF.md)** (current status, what is left), then [`docs/SYSTEM_ARCHITECTURE.md`](docs/SYSTEM_ARCHITECTURE.md).

### Run it locally

```bash
npm install        # first time only, from the repo root
npm run dev        # starts both servers
```

- Web app: http://localhost:3000
- API: http://localhost:8443/api (Swagger at `/api/docs`)

`vmmc-backend/.env` needs the Supabase values (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`). For real emails it also needs `BREVO_API_KEY` and a verified `EMAIL_FROM`; without them emails are only logged. Never commit `.env` files.

### Run the tests

```bash
cd vmmc-backend  && npm test     # Jest: 223 unit tests
cd vmmc-frontend && npm test     # Vitest: 109 tests
npm run test:e2e                 # from the root: Playwright, 20 tests, signs in through 2FA
```

The end-to-end suite uses the three dedicated accounts (`VMMC-25-0024`, `-0025`, `-0026`), needs the Supabase service key (so run it against a development database only), and emails about six real codes to those inboxes each run.

### Before real use

The test passwords, inboxes and demo employees in this file are for UAT only. Remove or rotate them, and have VMMC's Data Protection Officer confirm the Privacy Notice, before the system holds real records.
