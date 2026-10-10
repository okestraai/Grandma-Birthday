/**
 * DEMO DATA. Every person, place and message below is fictional and exists only to show
 * how the site looks when filled in. Replace it all through the admin dashboard, or seed
 * a production database with SEED_DEMO=false.
 */

export const DEMO_PASSWORD = 'Celebrate70!Demo';

export const DEMO_USERS = [
  { email: 'superadmin@demo.local', name: 'Demo Super Admin', role: 'SUPER_ADMIN' as const },
  { email: 'admin@demo.local', name: 'Demo Admin', role: 'ADMIN' as const },
  { email: 'staff@demo.local', name: 'Event Staff', role: 'CHECK_IN_STAFF' as const },
];

export const DEMO_EVENT = {
  name: 'Margaret at Seventy',
  tagline: 'An evening of gratitude, music and memories',
  description:
    'Family and friends gather to give thanks for seventy remarkable years. Dinner, tributes, music and dancing in the Emerald Ballroom.',
  // 21 November 2026, 5:00 PM to 11:00 PM in Lagos (UTC+1)
  startsAt: new Date('2026-11-21T16:00:00Z'),
  endsAt: new Date('2026-11-21T22:00:00Z'),
  timezone: 'Africa/Lagos',
  venueName: 'The Emerald Ballroom',
  address: '12 Palm Grove Avenue, Victoria Island',
  city: 'Lagos',
  mapUrl: 'https://www.openstreetmap.org/?mlat=6.4281&mlon=3.4219#map=16/6.4281/3.4219',
  latitude: 6.4281,
  longitude: 3.4219,
  theme: 'Emerald & Gold',
  dressCode: 'Black tie: emerald, gold or ivory accents welcome',
  parkingInfo: 'Valet parking at the main entrance from 4:30 PM. Overflow parking is signposted on Palm Grove Close.',
  contactName: 'Ngozi Okonkwo-Bello',
  contactEmail: 'celebration@demo.local',
  contactPhone: '+234 800 000 0070',
  capacity: 250,
  rsvpOpen: true,
  rsvpMode: 'OPEN' as const,
  rsvpDeadline: new Date('2026-11-07T22:59:00Z'),
  defaultCompanions: 1,
  maxCompanions: 4,
  allowCompanions: true,
};

export const DEMO_CELEBRANT = {
  fullName: 'Dr. Margaret Adaeze Okonkwo',
  preferredName: 'Margaret',
  honorific: 'Dr.',
  birthDate: new Date('1956-11-21T00:00:00Z'),
  birthPlace: 'Enugu, Nigeria',
  heroHeadline: 'Years of Life. Love. Legacy.',
  introduction:
    'Physician, teacher, mother, grandmother and great-grandmother: for seventy years Margaret has filled every room she enters with warmth, wisdom and laughter.',
  biography: [
    'Margaret Adaeze was born in Enugu in November 1956, the second of four children. Her mother ran a small bookshop and her father taught mathematics, and between them they raised a daughter who read everything and questioned the rest.',
    'She trained in medicine at the University of Ibadan, qualifying in 1981, and spent the next three decades caring for mothers and children, first in rural clinics and later as the founding head of paediatrics at a teaching hospital in Lagos.',
    'In 1976 she married Emeka Okonkwo, an engineer she met at a friend\'s wedding and, as she tells it, argued with all evening. Together they raised three children and, in time, welcomed five grandchildren and two great-grandchildren.',
    'Retirement did not slow her down. She mentors young doctors, chairs a scholarship fund for girls in science, sings alto in her church choir and still hosts the family\'s Sunday lunch, where everyone is welcome and nobody leaves hungry.',
  ].join('\n\n'),
  quote: 'Whatever you do, do it with your whole heart, and leave the door open for whoever comes next.',
  quoteAttribution: 'Margaret, to her graduating students, 2004',
  achievements: [
    'Founding head of paediatrics at a Lagos teaching hospital (1994–2016)',
    'Established a mobile maternal-health clinic that served over 40,000 families',
    'Chair of a scholarship fund that has supported 300 girls in science',
    'National award for service to public health (2012)',
  ],
  values: ['Faith', 'Family', 'Service', 'Learning', 'Hospitality'],
};

