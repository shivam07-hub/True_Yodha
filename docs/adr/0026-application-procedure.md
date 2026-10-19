# Every Application Follows One Procedure

**Status:** Accepted
**Date:** 2026-10-15
**Related:** ADR-0016 (no fabrication), ADR-0018 (own connections, the user sends), ADR-0020 (the PDF is the sheet), ADR-0025 (one document per job), CONTEXT.md §Apply Transport, CONTEXT.md §Job Document

## Decision

A job is applied to in this order, and the next company uses the same order. The CV for that job is a reflection of that job's description, written only from the person's real profile.

1. **One account.** The profile is the account the person named. A second login that shares a name is a different profile.
2. **Proof, then the page.** Unproven numbers, employers, titles, and dates are asked before they are written (ADR-0016). The page then answers the job in the job's own order: the current seat first, the motions the description is hiring for, skills led by those motions.
3. **Owned scope.** The figure the person added is the figure on the page. The larger book it sat inside is named as the book. A $2M feature inside a $20M pursuit is not a $20M sale.
4. **A full-time seat is exclusive on the page.** Side work is dated so it does not run across a full-time job or a full-time degree. Work they do beside the job is a pursuit, not a second employer.
5. **One document for that job.** The reflection is that job's document (ADR-0025). Phrasing written for this description stays on that document. A fact the person confirms about themselves — a date, an owned number, a pursuit label — also lands on the master, because it is true on every CV. The master is not rewritten into one company's voice.
6. **Apply is one click that carries the job's CV onto the company's form.** The CV is that job's document, rendered from the sheet (ADR-0020). The company still has to recognise the person, so the first visit to a careers site is their sign-in. After that session exists in the browser, the extension attaches the CV and fills the fields Myro already holds, and the click left is Submit. Opening the link and asking afterwards is the receipt, not the apply (Apply Transport).

   On desktop Chrome the extension walks every screen it can fill and clicks Next. It stops on the Submit screen and does not click Submit (Shivam, 2026-10-15). A phone has no extension, so Apply there opens the company page and "Did you submit?" stays until the person confirms.
7. **The company's status URL is saved on the application** — on the application notes until a status-URL column exists.
8. **Then two notes, from their own connections export.** First, someone they have actually written to. Second, the person whose seat is the motion, even when the thread is cold. Same CV. The person sends. Myro does not (ADR-0018).

A server with no company session cannot post the application. The extension does not invent that login, and it does not read the status page. It does carry the CV onto the form once the person is signed in.

## Why

On 2026-10-15 the Microsoft Partner Solution Sales application (job 200055836) was built on the wrong login first, then corrected on `shivam.mit20@gmail.com`. The page that went out named the person's own Azure scope inside the team's pursuit book, took Finlatics off the MBA years and off Capgemini, and labeled Myro a hobby pursuit. The referral notes went to the one Microsoft connection with a real thread, then to the one connection who leads a partner seat. The status of the application lives on Microsoft's own applications page (`https://apply.careers.microsoft.com/careers/applications?domain=microsoft.com`), behind the person's login.

Doing the next company any other way repeats the defects this one had to be corrected out of: a CV that leads with the wrong work, a side role that makes a full-time job look part-time, and a referral ask sprayed at people who cannot refer.

## Considered Options

- **Rewrite the master into each job.** Rejected. JD phrasing on the master rides into every other job (the Oracle defect, CONTEXT.md §CV Version).
- **Stop at opening the company link.** Rejected 2026-10-15. Shivam: the journey is that the person clicks and applies. Speed of a sent application is the product. "Did you submit?" records the outcome. It is not the apply.
- **A server posts the form with no company session, or the extension reads the status page.** Rejected. Microsoft's apply page (job 200055836) stops on Sign in until the person has a session. The extension works in that session. It does not invent one, and it does not scrape the applications list.
- **Ask every connection at the company.** Rejected. The export for this role had 17 people at Microsoft and one conversation. Two notes, chosen as above, is the pass.

## Consequences

- Apply that only opens the company URL is not finished on desktop Chrome. The extension, in the person's own signed-in browser, carries that job's CV onto the form, walks Next, and stops before Submit. On a phone the open-and-ask remains the apply, because there is no extension.
- The next application starts at step 1 on the named account. It does not start by editing a previous job's document.
- A tailor that cannot show owned scope, or that leaves a side role across a full-time seat, is not ready to send.
- Referral copy is drafted for the person to send. Nothing in this procedure is a licence to scrape, to auto-send, or to name someone who is not in the person's own export.
