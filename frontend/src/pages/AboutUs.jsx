import { Globe, Mail, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Reveal } from '../components/ui.jsx';
import '../styles/about.css';

const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">{children}</svg>
);
const GithubIcon = () => <Svg><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .5z" /></Svg>;
const XIcon = () => <Svg><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817-5.97 6.817H1.675l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" /></Svg>;
const InstagramIcon = () => <Svg><path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.64-.07-4.85s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z" /></Svg>;
const FacebookIcon = () => <Svg><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1z" /></Svg>;

const TEXT = {
  en: {
    tag: 'About Us',
    titleA: 'Meet Our ',
    titleB: 'Team',
    intro:
      'We are a team of passionate software engineers dedicated to building innovative, scalable, and impactful digital experiences.',
    quoteTitle: 'Three Minds. One Vision. Endless Possibilities.',
    quoteText:
      'We combine leadership, creativity, and technical expertise to transform ideas into powerful software solutions.',
  },
  bn: {
    tag: 'আমাদের সম্পর্কে',
    titleA: 'আমাদের ',
    titleB: 'টিম',
    intro:
      'আমরা একদল আগ্রহী সফটওয়্যার ইঞ্জিনিয়ার, যারা উদ্ভাবনী, স্কেলেবল ও প্রভাবশালী ডিজিটাল অভিজ্ঞতা তৈরিতে নিবেদিত।',
    quoteTitle: 'তিনটি মন। একটি স্বপ্ন। অসীম সম্ভাবনা।',
    quoteText:
      'আমরা নেতৃত্ব, সৃজনশীলতা ও প্রযুক্তিগত দক্ষতা একত্র করে ধারণাকে শক্তিশালী সফটওয়্যার সমাধানে রূপ দিই।',
  },
};

const TEAM = [
  {
    name: 'MD. Asif Shikdar Nahid',
    photo: '/naradev.jpg',
    en: {
      role: 'Founder & CEO',
      skills: 'Software Engineer · Backend Developer · Full-Stack Developer',
      bio: 'A technology-driven entrepreneur passionate about clean architecture, API design, and full-stack development. Leads the vision, strategy, and technical direction while building fast, scalable web applications.',
    },
    bn: {
      role: 'প্রতিষ্ঠাতা ও সিইও',
      skills: 'সফটওয়্যার ইঞ্জিনিয়ার · ব্যাকএন্ড ডেভেলপার · ফুল-স্ট্যাক ডেভেলপার',
      bio: 'একজন প্রযুক্তি-অনুরাগী উদ্যোক্তা, যিনি ক্লিন আর্কিটেকচার, এপিআই ডিজাইন ও ফুল-স্ট্যাক ডেভেলপমেন্টে আগ্রহী। দ্রুত ও স্কেলেবল ওয়েব অ্যাপ্লিকেশন তৈরির পাশাপাশি তিনি ভিশন, কৌশল ও প্রযুক্তিগত দিকনির্দেশনা দেন।',
    },
    links: [
      { icon: GithubIcon, label: 'GitHub', href: 'https://github.com/nahid4x' },
      { icon: () => <Globe size={18} aria-hidden="true" />, label: 'Portfolio', href: 'https://aboutnahid.vercel.app/' },
      { icon: XIcon, label: 'X', href: 'https://x.com/Naraboyyyy' },
      { icon: InstagramIcon, label: 'Instagram', href: 'https://instagram.com/naraboyyy' },
    ],
  },
  {
    name: 'Nusrat Jahan Supti',
    photo: '/nusratdev.png',
    en: {
      role: 'Planning & Design Lead',
      skills: 'Software Engineer · System Planner · Creative Designer',
      bio: 'The creative mind behind our system planning and design concepts. Turns ideas into structured plans and shapes the look, feel, and experience of our digital solutions.',
    },
    bn: {
      role: 'প্ল্যানিং ও ডিজাইন লিড',
      skills: 'সফটওয়্যার ইঞ্জিনিয়ার · সিস্টেম প্ল্যানার · ক্রিয়েটিভ ডিজাইনার',
      bio: 'সিস্টেম প্ল্যানিং ও ডিজাইন ধারণার পেছনের সৃজনশীল মস্তিষ্ক। ধারণাকে সুসংগঠিত পরিকল্পনায় রূপ দেন এবং আমাদের ডিজিটাল সমাধানের লুক, ফিল ও অভিজ্ঞতা গড়ে তোলেন।',
    },
    links: [
      { icon: GithubIcon, label: 'GitHub', href: 'https://github.com/njsupti' },
      { icon: () => <Mail size={18} aria-hidden="true" />, label: 'Email', href: 'mailto:nusratsu50@gmail.com', external: false },
      { icon: FacebookIcon, label: 'Facebook', href: 'https://www.facebook.com/share/1AFtjhLzpS/' },
    ],
  },
  {
    name: 'MD. Nabil Rahman',
    photo: '/nabildev.jpg',
    en: {
      role: 'Co-CEO & Technical Specialist',
      skills: 'Software Engineer · Project Reviewer · Technical Specialist',
      bio: 'The technical backbone of our development process. Oversees project reviews, evaluates software quality, and guides the team toward reliable solutions.',
    },
    bn: {
      role: 'কো-সিইও ও টেকনিক্যাল স্পেশালিস্ট',
      skills: 'সফটওয়্যার ইঞ্জিনিয়ার · প্রজেক্ট রিভিউয়ার · টেকনিক্যাল স্পেশালিস্ট',
      bio: 'আমাদের ডেভেলপমেন্ট প্রক্রিয়ার প্রযুক্তিগত মেরুদণ্ড। প্রজেক্ট রিভিউ তদারকি করেন, সফটওয়্যারের মান যাচাই করেন এবং টিমকে নির্ভরযোগ্য সমাধানের দিকে পরিচালিত করেন।',
    },
    links: [{ icon: GithubIcon, label: 'GitHub', href: 'https://github.com/nabil-rahman1339' }],
  },
];

function Member({ m, lang }) {
  const c = m[lang];
  return (
    <article className="about-card">
      <div className="about-avatar">
        {m.photo ? <img src={m.photo} alt={m.name} loading="lazy" /> : <User size={44} strokeWidth={1.5} aria-hidden="true" />}
      </div>
      <h3>{m.name}</h3>
      <span className="about-role">{c.role}</span>
      <p className="about-skills">{c.skills}</p>
      <p className="about-bio">{c.bio}</p>
      <div className="about-links">
        {m.links.map(({ icon: Icon, label, href, external = true }) => (
          <a
            key={label}
            href={href}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            aria-label={`${m.name} ${label}`}
            title={label}
          >
            <Icon />
          </a>
        ))}
      </div>
    </article>
  );
}

export default function AboutUs() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const t = TEXT[lang];

  return (
    <div className="container">
      <Reveal>
        <header className="about-head">
          <span className="about-tag">{t.tag}</span>
          <h1>{t.titleA}<em>{t.titleB}</em></h1>
          <p>{t.intro}</p>
        </header>
      </Reveal>
      <div className="about-grid">{TEAM.map((m) => <Member key={m.name} m={m} lang={lang} />)}</div>
      <section className="about-quote">
        <h2>{t.quoteTitle}</h2>
        <p>{t.quoteText}</p>
      </section>
    </div>
  );
}