export const DEMO_TIMELINE = [
  { year: 1956, month: 11, title: 'Born in Enugu', category: 'BIRTH', description: 'The second of four children, born to a bookseller and a mathematics teacher.', image: 'sepia' },
  { year: 1968, month: null, title: 'A love of learning', category: 'EDUCATION', description: 'Top of her class at Queen\'s School, and already reading her father\'s textbooks.', image: 'sepia' },
  { year: 1975, month: 9, title: 'Medical school', category: 'EDUCATION', description: 'Began her medical training at the University of Ibadan.', image: null },
  { year: 1976, month: 4, title: 'Married Emeka', category: 'FAMILY', description: 'A wedding in Enugu with three hundred guests and one very long speech.', image: 'rose' },
  { year: 1978, month: null, title: 'Motherhood', category: 'FAMILY', description: 'Welcomed Ngozi, followed by Chidi in 1981 and Amara in 1985.', image: 'garden' },
  { year: 1981, month: 7, title: 'Qualified as a doctor', category: 'CAREER', description: 'Graduated with distinction and began work in rural clinics.', image: 'ivory' },
  { year: 1994, month: 1, title: 'Head of paediatrics', category: 'CAREER', description: 'Founded the paediatrics department at a Lagos teaching hospital.', image: null },
  { year: 2005, month: null, title: 'The mobile clinic', category: 'ACHIEVEMENT', description: 'Launched a mobile maternal-health clinic reaching villages across three states.', image: 'emerald' },
  { year: 2012, month: 10, title: 'National recognition', category: 'ACHIEVEMENT', description: 'Received a national award for service to public health.', image: 'night' },
  { year: 2016, month: null, title: 'A new chapter', category: 'MILESTONE', description: 'Retired from the hospital and began mentoring young doctors.', image: null },
  { year: 2023, month: null, title: 'A great-grandmother', category: 'FAMILY', description: 'Kemi and David welcomed Adaeze, named after her great-grandmother. Tomiwa followed in 2025.', image: 'dusk' },
  { year: 2026, month: 11, title: 'Seventy years', category: 'MILESTONE', description: 'A celebration of a life of love, faith and service.', image: 'emerald' },
] as const;

/**
 * Demo family: generation -1 parents, 0 the celebrant, her husband and her siblings (with
 * spouses), 1 children (married and single), 2 grandchildren, 3 great-grandchildren.
 */
