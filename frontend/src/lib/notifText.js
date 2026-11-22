// Backend English text save kore, tai dekhanor somoy Bangla-te convert kora hoy.
// Pattern na mille original text-i dekhay. Source: services/notify/src/app.js
const BN = '০১২৩৪৫৬৭৮৯';
const bnNum = (s) => String(s).replace(/\d/g, (d) => BN[d]);

const TITLES = [
  [/^Possible match for your lost item$/, () => 'আপনার হারানো জিনিসের সম্ভাব্য মিল'],
  [/^Someone may be looking for this$/, () => 'কেউ হয়তো এটি খুঁজছেন'],
  [/^New claim on your found item$/, () => 'আপনার পাওয়া জিনিসে নতুন দাবি'],
  [/^More information requested$/, () => 'আরও তথ্য চাওয়া হয়েছে'],
  [/^Claimant added information$/, () => 'দাবিদার অতিরিক্ত তথ্য দিয়েছেন'],
  [/^Your claim was approved$/, () => 'আপনার দাবি অনুমোদিত হয়েছে'],
  [/^Your claim was not approved$/, () => 'আপনার দাবি অনুমোদিত হয়নি'],
  [/^Item marked as returned$/, () => 'জিনিস ফেরত দেওয়া হয়েছে'],
  [/^New message from (.+)$/, (m) => `${m[1]}-এর নতুন বার্তা`],
];

const BODIES = [
  [
    /^"(.*)" looks (\d+)% similar to "(.*)"\.?$/,
    (m) => `"${m[1]}" জিনিসটি "${m[3]}"-এর সাথে ${bnNum(m[2])}% মিলে যাচ্ছে।`,
  ],
  [
    /^Your found item "(.*)" may match "(.*)" \((\d+)%\)\.?$/,
    (m) => `আপনার পাওয়া "${m[1]}" জিনিসটি "${m[2]}"-এর সাথে মিলতে পারে (${bnNum(m[3])}%)।`,
  ],
  [
    /^(.+?) submitted a claim for "(.*?)"\.(?: Ownership verification: (\d+)% match.*)?$/,
    (m) => `${m[1]} "${m[2]}"-এর জন্য একটি দাবি জমা দিয়েছেন।${m[3] != null ? ` মালিকানা যাচাই: ${bnNum(m[3])}% মিল (অনুমোদনের আগে পর্যালোচনা করুন)।` : ''}`,
  ],
  [
    /^The finder of "(.*)" asked for more information about your claim\.?$/,
    (m) => `"${m[1]}" জিনিসটির প্রাপক আপনার দাবি সম্পর্কে আরও তথ্য চেয়েছেন।`,
  ],
  [
    /^(.+?) sent more information for "(.*)"\.?$/,
    (m) => `${m[1]} "${m[2]}"-এর জন্য আরও তথ্য পাঠিয়েছেন।`,
  ],
  [
    /^(.+?) approved your claim for "(.*?)"\. You can now chat/,
    (m) => `${m[1]} "${m[2]}"-এর জন্য আপনার দাবি অনুমোদন করেছেন। এখন চ্যাটে হস্তান্তরের ব্যবস্থা করতে পারবেন।`,
  ],
  [
    /^Your claim for "(.*)" was not approved\.?$/,
    (m) => `"${m[1]}"-এর জন্য আপনার দাবি অনুমোদিত হয়নি।`,
  ],
  [
    /^"(.*)" was marked as returned\. Case closed\.?$/,
    (m) => `"${m[1]}" ফেরত দেওয়া হয়েছে বলে চিহ্নিত করা হয়েছে। বিষয়টি নিষ্পত্তি হয়েছে।`,
  ],
  [/^Open FindIt to read and reply\.?$/, () => 'বার্তা পড়তে ও উত্তর দিতে FindIt খুলুন।'],
];

const run = (rules, s) => {
  for (const [re, fn] of rules) {
    const m = re.exec(s ?? '');
    if (m) return fn(m);
  }
  return s;
};

export const notifText = (n, lng) =>
  lng?.startsWith('bn') ? { title: run(TITLES, n.title), body: run(BODIES, n.body) } : { title: n.title, body: n.body };