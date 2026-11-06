import Link from 'next/link'

const sectionStyle = { marginTop: 24 } as const
const headingStyle = { margin: '0 0 8px', fontFamily: 'Poppins,sans-serif', fontSize: 18, fontWeight: 700, color: '#1f3151' } as const
const paragraphStyle = { margin: '0 0 10px', fontSize: 14, lineHeight: 1.7, color: '#40546b' } as const

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: '100vh', padding: '32px 16px 48px', background: 'linear-gradient(180deg, #edf5f2 0%, #fff 300px)', fontFamily: 'Public Sans,sans-serif' }}>
      <article style={{ width: '100%', maxWidth: 840, margin: '0 auto', padding: 'clamp(20px, 5vw, 40px)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 12px 36px rgba(17, 35, 54, 0.08)' }}>
        <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, marginBottom: 16, color: '#1d3d93', fontSize: 14, fontWeight: 600 }}>
          Back to sign in
        </Link>
        <p style={{ margin: 0, color: '#008d46', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>VMMC TB DOTS Compliance System</p>
        <h1 style={{ margin: '8px 0', fontFamily: 'Poppins,sans-serif', fontSize: 30, lineHeight: 1.2, color: '#1f3151' }}>Privacy Notice</h1>
        <p style={paragraphStyle}>Last updated: November 3, 2026</p>

        <div style={{ marginTop: 18, padding: 16, background: '#fffaf0', border: '1px solid #f3d9a8', borderRadius: 8, color: '#6b4d13', fontSize: 13, lineHeight: 1.6 }}>
          This notice describes the system's current data handling. VMMC's Data Protection Officer or authorized privacy office should confirm the official data-controller details, lawful basis, retention schedule, and contact channel before this notice is treated as final legal policy.
        </div>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Information this system handles</h2>
          <p style={paragraphStyle}>Depending on your role and use of the system, this can include your name, employee ID, work contact details, department and job information; account and sign-in records; health-screening dates, results, documents and review decisions; and activity, device, and security audit records.</p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>How the information is used</h2>
          <p style={paragraphStyle}>Information is used to set up and secure employee accounts, manage occupational health-compliance workflows, review submitted records, provide reminders and notifications, support authorized dashboards and reports, and maintain security and audit trails. The app does not use this information for advertising or unrelated marketing.</p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Access and service providers</h2>
          <p style={paragraphStyle}>Access is role-restricted: employees can access their own information, unit heads have department-scoped access, and administrators have broader authorized system access. Supabase provides authentication, database, and storage services. Brevo handles configured email delivery; Semaphore may handle configured SMS delivery. Those providers process information needed to provide their respective services.</p>
        </section>

        <section id="cookies" style={sectionStyle}>
          <h2 style={headingStyle}>Cookies and browser storage</h2>
          <p style={paragraphStyle}>After successful sign-in, the system uses the <code>vmmc_session</code> HttpOnly cookie to authenticate requests to the backend. The browser sends it automatically; JavaScript cannot read its value. It is configured as SameSite=Lax and Secure in production, and its lifetime follows the sign-in session.</p>
          <p style={paragraphStyle}>The app also keeps a non-secret session summary in session storage for interface state. The cookie-notice dismissal is stored in session storage for the current browser tab. The app does not currently use optional analytics or advertising cookies.</p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Retention and privacy requests</h2>
          <p style={paragraphStyle}>Records are retained according to VMMC's applicable records-management and legal requirements. The specific retention periods and process for requesting access, correction, or other privacy assistance must be confirmed by VMMC's Data Protection Officer or authorized privacy office.</p>
        </section>

        <p style={{ ...paragraphStyle, marginTop: 28, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
          By continuing with account setup, you acknowledge that you have read this notice. This acknowledgment does not replace any rights provided by applicable privacy law.
        </p>
      </article>
    </main>
  )
}