export const DEMO_FAMILY = [
  { key: 'father', fullName: 'Chief Josiah Nnamdi Eze', relationshipLabel: 'Father', generation: -1, birthYear: 1924, deathYear: 1999, bio: 'Mathematics teacher and headmaster for thirty years.' },
  { key: 'mother', fullName: 'Mrs. Grace Ifeoma Eze', relationshipLabel: 'Mother', generation: -1, birthYear: 1930, deathYear: 2014, bio: 'Ran the family bookshop in Enugu and never let a child leave without a book.' },
  { key: 'margaret', fullName: 'Dr. Margaret Adaeze Okonkwo', relationshipLabel: 'The celebrant', generation: 0, birthYear: 1956, isCelebrant: true, bio: 'Physician, mentor, mother, grandmother and great-grandmother.' },
  { key: 'emeka', fullName: 'Engr. Emeka Okonkwo', relationshipLabel: 'Husband', generation: 0, birthYear: 1953, bio: 'Civil engineer, gardener and the family storyteller.' },
  { key: 'obi', fullName: 'Justice Obinna Eze', relationshipLabel: 'Brother', generation: 0, birthYear: 1953, bio: 'The eldest, now a retired judge.' },
  { key: 'ifeoma', fullName: 'Mrs. Ifeoma Eze', relationshipLabel: 'Sister-in-law', generation: 0, birthYear: 1955, bio: 'Retired headmistress and a formidable Scrabble player.' },
  { key: 'chioma', fullName: 'Chioma Eze-Adeyemi', relationshipLabel: 'Sister', generation: 0, birthYear: 1960, bio: "Architect and the family's unofficial event planner." },
  { key: 'femi', fullName: 'Femi Adeyemi', relationshipLabel: 'Brother-in-law', generation: 0, birthYear: 1958, bio: 'Photographer who has taken most of the pictures in these albums.' },
  { key: 'uche', fullName: 'Uchenna Eze', relationshipLabel: 'Youngest brother', generation: 0, birthYear: 1964, bio: 'Music teacher, and the reason everyone at family gatherings sings.' },
  { key: 'ngozi', fullName: 'Ngozi Okonkwo-Bello', relationshipLabel: 'Daughter', generation: 1, birthYear: 1978, bio: "Paediatrician, following in her mother's footsteps." },
  { key: 'tunde', fullName: 'Tunde Bello', relationshipLabel: 'Son-in-law', generation: 1, birthYear: 1975, bio: 'Banker and devoted Sunday-lunch attendee.' },
  { key: 'chidi', fullName: 'Chidi Okonkwo', relationshipLabel: 'Son', generation: 1, birthYear: 1981, bio: 'Software engineer in Toronto.' },
  { key: 'ada', fullName: 'Adaora Okonkwo', relationshipLabel: 'Daughter-in-law', generation: 1, birthYear: 1983, bio: 'Pharmacist and keen choir soprano.' },
  { key: 'amara', fullName: 'Amarachi Okonkwo', relationshipLabel: 'Daughter', generation: 1, birthYear: 1985, bio: 'Lawyer and the youngest, still called "baby" at family gatherings.' },
  { key: 'kemi', fullName: 'Kemi Bello-Ade', relationshipLabel: 'Granddaughter', generation: 2, birthYear: 1999, bio: 'Loves maths, just like her great-grandfather.' },
  { key: 'david', fullName: 'David Ade', relationshipLabel: "Granddaughter's husband", generation: 2, birthYear: 1997, bio: 'Architect, trained by Aunty Chioma.' },
  { key: 'tobi', fullName: 'Tobi Bello', relationshipLabel: 'Grandson', generation: 2, birthYear: 2002, bio: 'Studying engineering, like his grandfather.' },
  { key: 'nneka', fullName: 'Nneka Bello', relationshipLabel: 'Granddaughter', generation: 2, birthYear: 2005, bio: 'The loudest singer at Sunday lunch.' },
  { key: 'zara', fullName: 'Zara Okonkwo', relationshipLabel: 'Granddaughter', generation: 2, birthYear: 2004, bio: 'Reads under the covers with a torch.' },
  { key: 'eli', fullName: 'Eli Okonkwo', relationshipLabel: 'Grandson', generation: 2, birthYear: 2008, bio: 'Asks "why" about everything.' },
  { key: 'ogg1', fullName: 'Adaeze Ade', relationshipLabel: 'Great-granddaughter', generation: 3, birthYear: 2023, bio: 'Named after her great-grandmother.' },
  { key: 'ogg2', fullName: 'Tomiwa Ade', relationshipLabel: 'Great-grandson', generation: 3, birthYear: 2025, bio: 'The newest member of the family.' },
] as const;

const parentsOf = (a: string, b: string, children: string[]): [string, string, 'PARENT_OF'][] =>
  children.flatMap((child) => [
    [a, child, 'PARENT_OF'] as [string, string, 'PARENT_OF'],
    [b, child, 'PARENT_OF'] as [string, string, 'PARENT_OF'],
  ]);

export const DEMO_RELATIONS: [string, string, 'PARENT_OF' | 'SPOUSE_OF'][] = [
  ['father', 'mother', 'SPOUSE_OF'],
  ...parentsOf('father', 'mother', ['obi', 'margaret', 'chioma', 'uche']),
  ['margaret', 'emeka', 'SPOUSE_OF'],
  ['obi', 'ifeoma', 'SPOUSE_OF'],
  ['chioma', 'femi', 'SPOUSE_OF'],
  ...parentsOf('margaret', 'emeka', ['ngozi', 'chidi', 'amara']),
  ['ngozi', 'tunde', 'SPOUSE_OF'],
  ['chidi', 'ada', 'SPOUSE_OF'],
  ...parentsOf('ngozi', 'tunde', ['kemi', 'tobi', 'nneka']),
  ...parentsOf('chidi', 'ada', ['zara', 'eli']),
  ['kemi', 'david', 'SPOUSE_OF'],
  ...parentsOf('kemi', 'david', ['ogg1', 'ogg2']),
];

