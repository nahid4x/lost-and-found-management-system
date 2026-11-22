import { Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Glass, Reveal } from '../components/ui.jsx';
import '../styles/about.css';

const EMAIL = 'genesiscorporation2050@gmail.com';

// Circle mail button: hover/focus korle glow hoy, tooltip-e email dekhay, click korle mail khule
function MailCard() {
  const [name, domain] = EMAIL.split('@');
  return (
    <a className="mail-btn" href={`mailto:${EMAIL}`} aria-label={EMAIL}>
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
const CONTENT = {
  en: {
    updatedLabel: 'Last updated',
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
  },

  bn: {
    updatedLabel: 'সর্বশেষ হালনাগাদ',
    privacy: {
      title: 'গোপনীয়তা নীতি',
      updated: '২২ নভেম্বর ২০২৬',
      sections: [
        ['আমরা যে তথ্য সংগ্রহ করি', 'FindIt ব্যবহার করলে আমরা নিচের তথ্য সংগ্রহ করি:', [
          'অ্যাকাউন্ট তথ্য: আপনার নাম, ইমেইল ঠিকানা এবং নিরাপদভাবে হ্যাশ করা পাসওয়ার্ড। পাসওয়ার্ড কখনো সাধারণ লেখা হিসেবে সংরক্ষণ করা হয় না।',
          'রিপোর্টের তথ্য: বিবরণ, ক্যাটাগরি, রং, ব্র্যান্ড, বিশেষ চিহ্ন, তারিখ এবং প্রতিটি আইটেমের জন্য সর্বোচ্চ ৫টি ছবি।',
          'অবস্থানের তথ্য: যেখানে আইটেমটি হারিয়েছে বা পাওয়া গেছে, যা আপনি ম্যাপে বেছে নেন।',
          'দাবির তথ্য: যাচাইয়ের প্রশ্নের উত্তর এবং দাবির সঙ্গে আপলোড করা সর্বোচ্চ ৩টি প্রমাণের ছবি।',
          'মেসেজ ও কল: যিনি আইটেমটি পেয়েছেন এবং মালিকের মধ্যে অ্যাপের ভেতরের চ্যাট মেসেজ। কল সরাসরি (পিয়ার-টু-পিয়ার) হয় এবং আমরা তা রেকর্ড করি না।',
          'প্রযুক্তিগত তথ্য: সেশন টোকেন, আইপি ঠিকানা (রেট লিমিট ও নিরাপত্তার জন্য) এবং ব্রাউজার/ডিভাইসের মৌলিক তথ্য।',
        ]],
        ['আমরা তথ্য কীভাবে ব্যবহার করি', null, [
          'লেখা, ক্যাটাগরি, তারিখ ও দূরত্বের মিল দেখে হারানো ও পাওয়া রিপোর্ট মেলাতে, এবং কেন মিল দেখানো হয়েছে তা আপনাকে জানাতে।',
          'যোগাযোগের তথ্য বা সঠিক অবস্থান শেয়ার করার আগে মালিকানা যাচাই করতে।',
          'যিনি আইটেমটি পেয়েছেন এবং মালিকের মধ্যে চ্যাট ও কল চালু করতে।',
          'আপনার পছন্দ অনুযায়ী অ্যাপের ভেতরে ও ইমেইলে নোটিফিকেশন পাঠাতে।',
          'প্ল্যাটফর্ম নিরাপদ রাখতে: অপব্যবহার, প্রতারণা ও মিথ্যা দাবি ঠেকাতে এবং গুরুত্বপূর্ণ কাজের অডিট লগ রাখতে।',
        ]],
        ['অবস্থানের গোপনীয়তা', 'পাবলিক আইটেম পেজ ও ম্যাপে শুধু আনুমানিক অবস্থান দেখানো হয়, যা প্রায় ১ কিমি পর্যন্ত গোল করা। সঠিক অবস্থান, "যেখানে রাখা আছে" ঠিকানা এবং যিনি আইটেমটি পেয়েছেন তাঁর যোগাযোগের নোট শুধু আইটেমের মালিক, অ্যাডমিন এবং যাঁর দাবি অনুমোদিত হয়েছে তিনি দেখতে পান।'],
        ['মালিকানা যাচাই ও প্রমাণের ছবি', 'যাচাইয়ের প্রশ্ন শুধু সাইন-ইন করা এবং রিপোর্টের মালিক নন এমন ব্যবহারকারীদের দেখানো হয়। সঠিক উত্তর সংরক্ষণ করা হয় না। দাবির সঙ্গে দেওয়া প্রমাণের ছবি প্রাইভেট স্টোরেজে রাখা হয় এবং শুধু যিনি আইটেমটি পেয়েছেন, দাবিকারী এবং দাবি পর্যালোচনাকারী অ্যাডমিনরা দেখতে পান।'],
        ['তথ্য শেয়ার', 'আমরা আপনার তথ্য কখনো বিক্রি করি না। আমরা শুধু এই ক্ষেত্রগুলোতে তথ্য শেয়ার করি:', [
          'দাবির অন্য পক্ষের সঙ্গে, দাবি অনুমোদিত হওয়ার পর (যোগাযোগের তথ্য ও সঠিক অবস্থান)।',
          'প্ল্যাটফর্ম চালাতে সাহায্য করে এমন সেবাদাতার সঙ্গে, যেমন Cloudinary (ছবি সংরক্ষণ) ও ইমেইল সেবা (নোটিফিকেশন)।',
          'অ্যাডমিনদের সঙ্গে, যখন রিপোর্ট, দাবি বা অপব্যবহার পর্যালোচনার প্রয়োজন হয়।',
          'আইনের প্রয়োজনে বা ব্যবহারকারীদের নিরাপত্তা রক্ষায়।',
        ]],
        ['সেশন ও কুকি', 'আপনাকে সাইন-ইন রাখতে এবং অ্যাকাউন্ট সুরক্ষিত রাখতে আমরা নিরাপদ সেশন টোকেন ব্যবহার করি। আপনার থিম (লাইট/ডার্ক) পছন্দও ব্রাউজারে সংরক্ষণ করা হয়। আমরা বিজ্ঞাপন বা ট্র্যাকিং কুকি ব্যবহার করি না।'],
        ['অডিট লগ', 'দাবির সিদ্ধান্ত ও স্ট্যাটাস পরিবর্তনের মতো গুরুত্বপূর্ণ কাজ কে কখন করেছেন তা রেকর্ড করা হয়। এতে বিরোধ মেটাতে ও অপব্যবহার শনাক্ত করতে সুবিধা হয়। অডিট এন্ট্রিতে মেসেজের লেখা বা পাসওয়ার্ড থাকে না।'],
        ['তথ্য সংরক্ষণের সময়', 'আপনার অ্যাকাউন্ট সক্রিয় থাকা পর্যন্ত আমরা তথ্য রাখি। বন্ধ হয়ে যাওয়া রিপোর্ট ও সংশ্লিষ্ট দাবি বিরোধ নিষ্পত্তির জন্য ৯০ দিন রাখা হয়, তারপর মুছে ফেলা বা পরিচয় গোপন করা হয়। আপনি অ্যাকাউন্ট মুছলে ৩০ দিনের মধ্যে আপনার প্রোফাইল সরিয়ে ফেলা হয়, শুধু নিরাপত্তা বা আইনি কারণে যে রেকর্ড রাখা বাধ্যতামূলক তা বাদে।'],
        ['আপনার নিয়ন্ত্রণ', null, [
          'যেকোনো সময় প্রোফাইল এডিট করুন ও পাসওয়ার্ড বদলান।',
          'সেটিংস থেকে কোন নোটিফিকেশন পাবেন তা ঠিক করুন।',
          'একটি বা সব ডিভাইস থেকে সাইন আউট করুন।',
          'সেটিংস থেকে অ্যাকাউন্ট মুছে ফেলার অনুরোধ করুন।',
        ]],
        ['নিরাপত্তা', 'সংযোগ HTTPS ব্যবহার করে, পাসওয়ার্ড হ্যাশ করা হয়, অ্যাক্সেস রোল-ভিত্তিক এবং সংবেদনশীল কাজে রেট লিমিট আছে। কোনো সিস্টেমই ১০০% নিরাপদ নয়, তাই শক্তিশালী ও আলাদা পাসওয়ার্ড ব্যবহার করুন এবং কারও সঙ্গে শেয়ার করবেন না।'],
        ['শিশুদের তথ্য', 'FindIt ১৩ বছরের কম বয়সীদের জন্য নয়, এবং আমরা জেনেশুনে তাদের তথ্য সংগ্রহ করি না।'],
        ['যোগাযোগ', `এই নীতি নিয়ে প্রশ্ন আছে? ইমেইল করুন: ${EMAIL}`],
      ],
    },
    terms: {
      title: 'শর্তাবলি',
      updated: '২২ নভেম্বর ২০২৬',
      sections: [
        ['শর্ত মেনে নেওয়া', 'অ্যাকাউন্ট খুলে বা FindIt ব্যবহার করে আপনি এই শর্তাবলি এবং আমাদের গোপনীয়তা নীতি মেনে নিচ্ছেন। রাজি না হলে অনুগ্রহ করে সেবাটি ব্যবহার করবেন না।'],
        ['আপনার অ্যাকাউন্ট', null, [
          'সঠিক তথ্য দিন এবং পাসওয়ার্ড গোপন রাখুন।',
          'আপনার অ্যাকাউন্টের সব কাজের দায়িত্ব আপনার।',
          'একজন ব্যক্তির একটি অ্যাকাউন্ট। অন্যের পরিচয়ে অ্যাকাউন্ট খুলবেন না।',
        ]],
        ['সততার সঙ্গে ব্যবহার', 'শুধু সেই আইটেমের রিপোর্ট করুন যা আপনি সত্যিই হারিয়েছেন বা পেয়েছেন। মিথ্যা দাবি বা বিভ্রান্তিকর রিপোর্টের কারণে কনটেন্ট সরানো এবং অ্যাকাউন্ট স্থগিত বা স্থায়ীভাবে নিষিদ্ধ হতে পারে।'],
        ['আপনার পোস্ট করা কনটেন্ট', null, [
          'কনটেন্টের মালিক আপনি, তবে সেবা চালাতে সেটি সংরক্ষণ ও প্রদর্শনের অনুমতি FindIt-কে দিচ্ছেন।',
          'বেআইনি, আপত্তিকর বা বিভ্রান্তিকর কনটেন্ট, কিংবা অন্যের ব্যক্তিগত তথ্য আছে এমন ছবি আপলোড করবেন না।',
          'পাবলিক ছবিতে সংবেদনশীল নথি (আইডি, কার্ড) দেবেন না। যাচাইয়ের জন্য প্রাইভেট প্রমাণের অপশন ব্যবহার করুন।',
          'এই শর্ত ভাঙলে আমরা কনটেন্ট সরিয়ে দিতে পারি।',
        ]],
        ['মালিকানা যাচাই', 'যিনি আইটেমটি পেয়েছেন তিনি যাচাইয়ের প্রশ্ন করতে এবং মালিকানার প্রমাণ চাইতে পারেন। দাবি তাঁর বিবেচনায় অনুমোদিত হয়, এবং বিরোধ হলে অ্যাডমিন দাবি পর্যালোচনা করতে পারেন। অনুমোদনের মানে এই নয় যে দাবিকারীই প্রকৃত মালিক।'],
        ['হস্তান্তরে নিরাপত্তা', 'আমরা পরামর্শ দিই: দিনের বেলায় কোনো পাবলিক জায়গায় দেখা করুন এবং সঙ্গে কাউকে নিন। টাকা পাঠাবেন না বা ব্যাংকের তথ্য দেবেন না। আইটেম ফেরত পেতে FindIt কখনো টাকা চাইবে না।'],
        ['মেসেজ ও কল', 'চ্যাট ও কল শুধু আইটেম ফেরত দেওয়ার ব্যবস্থা করতে ব্যবহার করুন। হয়রানি, স্প্যাম, হুমকি বা সম্পর্কহীন বাণিজ্যিক মেসেজ নিষিদ্ধ এবং এর কারণে অ্যাকাউন্ট স্থগিত হতে পারে।'],
        ['নিষিদ্ধ কাজ', null, [
          'অন্য ব্যবহারকারীর তথ্যে ঢোকার চেষ্টা, বা সেবা ভাঙার বা ওভারলোড করার চেষ্টা।',
          'অনুমতি ছাড়া বট ব্যবহার বা প্ল্যাটফর্ম স্ক্র্যাপ করা।',
          'মানুষকে অনুসরণ, ট্র্যাক বা খুঁজে বের করতে FindIt ব্যবহার করা।',
        ]],
        ['স্থগিত ও বাতিল', 'এই শর্ত ভাঙলে আমরা অ্যাকাউন্ট স্থগিত বা বাতিল করতে পারি। আপনি যেকোনো সময় সেটিংস থেকে অ্যাকাউন্ট মুছে ফেলতে পারেন।'],
        ['দায়িত্বের সীমা', 'FindIt মানুষকে যুক্ত করতে সাহায্য করে, কিন্তু আইটেম হস্তান্তর, আইটেমের অবস্থা বা আসলত্ব, কিংবা ব্যবহারকারীদের মধ্যকার বিরোধের দায় আমাদের নয়। সেবাটি "যেমন আছে" ভিত্তিতে দেওয়া হয়, আইটেম পাওয়া যাবে এমন কোনো নিশ্চয়তা ছাড়া।'],
        ['শর্ত পরিবর্তন', 'আমরা সময়ে সময়ে এই শর্ত হালনাগাদ করতে পারি। পরিবর্তনের পরও সেবা ব্যবহার করলে হালনাগাদ শর্ত মেনে নেওয়া হয়েছে ধরা হবে।'],
        ['যোগাযোগ', `প্রশ্ন আছে? ইমেইল করুন: ${EMAIL}`],
      ],
    },
  },
};

export default function LegalPage({ kind }) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === 'bn' ? 'bn' : 'en';
  const c = CONTENT[lang];
  const p = c[kind];
  return (
    <div className="container">
      <Reveal>
        <h1 style={{ marginTop: 0 }}>{p.title}</h1>
        <p className="muted" style={{ marginTop: -4 }}>{c.updatedLabel}: {p.updated}</p>
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