// Short deny-list of very common passwords (lower-cased). Extend with a larger list for production.
export const COMMON = new Set([
  'password', 'password1', 'password123', '1234567890', '12345678910', 'qwertyuiop', 'qwerty12345', 'qwerty123456',
  'iloveyou123', 'letmein1234', 'welcome1234', 'admin12345', 'administrator', 'abc1234567', 'abcdefghij', 'passw0rd123',
  '1q2w3e4r5t', '1qaz2wsx3edc', 'monkey12345', 'dragon12345', 'football123', 'baseball123', 'master12345', 'sunshine123',
  'princess123', 'superman123', 'trustno1234', 'changeme123', 'default1234', 'bangladesh1', 'bangladesh123', '0987654321',
  '1111111111', '0000000000', 'aaaaaaaaaa', 'asdfghjkl1', 'zxcvbnm123', 'p@ssw0rd123', 'p@ssword123', 'findit12345',
]);