export const DEMO_ALBUMS = [
  { slug: 'childhood', title: 'Childhood', description: 'Enugu in the 1960s: the bookshop, the schoolyard and the long walk home.', palette: 'sepia', count: 5 },
  { slug: 'family', title: 'Family', description: 'Weddings, christenings and a great many Sunday lunches.', palette: 'rose', count: 6 },
  { slug: 'career', title: 'Career', description: 'Thirty-five years of medicine, teaching and mentoring.', palette: 'ivory', count: 5 },
  { slug: 'friends', title: 'Friends', description: 'Classmates, colleagues and choir companions of many decades.', palette: 'garden', count: 5 },
  { slug: 'special-memories', title: 'Special Memories', description: 'The moments the family returns to again and again.', palette: 'dusk', count: 5 },
  { slug: 'recent-photos', title: 'Recent Photos', description: 'The last few years, with the grandchildren in charge.', palette: 'emerald', count: 6 },
  { slug: 'celebration-night', title: 'Celebration Night', description: 'Photos shared by guests on the night.', palette: 'night', count: 0 },
] as const;

export const DEMO_CATEGORIES = [
  { name: 'Family', description: 'Relatives near and far', defaultCompanions: 3, capacity: 90, selfSelectable: true, color: '#0B3D35' },
  { name: 'Friends', description: 'Friends of the family', defaultCompanions: 1, capacity: 60, selfSelectable: true, color: '#12665A' },
  { name: 'Colleagues', description: 'From medicine and the hospital years', defaultCompanions: 1, capacity: 40, selfSelectable: true, color: '#B88A35' },
  { name: 'Church & Community', description: 'Choir, church and community groups', defaultCompanions: 1, capacity: 40, selfSelectable: true, color: '#6F6A61' },
  { name: 'Honoured Guests', description: 'Invited by the family', defaultCompanions: 2, capacity: 20, selfSelectable: false, color: '#071A2B' },
];

export const DEMO_QUESTIONS = [
  { label: 'Will you join the thanksgiving service at 10:00 AM on the day?', helpText: 'St. Andrew\'s Church, a short drive from the venue.', type: 'SELECT' as const, options: ['Yes', 'No', 'Not sure yet'], required: true },
  { label: 'A song that reminds you of Margaret', helpText: 'The band will play as many as they can.', type: 'TEXT' as const, options: [], required: false },
  { label: 'I would like to say a few words during the tributes', helpText: null, type: 'CHECKBOX' as const, options: [], required: false },
];

export const DEMO_PROGRAMME = [
  { startTime: '17:00', endTime: '17:45', title: 'Guest Arrival', description: 'Welcome drinks and canapés on the terrace.', speaker: null, location: 'Garden Terrace' },
  { startTime: '17:45', endTime: '18:00', title: 'Welcome', description: 'Opening words from the family.', speaker: 'Ngozi Okonkwo-Bello', location: 'Emerald Ballroom' },
  { startTime: '18:00', endTime: '18:15', title: 'Thanksgiving Prayer', description: null, speaker: 'Rev. Canon Peter Obi', location: 'Emerald Ballroom' },
  { startTime: '18:15', endTime: '19:30', title: 'Dinner', description: 'A three-course dinner with dishes from Margaret\'s favourite recipes.', speaker: null, location: 'Emerald Ballroom' },
  { startTime: '19:30', endTime: '20:15', title: 'Tributes', description: 'Words from family, friends and colleagues, and a short film.', speaker: null, location: 'Emerald Ballroom' },
  { startTime: '20:15', endTime: '20:30', title: 'Birthday Toast & Cake', description: null, speaker: 'Engr. Emeka Okonkwo', location: 'Emerald Ballroom' },
  { startTime: '20:30', endTime: '23:00', title: 'Music & Dancing', description: 'Highlife classics and a few surprises.', speaker: 'The Palm Grove Band', location: 'Emerald Ballroom' },
];

