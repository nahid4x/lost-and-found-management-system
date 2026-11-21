import { Mail } from 'lucide-react';
import { Glass, Reveal } from '../components/ui.jsx';
import '../styles/about.css';

const EMAIL = 'genesiscorporation2050@gmail.com';

// Circle mail button: hover/focus korle glow hoy, tooltip-e email dekhay, click korle mail khule
function MailCard() {
  const [name, domain] = EMAIL.split('@');
  return (
    <a className="mail-btn" href={`mailto:${EMAIL}`} aria-label={`Email us at ${EMAIL}`}>
      <span className="mail-tip" aria-hidden="true">
        <span>{name}</span>
        <span>@{domain}</span>
      </span>
      <Mail size={18} aria-hidden="true" />
    </a>
  );
}

// Text-e email thakle: text ar mail button ek line-e
function Para({ text }) {
  if (!text.includes(EMAIL)) return <p className="muted">{text}</p>;
  const before = text.split(EMAIL)[0].replace(/\s*at\s*$/, ':');
  return (
    <p className="muted mail-row">
      <span>{before}</span>
      <MailCard />
    </p>
  );
}

// Section format: [heading, paragraph, optional bullet items[]]
const PAGES = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'November 22, 2026',
    sections: [
      ['Information we collect', 'When you use FindIt we collect:', [
        'Account data: your name, email address and a securely hashed password. Passwords are never stored in plain text.',
        'Report data: descriptions, category, colour, brand, distinguishing marks, dates, and up to 5 photos per item.',
        'Location data: the place where an item was lost or found, which you choose on the map.',
        'Claim data: your answers to verification questions and up to 3 proof images you upload with a claim.',
        'Messages and calls: in-app chat messages between a finder and an owner. Calls are peer-to-peer and are not recorded by us.',
        'Technical data: session tokens, IP address (for rate limiting and security) and basic browser/device information.',
      ]],
      ['How we use it', null, [
        'To match lost and found reports using text, category, date and distance similarity, and to show you why a match was suggested.',
        'To verify ownership before contact details or exact locations are shared.',
        'To enable chat and calls between the finder and the owner.',
        'To send in-app and email notifications, according to your preferences.',
        'To keep the platform safe: prevent abuse, fraud and false claims, and keep an audit log of important actions.',
      ]],
      ['Location privacy', 'Public item pages and the map only show an approximate location, rounded to about 1 km. The exact location, the "held at" place and the finder\'s contact note are visible only to the item owner, an administrator, and the claimant whose claim has been approved.'],
      ['Ownership verification and proof images', 'Verification questions are shown only to signed-in users who are not the owner of the report. Correct answers are not stored. Proof images attached to a claim are kept in private storage and are visible only to the finder, the claimant and administrators reviewing the claim.'],
      ['Sharing', 'We never sell your data. We share information only:', [
        'With the other party in a claim, after the claim is approved (contact details and exact location).',
        'With service providers that run the platform, such as Cloudinary (image storage) and an email provider (notifications).',
        'With administrators, when needed to review reports, claims or abuse.',
        'When required by law or to protect the safety of users.',
      ]],
      ['Sessions and cookies', 'We use secure session tokens to keep you signed in and to protect your account. We also store your theme (light/dark) preference in your browser. We do not use advertising or tracking cookies.'],
      ['Audit log', 'Important actions, such as claim decisions and status changes, are recorded with who did them and when. This helps resolve disputes and detect misuse. Audit entries do not contain message bodies or passwords.'],
      ['Data retention', 'We keep your data while your account is active. Closed reports and related claims are kept for 90 days for dispute resolution, then deleted or anonymised. When you delete your account, your profile is removed within 30 days, except records we must keep for security or legal reasons.'],
      ['Your control', null, [
        'Edit your profile and change your password at any time.',
        'Choose which notifications you receive from Settings.',
        'Sign out of one device or all devices.',
        'Request account deletion from Settings.',
      ]],
      ['Security', 'Connections use HTTPS, passwords are hashed, access is role-based, and sensitive actions are rate limited. No system is 100% secure, so please use a strong, unique password and never share it.'],
      ['Children', 'FindIt is not intended for children under 13, and we do not knowingly collect their data.'],
      ['Contact', `Questions about this policy? Email us at ${EMAIL}`],
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    updated: 'November 22, 2026',
    sections: [
      ['Acceptance', 'By creating an account or using FindIt you agree to these terms and to our Privacy Policy. If you do not agree, please do not use the service.'],
      ['Your account', null, [
        'You must provide accurate information and keep your password confidential.',
        'You are responsible for all activity under your account.',
        'One person, one account. Do not impersonate others.',
      ]],
      ['Honest use', 'Only report items you have actually lost or found. False claims or misleading reports may lead to removal of content and suspension or a permanent ban of your account.'],
      ['Content you post', null, [
        'You own your content, but you give FindIt permission to store and display it to operate the service.',
        'Do not upload illegal, offensive or misleading content, or photos containing other people\'s private information.',
        'Do not post sensitive documents (IDs, cards) in public photos. Use the private proof option for verification.',
        'We may remove content that breaks these terms.',
      ]],
      ['Ownership verification', 'Finders may ask verification questions and request proof of ownership. Claims are approved at the finder\'s discretion, and administrators may review a claim if there is a dispute. Approval does not guarantee that the claimant is the true owner.'],
      ['Handover safety', 'We recommend meeting in a public place, during the day, and bringing someone with you. Do not send money or share banking details. FindIt will never ask you to pay to recover an item.'],
      ['Messages and calls', 'Use chat and calls only to arrange the return of an item. Harassment, spam, threats or unrelated commercial messages are not allowed and may result in suspension.'],
      ['Prohibited activity', null, [
        'Attempting to access other users\' data, or to break or overload the service.',
        'Using bots or scraping the platform without permission.',
        'Using FindIt to stalk, track or locate people.',
      ]],
      ['Suspension and termination', 'We may suspend or terminate accounts that violate these terms. You may delete your account at any time from Settings.'],
      ['Responsibility', 'FindIt helps people connect, but we are not responsible for the handover of items, for the condition or authenticity of items, or for disputes between users. The service is provided "as is", without any guarantee that an item will be found.'],
      ['Changes to these terms', 'We may update these terms from time to time. Continued use after a change means you accept the updated terms.'],
      ['Contact', `Questions? Email us at ${EMAIL}`],
    ],
  },
};

export default function LegalPage({ kind }) {
  const p = PAGES[kind];
  return (
    <div className="container">
      <Reveal>
        <h1 style={{ marginTop: 0 }}>{p.title}</h1>
        <p className="muted" style={{ marginTop: -4 }}>Last updated: {p.updated}</p>
      </Reveal>
      <Glass pad className="legal">
        {p.sections.map(([h, text, items]) => (
          <section key={h}>
            <h3>{h}</h3>
            {text && <Para text={text} />}
            {items && (
              <ul className="muted">
                {items.map((li) => <li key={li}>{li}</li>)}
              </ul>
            )}
          </section>
        ))}
      </Glass>
    </div>
  );
}