export const DEMO_GUESTS: { name: string; category: string; companions: string[]; response: 'ATTENDING' | 'DECLINED' | null; dietary?: string; accessibility?: string; revoked?: boolean }[] = [
  { name: 'Folake Adeyemi', category: 'Family', companions: ['Bayo Adeyemi', 'Tolu Adeyemi'], response: 'ATTENDING', dietary: 'No pork' },
  { name: 'Ifeanyi Nwosu', category: 'Friends', companions: ['Chiamaka Nwosu'], response: 'ATTENDING' },
  { name: 'Dr. Samuel Ogunleye', category: 'Colleagues', companions: ['Dr. Funmi Ogunleye'], response: 'ATTENDING' },
  { name: 'Hauwa Musa', category: 'Colleagues', companions: [], response: 'ATTENDING', dietary: 'Vegetarian' },
  { name: 'Grace Okafor', category: 'Church & Community', companions: ['Paul Okafor'], response: 'ATTENDING', accessibility: 'Uses a walking frame; a seat near the entrance please' },
  { name: 'Emmanuel Johnson', category: 'Friends', companions: [], response: 'DECLINED' },
  { name: 'Aisha Bello', category: 'Family', companions: ['Musa Bello', 'Fatima Bello', 'Ibrahim Bello'], response: 'ATTENDING' },
  { name: 'Kelechi Obi', category: 'Family', companions: ['Uche Obi'], response: 'ATTENDING' },
  { name: 'Prof. Janet Williams', category: 'Honoured Guests', companions: ['Richard Williams'], response: 'ATTENDING' },
  { name: 'Rev. Canon Peter Obi', category: 'Honoured Guests', companions: ['Mrs. Ruth Obi'], response: 'ATTENDING' },
  { name: 'Yemi Alade-Cole', category: 'Friends', companions: [], response: null },
  { name: 'Chukwuma Eze', category: 'Family', companions: [], response: null },
  { name: 'Blessing Ade', category: 'Church & Community', companions: [], response: 'ATTENDING', dietary: 'Gluten free' },
  { name: 'Oluwaseun Martins', category: 'Colleagues', companions: ['Ronke Martins'], response: 'ATTENDING' },
  { name: 'Damilola Hassan', category: 'Friends', companions: ['Kunle Hassan'], response: 'DECLINED' },
  { name: 'Nkechi Umeh', category: 'Family', companions: ['Obinna Umeh', 'Chika Umeh'], response: 'ATTENDING' },
  { name: 'Tariq Ahmed', category: 'Colleagues', companions: [], response: null, revoked: true },
  { name: 'Mary Etim', category: 'Church & Community', companions: [], response: 'ATTENDING' },
];

export const DEMO_TESTIMONIALS: {
  authorName: string;
  relationship: string;
  message: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  isPublic?: boolean;
  isFeatured?: boolean;
  photo?: boolean;
}[] = [
  { authorName: 'Ngozi Okonkwo-Bello', relationship: 'Daughter', status: 'APPROVED', isPublic: true, isFeatured: true, photo: true, message: 'Mummy, you taught us that a full table is a full heart. Every Sunday, every exam, every heartbreak, you were there with food, prayer and the right words. Happy seventieth to the woman who made us who we are.' },
  { authorName: 'Dr. Samuel Ogunleye', relationship: 'Former colleague', status: 'APPROVED', isPublic: true, message: 'I arrived at the hospital as a nervous house officer. Dr. Okonkwo gave me her pager, her patience and, on one memorable night, her dinner. Half the paediatricians in Lagos owe her their careers. Happy birthday, Madam.' },
  { authorName: 'Chioma Eze-Adeyemi', relationship: 'Sister', status: 'APPROVED', isPublic: true, photo: true, message: 'Sixty-six years of being your little sister: borrowing your books, your shoes and your good sense. Seventy looks wonderful on you, Ada.' },
  { authorName: 'Grace Okafor', relationship: 'Choir member', status: 'APPROVED', isPublic: true, message: 'Our alto section would be lost without you, in every sense. Thank you for the harmonies, the chin-chin and the prayers. Happy birthday!' },
  { authorName: 'Kemi Bello', relationship: 'Granddaughter', status: 'APPROVED', isPublic: true, message: 'Happy birthday Grandma! You are the best at stories and puff-puff. I love you seventy times a hundred.' },
  { authorName: 'Hauwa Musa', relationship: 'Mentee', status: 'APPROVED', isPublic: false, message: 'You told me medicine needed more women who would not be quiet. I have not been quiet since. Thank you for everything.' },
  { authorName: 'Ifeanyi Nwosu', relationship: 'Family friend', status: 'PENDING', message: 'Forty years of friendship and you still beat me at Scrabble. Wishing you health, joy and many more birthdays.' },
  { authorName: 'Blessing Ade', relationship: 'Scholarship alumna', status: 'PENDING', message: 'Your scholarship paid for my chemistry degree. Today I teach science to girls in my hometown. Your legacy is in every one of them.' },
  { authorName: 'Anonymous', relationship: '', status: 'REJECTED', message: 'Buy cheap followers now!!! Visit our site for the best deals.' },
];
